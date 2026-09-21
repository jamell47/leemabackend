import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'
import orderService from '../services/order.service.js'
import paymentService from '../services/payment.service.js'

export const createOrder = async (req, res, next) => {
  try {
    const userId = req.user?.id
    const { customerName, phone, email, items } = req.body

    if (!customerName || !phone || !items?.length) {
      throw new AppError('Customer name, phone, and items are required', 400, 'VALIDATION_ERROR')
    }

    const result = await orderService.createOrder({
      customerName, phone, email: email || null, items, userId: userId || null,
    })
    const paymentResult = await paymentService.initiatePayment({
      orderId: result.order.id,
      phone: result.order.phone,
      amount: result.order.totalAmount,
      orderNumber: result.order.orderNumber,
    })

    res.status(201).json({
      success: true,
      message: paymentResult.payment.status === 'FAILED'
        ? 'Failed to initiate payment. Please try again.'
        : 'Order created. M-Pesa prompt sent to your phone.',
      data: {
        order: { id: result.order.id, orderNumber: result.order.orderNumber, status: result.order.status, totalAmount: result.order.totalAmount, customerName: result.order.customerName, phone: result.order.phone },
        payment: { id: paymentResult.payment.id, status: paymentResult.payment.status, checkoutRequestId: paymentResult.payment.checkoutRequestId },
        message: paymentResult.payment.status === 'FAILED' ? 'Failed to initiate M-Pesa payment. Please try again.' : 'M-Pesa prompt sent. Please enter your PIN to complete payment.',
      },
    })
  } catch (error) { next(error) }
}

export const getOrder = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN'
    const order = await orderService.getOrder(id, userId, isAdmin)

    res.json({
      success: true,
      data: {
        id: order.id, orderNumber: order.orderNumber, customerName: order.customerName,
        phone: order.phone, email: order.email, totalAmount: order.totalAmount,
        deliveryFee: order.deliveryFee, status: order.status, createdAt: order.createdAt, updatedAt: order.updatedAt,
        items: order.items.map((i) => ({ id: i.id, productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
        payment: order.payment ? { id: order.payment.id, amount: order.payment.amount, phone: order.payment.phone, method: order.payment.method, status: order.payment.status, mpesaReceiptNumber: order.payment.mpesaReceiptNumber, transactionDate: order.payment.transactionDate } : null,
      },
    })
  } catch (error) { next(error) }
}

export const getOrders = async (req, res, next) => {
  try {
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN'
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20

    const result = await orderService.getOrders(userId, isAdmin, page, limit)

    res.json({
      success: true,
      data: {
        orders: result.orders.map((o) => ({
          id: o.id, orderNumber: o.orderNumber, customerName: o.customerName,
          phone: o.phone, totalAmount: o.totalAmount, status: o.status,
          createdAt: o.createdAt, itemCount: o.items.length, paymentStatus: o.payment?.status,
        })),
        pagination: result.pagination,
      },
    })
  } catch (error) { next(error) }
}

export const updateOrderStatus = async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') throw new AppError('Admin access required', 403, 'FORBIDDEN')
    const { id } = req.params
    const { status } = req.body
    if (!status) throw new AppError('Status is required', 400, 'VALIDATION_ERROR')

    const order = await orderService.updateOrderStatus(id, status)
    res.json({ success: true, message: `Order status updated to ${status}`, data: { id: order.id, orderNumber: order.orderNumber, status: order.status } })
  } catch (error) { next(error) }
}

export const getOrderByNumber = async (req, res, next) => {
  try {
    const { orderNumber } = req.params
    const userId = req.user?.id
    const isAdmin = req.user?.role === 'ADMIN'
    const order = await orderService.getOrderByNumber(orderNumber, userId, isAdmin)

    res.json({
      success: true,
      data: {
        id: order.id, orderNumber: order.orderNumber, customerName: order.customerName,
        phone: order.phone, email: order.email, totalAmount: order.totalAmount,
        deliveryFee: order.deliveryFee, status: order.status, createdAt: order.createdAt,
        items: order.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
        payment: order.payment ? { id: order.payment.id, amount: order.payment.amount, status: order.payment.status, mpesaReceiptNumber: order.payment.mpesaReceiptNumber } : null,
      },
    })
  } catch (error) { next(error) }
}

export default { createOrder, getOrder, getOrders, updateOrderStatus, getOrderByNumber }
