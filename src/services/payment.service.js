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

  let stkResult
  try {
    stkResult = await mpesaService.initiateStkPush({ phone, amount, orderNumber })
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', resultDescription: error.message },
    })
    await orderService.releaseStockForOrder(order.id)
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
    throw error
  }

  // Update payment with STK details
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      merchantRequestId: stkResult.merchantRequestId,
      checkoutRequestId: stkResult.checkoutRequestId,
      status: stkResult.success ? 'PENDING' : 'FAILED',
      resultDescription: stkResult.responseDescription,
    },
  })

  // If STK push failed, update order status to CANCELLED
  if (!stkResult.success) {
    await orderService.releaseStockForOrder(order.id)
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' },
    })
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
    // Callback for unknown transaction - log but don't error
    console.log('Callback for unknown transaction:', { checkoutRequestId, merchantRequestId })
    return { processed: false, message: 'Payment not found' }
  }

  // Parse callback and determine status
  const { getCallbackStatus } = await import('./mpesa.service.js')
  const statusInfo = getCallbackStatus(callbackData)

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

  // Update order status based on payment result
  if (statusInfo.paymentStatus === 'SUCCESS') {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'PAID' },
    })
  } else if (statusInfo.paymentStatus === 'FAILED' || statusInfo.paymentStatus === 'CANCELLED') {
    // Release stock (if any was reserved) and cancel order
    if (payment.order.status === 'PAYMENT_PENDING' || payment.order.status === 'PAID') {
      await orderService.releaseStockForOrder(payment.orderId)
      await prisma.order.update({
        where: { id: payment.orderId },
        data: { status: 'CANCELLED' },
      })
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
