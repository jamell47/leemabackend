import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'
import mpesaService from './mpesa.service.js'
import orderService from './order.service.js'

/**
 * Payment Service
 * Handles payment processing and callback handling
 */

/**
 * Initiate STK Push payment
 */
export const initiatePayment = async ({ orderId, phone, amount, orderNumber }) => {
  // Get the order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  })

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND')
  }

  // Check order status
  if (order.status !== 'PAYMENT_PENDING') {
    throw new AppError('Order is not in payment pending status', 400, 'INVALID_STATUS')
  }

  const payment = order.payment || await prisma.payment.create({
    data: { orderId: order.id, amount, phone, method: 'MPESA', status: 'PENDING' },
  })

  console.log('[Payment Service] === Initiating payment ===')
  console.log(`[Payment Service] Order ID:     ${order.id}`)
  console.log(`[Payment Service] Order Number: ${order.orderNumber}`)
  console.log(`[Payment Service] Order Status: ${order.status}`)
  console.log(`[Payment Service] Payment ID:   ${payment.id}`)
  console.log(`[Payment Service] Payment Status: ${payment.status}`)
  console.log(`[Payment Service] Amount:       ${amount}`)
  console.log(`[Payment Service] Phone:        ${phone.replace(/(\d{2})\d{6}(\d{4})/, '$1******$2')}`)

  let stkResult
  try {
    stkResult = await mpesaService.initiateStkPush({ phone, amount, orderNumber })
  } catch (error) {
    console.error('[Payment Service] === STK Push initiation FAILED ===')
    console.error(`[Payment Service] Error: ${error.message}`)

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', resultDescription: error.message },
    })
    await orderService.releaseStockForOrder(order.id)
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
    throw error
  }

  // Update payment with STK details
  const newStatus = stkResult.success ? 'PENDING' : 'FAILED'
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      merchantRequestId: stkResult.merchantRequestId,
      checkoutRequestId: stkResult.checkoutRequestId,
      status: newStatus,
      resultDescription: stkResult.responseDescription,
    },
  })

  console.log('[Payment Service] === Payment record updated with STK details ===')
  console.log(`[Payment Service] STK success:     ${stkResult.success}`)
  console.log(`[Payment Service] merchantRequestId: ${stkResult.merchantRequestId || 'NOT SET'}`)
  console.log(`[Payment Service] checkoutRequestId: ${stkResult.checkoutRequestId || 'NOT SET'}`)
  console.log(`[Payment Service] responseCode:    ${stkResult.responseCode || 'NOT SET'}`)
  console.log(`[Payment Service] New payment status: ${newStatus}`)

  // If STK push failed, release stock and cancel order
  if (!stkResult.success) {
    console.error('[Payment Service] === STK Push failed — releasing stock and cancelling order ===')
    await orderService.releaseStockForOrder(order.id)
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    })
    console.error('[Payment Service] Order status updated to: CANCELLED')
  } else {
    console.log('[Payment Service] STK Push accepted by Daraja — awaiting callback. Payment stays PENDING.')
  }

  return {
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    stkPush: {
      success: stkResult.success,
      checkoutRequestId: stkResult.checkoutRequestId,
      message: stkResult.responseDescription,
    },
  }
}

/**
 * Process M-Pesa callback
 * This should be idempotent
 */
export const processCallback = async (callbackData) => {
  const { checkoutRequestId, merchantRequestId } = callbackData

  console.log('[Payment Service] === Processing callback ===')
  console.log(`[Payment Service] checkoutRequestId: ${checkoutRequestId || 'NOT SET'}`)
  console.log(`[Payment Service] merchantRequestId:  ${merchantRequestId || 'NOT SET'}`)
  console.log(`[Payment Service] resultCode:         ${callbackData.resultCode || 'NOT SET'}`)
  console.log(`[Payment Service] resultDescription:  ${callbackData.resultDescription}`)

  // Find payment by checkoutRequestId or merchantRequestId
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { checkoutRequestId },
        { merchantRequestId },
      ],
      callbackProcessed: false, // Only process unprocessed callbacks
    },
    include: { order: true },
  })

  if (!payment) {
    // Callback for unknown transaction or duplicate callback — log but don't error
    console.log('[Payment Service] Callback for unknown/duplicate transaction — already processed or not found.')
    return { processed: false, message: 'Payment not found' }
  }

  console.log('[Payment Service] Payment found:')
  console.log(`[Payment Service]   Payment ID:  ${payment.id}`)
  console.log(`[Payment Service]   Order ID:    ${payment.orderId}`)
  console.log(`[Payment Service]   Current status: ${payment.status}`)
  console.log(`[Payment Service]   callbackProcessed: ${payment.callbackProcessed}`)

  // Parse callback and determine status
  const { getCallbackStatus } = await import('./mpesa.service.js')
  const statusInfo = getCallbackStatus(callbackData)

  console.log('[Payment Service] Determined status:')
  console.log(`[Payment Service]   paymentStatus: ${statusInfo.paymentStatus}`)
  console.log(`[Payment Service]   orderStatus:   ${statusInfo.orderStatus}`)
  console.log(`[Payment Service]   message:       ${statusInfo.message}`)

  // Update payment
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: statusInfo.paymentStatus,
      mpesaReceiptNumber: callbackData.receiptNumber,
      resultCode: callbackData.resultCode,
      resultDescription: callbackData.resultDescription,
      transactionDate: callbackData.transactionDate,
      callbackProcessed: true,
    },
  })

  console.log('[Payment Service] === Payment updated ===')
  console.log(`[Payment Service]   New payment status: ${statusInfo.paymentStatus}`)
  console.log(`[Payment Service]   callbackProcessed: true`)

  // Update order status based on payment result
  if (statusInfo.paymentStatus === 'SUCCESS') {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'PAID' },
    })
    console.log('[Payment Service] Order status updated to: PAID (stock NOT restored)')
  } else if (statusInfo.paymentStatus === 'FAILED' || statusInfo.paymentStatus === 'CANCELLED') {
    // Release stock (if any was reserved) and cancel order — but only if
    // the order hasn't already been cancelled (idempotency guard)
    if (payment.order.status === 'PAYMENT_PENDING' || payment.order.status === 'PAID') {
      console.log('[Payment Service] === Payment failed/cancelled — releasing stock ===')
      await orderService.releaseStockForOrder(payment.orderId)
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'CANCELLED' },
      })
      console.log('[Payment Service] Order status updated to: CANCELLED (stock restored)')
    } else {
      console.log(`[Payment Service] Order already ${payment.order.status} — stock not touched (idempotent).`)
    }
  }

  return {
    processed: true,
    paymentId: payment.id,
    orderId: payment.orderId,
    newStatus: statusInfo.paymentStatus,
    orderStatus: statusInfo.orderStatus,
    message: statusInfo.message,
  }
}

/**
 * Get payment by ID
 */
export const getPayment = async (paymentId, userId = null, isAdmin = false) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      order: {
        include: {
          items: true,
        },
      },
    },
  })

  if (!payment) {
    throw new AppError('Payment not found', 404, 'NOT_FOUND')
  }

  // Check authorization
  if (!isAdmin && payment.order.userId !== null && payment.order.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN')
  }

  return payment
}

/**
 * Get payment by order ID
 */
export const getPaymentByOrderId = async (orderId, userId = null, isAdmin = false) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true },
  })

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND')
  }

  if (!isAdmin && order.userId !== null && order.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN')
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId },
  })

  return payment
}

export default {
  initiatePayment,
  processCallback,
  getPayment,
  getPaymentByOrderId,
}
