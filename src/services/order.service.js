import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'
import {
  generateOrderNumber,
  calculateDeliveryFee,
  calculateOrderTotal,
  normalizeKenyanPhone,
  sanitizeString,
  validateEmail,
} from '../utils/helpers.js'

function validateQuantity(value, productName = 'Product') {
  const quantity = Number(value)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new AppError(`Quantity for ${productName} must be a positive integer`, 400, 'INVALID_QUANTITY')
  }
  return quantity
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('At least one item is required', 400, 'INVALID_ORDER')
  }

  const normalized = new Map()
  for (const item of items) {
    if (!item || !item.productId) {
      throw new AppError('Every order item requires a productId', 400, 'INVALID_ORDER_ITEM')
    }
    const quantity = validateQuantity(item.quantity, item.productId)
    const current = normalized.get(item.productId) || 0
    normalized.set(item.productId, current + quantity)
  }

  if ([...normalized.values()].some((quantity) => quantity > 999)) {
    throw new AppError('Order quantity is too large', 400, 'INVALID_QUANTITY')
  }

  return [...normalized.entries()].map(([productId, quantity]) => ({ productId, quantity }))
}

async function createOrderRecord(tx, data) {
  try {
    return await tx.order.create({ data, include: { items: true, payment: true } })
  } catch (error) {
    if (error.code === 'P2002') {
      return createOrderRecord(tx, data)
    }
    throw error
  }
}

export const createOrder = async ({ customerName, phone, email, items, userId = null }) => {
  const normalizedName = sanitizeString(customerName)
  const normalizedPhone = normalizeKenyanPhone(phone)
  const emailValidation = validateEmail(email)
  const normalizedItems = normalizeItems(items)

  if (!normalizedName) throw new AppError('Customer name is required', 400, 'INVALID_CUSTOMER_NAME')
  if (!normalizedPhone) throw new AppError('Invalid phone number', 400, 'INVALID_PHONE')
  if (!emailValidation.valid) throw new AppError(emailValidation.error, 400, 'INVALID_EMAIL')

  const productIds = normalizedItems.map(({ productId }) => productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isAvailable: true },
  })

  if (products.length !== productIds.length) {
    throw new AppError('One or more products are unavailable', 400, 'PRODUCT_UNAVAILABLE')
  }

  const productMap = new Map(products.map((product) => [product.id, product]))
  let subtotal = 0
  const orderItems = normalizedItems.map(({ productId, quantity }) => {
    const product = productMap.get(productId)
    if (!product) throw new AppError(`Product ${productId} is unavailable`, 400, 'PRODUCT_UNAVAILABLE')
    if (product.stock < quantity) {
      throw new AppError(`Insufficient stock for ${product.name}`, 400, 'INSUFFICIENT_STOCK')
    }
    const unitPrice = Number(product.price)
    const itemSubtotal = unitPrice * quantity
    subtotal += itemSubtotal
    return {
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice,
      subtotal: itemSubtotal,
    }
  })

  const deliveryFee = calculateDeliveryFee(subtotal)
  const totalAmount = calculateOrderTotal(subtotal, deliveryFee)
  const orderNumber = generateOrderNumber()

  const order = await prisma.$transaction(async (tx) => {
    const reservations = await Promise.all(orderItems.map((item) =>
      tx.product.updateMany({
        where: {
          id: item.productId,
          isAvailable: true,
          stock: { gte: item.quantity },
        },
        data: { stock: { decrement: item.quantity } },
      }),
    ))

    if (reservations.some((reservation) => reservation.count !== 1)) {
      throw new AppError('Stock changed while creating the order. Please try again.', 409, 'STOCK_CONFLICT')
    }

    return createOrderRecord(tx, {
      orderNumber,
      customerName: normalizedName,
      phone: normalizedPhone,
      email: emailValidation.valid && email ? String(email).trim() : null,
      totalAmount,
      deliveryFee,
      status: 'PAYMENT_PENDING',
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
      payment: {
        create: {
          amount: totalAmount,
          phone: normalizedPhone,
          method: 'MPESA',
          status: 'PENDING',
        },
      },
    })
  })

  return { order, payment: order.payment, orderNumber, subtotal, deliveryFee, totalAmount }
}

export const reserveStockForOrder = async (orderId) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND')
  // Stock is decremented atomically while the payment-pending order is created.
  return order
}

export const releaseStockForOrder = async (orderId) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND')

  await prisma.$transaction(async (tx) => {
    await Promise.all(order.items.map((item) =>
      tx.product.updateMany({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      }),
    ))
  })

  return prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
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
  const safePage = Math.max(1, Math.min(10000, Number.parseInt(page, 10) || 1))
  const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 20))
  const skip = (safePage - 1) * safeLimit
  const where = isAdmin ? {} : { userId }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: { orderBy: { createdAt: 'asc' }, take: 3 }, payment: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
    prisma.order.count({ where }),
  ])

  return {
    orders,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  }
}

export const updateOrderStatus = async (orderId, status) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND')

  const validTransitions = {
    PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
    PAYMENT_PENDING: ['CANCELLED'],
    PAID: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['READY', 'CANCELLED'],
    READY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  }

  if (!validTransitions[order.status]?.includes(status)) {
    throw new AppError(`Cannot transition from ${order.status} to ${status}`, 400, 'INVALID_STATUS_TRANSITION')
  }

  if (status === 'CANCELLED') await releaseStockForOrder(orderId)

  return prisma.order.update({ where: { id: orderId }, data: { status, updatedAt: new Date() } })
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
