import express from 'express'
import { authenticate, optionalAuth } from '../middleware/auth.middleware.js'
import { requireAdmin } from '../middleware/auth.middleware.js'
import * as orderController from '../controllers/order.controller.js'

const router = express.Router()

// Checkout (creates order + initiates payment)
router.post('/checkout', optionalAuth, orderController.createOrder)

// Get order by order number (public, but requires order number)
router.get('/number/:orderNumber', optionalAuth, orderController.getOrderByNumber)

// Get single order
router.get('/:id', authenticate, orderController.getOrder)

// Get all orders (admin) or user's orders
router.get('/', authenticate, orderController.getOrders)

// Update order status (admin only)
router.put('/:id/status', authenticate, requireAdmin, orderController.updateOrderStatus)

export default router
