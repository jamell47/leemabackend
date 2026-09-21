import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'

export const getCart = async (req, res, next) => {
  try {
    const userId = req.user?.id
    const sessionId = req.headers['x-session-id'] || req.query.sessionId
    if (!userId && !sessionId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const where = userId ? { userId } : { sessionId }
    const cart = await prisma.cart.findUnique({
      where,
      include: { items: { include: { product: true } } },
    })

    if (!cart) {
      return res.json({
        success: true,
        data: { cartId: null, sessionId: sessionId || null, items: [], subtotal: 0, deliveryFee: 0, total: 0, itemCount: 0 },
      })
    }

    const items = cart.items.map((i) => ({
      id: i.id, productId: i.productId, quantity: i.quantity, price: i.price,
      product: { id: i.product.id, name: i.product.name, image: i.product.image, unit: i.product.unit },
    }))

    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
    const deliveryFee = subtotal >= 2000 ? 0 : 150

    res.json({
      success: true,
      data: { cartId: cart.id, sessionId: cart.sessionId, items, subtotal, deliveryFee, total: subtotal + deliveryFee, itemCount: items.reduce((s, i) => s + i.quantity, 0) },
    })
  } catch (error) { next(error) }
}

export const addToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body
    const userId = req.user?.id
    const sessionId = req.headers['x-session-id'] || req.query.sessionId
    if (!userId && !sessionId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND')
    if (!product.isAvailable) throw new AppError('Product not available', 400, 'NOT_AVAILABLE')
    if (product.stock < quantity) throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK')

    const where = userId ? { userId } : { sessionId }
    let cart = await prisma.cart.findUnique({ where, include: { items: true } })
    if (!cart) {
      cart = await prisma.cart.create({ data: { [userId ? 'userId' : 'sessionId']: userId || sessionId } })
    }

    const existing = cart.items?.find((i) => i.productId === productId)
    if (existing && product.stock < existing.quantity + quantity) {
      throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK')
    }

    let item
    if (existing) {
      item = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
        include: { product: true },
      })
    } else {
      item = await prisma.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        create: { cartId: cart.id, productId, quantity, price: product.price },
        update: { quantity: { increment: quantity } },
        include: { product: true },
      })
    }

    res.status(201).json({
      success: true,
      message: existing ? 'Quantity updated' : 'Added to cart',
      data: { id: item.id, productId: item.productId, quantity: item.quantity, price: item.price, product: { id: item.product.id, name: item.product.name, image: item.product.image, unit: item.product.unit } },
    })
  } catch (error) { next(error) }
}

export const updateCartItem = async (req, res, next) => {
  try {
    const { id } = req.params
    const { quantity } = req.body
    if (quantity < 1) return await removeCartItem(req, res, next)

    const item = await prisma.cartItem.findUnique({ where: { id }, include: { product: true, cart: true } })
    if (!item) throw new AppError('Cart item not found', 404, 'NOT_FOUND')

    const userId = req.user?.id
    const sessionId = req.headers['x-session-id']
    if (userId && item.cart.userId !== userId) throw new AppError('Unauthorized', 403, 'FORBIDDEN')
    if (!userId && item.cart.sessionId !== sessionId) throw new AppError('Unauthorized', 403, 'FORBIDDEN')

    if (item.product.stock < quantity) throw new AppError('Insufficient stock', 400, 'INSUFFICIENT_STOCK')

    const updated = await prisma.cartItem.update({
      where: { id },
      data: { quantity },
      include: { product: true },
    })

    res.json({
      success: true,
      data: { id: updated.id, productId: updated.productId, quantity: updated.quantity, price: updated.price, product: { id: updated.product.id, name: updated.product.name, image: updated.product.image, unit: updated.product.unit } },
    })
  } catch (error) { next(error) }
}

export const removeCartItem = async (req, res, next) => {
  try {
    const { id } = req.params
    const item = await prisma.cartItem.findUnique({ where: { id }, include: { cart: true } })
    if (!item) throw new AppError('Cart item not found', 404, 'NOT_FOUND')

    const userId = req.user?.id
    const sessionId = req.headers['x-session-id']
    if (userId && item.cart.userId !== userId) throw new AppError('Unauthorized', 403, 'FORBIDDEN')
    if (!userId && item.cart.sessionId !== sessionId) throw new AppError('Unauthorized', 403, 'FORBIDDEN')

    await prisma.cartItem.delete({ where: { id } })
    res.json({ success: true, message: 'Item removed' })
  } catch (error) { next(error) }
}

export const clearCart = async (req, res, next) => {
  try {
    const userId = req.user?.id
    const sessionId = req.headers['x-session-id'] || req.query.sessionId
    if (!userId && !sessionId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const where = userId ? { userId } : { sessionId }
    const cart = await prisma.cart.findUnique({ where })
    if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })

    res.json({ success: true, message: 'Cart cleared' })
  } catch (error) { next(error) }
}

export default { getCart, addToCart, updateCartItem, removeCartItem, clearCart }
