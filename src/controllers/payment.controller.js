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

    const parsedCallback = mpesaService.parseCallback(callbackData)

    const result = await paymentService.processCallback(parsedCallback)

    // Always return success to Daraja to avoid retries
    res.json({
     ResultCode: result.processed ? '0' : '1',
      ResultDesc: result.processed ? 'Callback processed successfully' : 'Payment not found',
    })
  } catch (error) {
    console.error('Callback processing error:', error)
    // Return error to Daraja
    res.status(500).json({
      ResultCode: '1',
      ResultDesc: 'Internal server error',
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
