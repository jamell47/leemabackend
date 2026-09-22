import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'
import paymentService from '../services/payment.service.js'
import mpesaService from '../services/mpesa.service.js'

export const initiateStkPush = async (req, res, next) => {
  try {
    const userId = req.user?.id
    const { orderId } = req.body

    if (!orderId) {
      throw new AppError('Order ID is required', 400, 'VALIDATION_ERROR')
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    })

    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND')
    }

    if (userId && order.userId !== userId && !req.user?.role?.includes('ADMIN')) {
      throw new AppError('Access denied', 403, 'FORBIDDEN')
    }

    if (order.payment) {
      if (order.payment.status === 'SUCCESS') {
        return res.json({
          success: true,
          message: 'Payment already completed',
          data: {
            payment: {
              id: order.payment.id,
              status: order.payment.status,
              mpesaReceiptNumber: order.payment.mpesaReceiptNumber,
            },
          },
        })
      }

      if (order.payment.checkoutRequestId) {
        return res.json({
          success: true,
          message: 'Payment already initiated',
          data: {
            payment: {
              id: order.payment.id,
              status: order.payment.status,
              checkoutRequestId: order.payment.checkoutRequestId,
            },
          },
        })
      }
    }

    const result = await paymentService.initiatePayment({
      orderId: order.id,
      phone: order.phone,
      amount: order.totalAmount,
      orderNumber: order.orderNumber,
    })

    res.json({
      success: true,
      message: 'M-Pesa prompt sent to your phone',
      data: {
        payment: {
          id: result.payment.id,
          status: result.payment.status,
          checkoutRequestId: result.payment.checkoutRequestId,
        },
        stkPush: result.stkPush,
      },
    })
  } catch (error) {
    if (error.code === 'MPESA_STK_FAILED' || error.code === 'MPESA_AUTH_FAILED') {
      return next(error)
    }
    next(error)
  }
}

export const handleCallback = async (req, res, next) => {
  try {
    const callbackData = req.body
    const stkCallback = callbackData?.Body?.stkCallback

    console.log('[M-Pesa Callback] === Callback received from Daraja ===')
    console.log('[M-Pesa Callback] HTTP Status:    200')
    console.log('[M-Pesa Callback] MerchantRequestID:', stkCallback?.MerchantRequestID || 'NOT SET')
    console.log('[M-Pesa Callback] CheckoutRequestID:', stkCallback?.CheckoutRequestID || stkCallback?.CheckoutRequestId || 'NOT SET')
    console.log('[M-Pesa Callback] ResponseCode:', stkCallback?.ResponseCode || 'NOT SET')
    console.log('[M-Pesa Callback] ResultCode:', stkCallback?.ResultCode || 'NOT SET')
    console.log('[M-Pesa Callback] ResultDesc:', stkCallback?.ResultDesc || 'NOT SET')

    const parsedCallback = mpesaService.parseCallback(callbackData)

    console.log('[M-Pesa Callback] Parsed callback:')
    console.log(`[M-Pesa Callback]   merchantRequestId:  ${parsedCallback.merchantRequestId || 'NOT SET'}`)
    console.log(`[M-Pesa Callback]   checkoutRequestId:  ${parsedCallback.checkoutRequestId || 'NOT SET'}`)
    console.log(`[M-Pesa Callback]   resultCode:         ${parsedCallback.resultCode || 'NOT SET'}`)
    console.log(`[M-Pesa Callback]   resultDescription:  ${parsedCallback.resultDescription}`)
    console.log(`[M-Pesa Callback]   receiptNumber:      ${parsedCallback.receiptNumber || 'NOT SET'}`)

    const result = await paymentService.processCallback(parsedCallback)

    console.log('[M-Pesa Callback] Processing result:')
    console.log(`[M-Pesa Callback]   processed:  ${result.processed}`)
    console.log(`[M-Pesa Callback]   newStatus:  ${result.newStatus || 'NOT SET'}`)
    console.log(`[M-Pesa Callback]   message:    ${result.message}`)

    // Always return HTTP 200 with ResultCode 0 to Daraja so it does not retry.
    // If the callback was a duplicate or unknown, we still acknowledge receipt.
    res.status(200).json({
      ResultCode: '0',
      ResultDesc: 'Callback received and processed',
    })
  } catch (error) {
    console.error('[M-Pesa Callback] === Callback processing FAILED ===')
    console.error('[M-Pesa Callback] Error:', error.message)
    console.error('[M-Pesa Callback] Full error:', error)

    // Always return HTTP 200 to prevent Daraja from retrying with the same
    // (possibly malformed) data. Log internally instead.
    res.status(200).json({
      ResultCode: '0',
      ResultDesc: 'Callback received (processing error logged)',
    })
  }
}

export const getPayment = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN'

    const payment = await paymentService.getPayment(id, userId, isAdmin)

    res.json({
      success: true,
      data: {
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        phone: payment.phone,
        method: payment.method,
        status: payment.status,
        merchantRequestId: payment.merchantRequestId,
        checkoutRequestId: payment.checkoutRequestId,
        mpesaReceiptNumber: payment.mpesaReceiptNumber,
        resultCode: payment.resultCode,
        resultDescription: payment.resultDescription,
        transactionDate: payment.transactionDate,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    })
  } catch (error) { next(error) }
}

export const getPaymentByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN'

    const payment = await paymentService.getPaymentByOrderId(orderId, userId, isAdmin)

    if (!payment) {
      return res.json({
        success: true,
        data: null,
        message: 'No payment record found for this order',
      })
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        phone: payment.phone,
        method: payment.method,
        status: payment.status,
        merchantRequestId: payment.merchantRequestId,
        checkoutRequestId: payment.checkoutRequestId,
        mpesaReceiptNumber: payment.mpesaReceiptNumber,
        resultCode: payment.resultCode,
        resultDescription: payment.resultDescription,
        transactionDate: payment.transactionDate,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    })
  } catch (error) { next(error) }
}

export default { initiateStkPush, handleCallback, getPayment, getPaymentByOrderId }
