import prisma from '../config/prisma.js'
import { generateOrderNumber, calculateDeliveryFee, calculateOrderTotal, normalizeKenyanPhone } from '../utils/helpers.js'
import { AppError } from '../middleware/error.middleware.js'
import mpesaService from './mpesa.service.js'

/**
 * Create a new order with M-Pesa payment
 * Stock is NOT decremented here - it's decremented only on successful payment
 * If payment fails, stock remains unchanged
 */
export const createOrder = async ({ customerName, phone, email, items, userId = null }) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('At least one item is required', 400, 'INVALID_ORDER')
  }

  const productIds = items.map((item) => item.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isAvailable: true },
  })

  if (products.length !== productIds.length) {
    throw new AppError('One or more products are unavailable', 400, 'PRODUCT_UNAVAILABLE')
  }

  let subtotal = 0
  const orderItems = []

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId)
    if (!product) continue

    if (product.stock < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name}`, 400, 'INSUFFICIENT_STOCK')
    }

    const itemSubtotal = product.price * item.quantity
    subtotal += itemSubtotal

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      subtotal: itemSubtotal,
    })
  }

  const deliveryFee = calculateDeliveryFee(subtotal)
  const totalAmount = calculateOrderTotal(subtotal, deliveryFee)
  const normalizedPhone = normalizeKenyanPhone(phone)
  if (!normalizedPhone) {
    throw new AppError('Invalid phone number', 400, 'INVALID_PHONE')
  }

  const orderNumber = generateOrderNumber()

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        customerName,
        phone: normalizedPhone,
        email: email || null,
        totalAmount,
        status: 'PAYMENT_PENDING',
        deliveryFee,
        userId: userId || null,
        items: {
          create: orderItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
        },
      },
      include: { items: true },
    })

    return newOrder
  })

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: totalAmount,
      phone: normalizedPhone,
      method: 'MPESA',
      status: 'PENDING',
    },
  })

  return { order, payment, orderNumber }
}

/**
 * Reserve stock for an order (call when payment is confirmed)
 * This should be called from payment callback on SUCCESS
 */
export const reserveStockForOrder = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND')
  }

  // Decrement stock for each item
  for (const item of order.items) {
    await prisma.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.quantity } },
    })
  }

  return order
}

/**
 * Release stock for an order (call when payment fails or is cancelled)
 * This restores stock that was previously reserved
 */
export const releaseStockForOrder = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND')
  }

  // Increment stock for each item (restore)
  for (const item of order.items) {
    await prisma.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    })
  }

  return order
}

export const getOrder = async (orderId, userId = null, isAdmin = false) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      payment: true,
      user: { select: { name: true, email: true } },
    },
  })

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND')

  if (!isAdmin && order.userId !== null && order.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN')
  }

  return order
}

export const getOrderByNumber = async (orderNumber, userId = null, isAdmin = false) => {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true, payment: true },
  })

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND')

  if (!isAdmin && order.userId !== null && order.userId !== userId) {
    throw new AppError('Access denied', 403, 'FORBIDDEN')
  }

  return order
}

export const getOrders = async (userId = null, isAdmin = false, page = 1, limit = 20) => {
  const skip = (page - 1) * limit
  const where = isAdmin ? {} : { userId }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { orderBy: { createdAt: 'asc' }, take: 3 },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ])

  return {
    orders,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export const updateOrderStatus = async (orderId, status) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND')

  const validTransitions = {
    PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
    PAYMENT_PENDING: ['PAID', 'CANCELLED'],
    PAID: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['READY', 'CANCELLED'],
    READY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  }

  if (!validTransitions[order.status]?.includes(status)) {
    throw new AppError(`Cannot transition from ${order.status} to ${status}`, 400, 'INVALID_STATUS_TRANSITION')
  }

  // Handle stock changes on status transitions
  if (status === 'CANCELLED' && (order.status === 'PAYMENT_PENDING' || order.status === 'PAID')) {
    // Release stock if order was cancelled after payment was initiated
    await releaseStockForOrder(orderId)
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { status, updatedAt: new Date() },
  })
}

export default {
  createOrder,
  getOrder,
  getOrderByNumber,
  getOrders,
  updateOrderStatus,
  reserveStockForOrder,
  releaseStockForOrder,
}
