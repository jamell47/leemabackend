import express from 'express'
import { authenticate, optionalAuth } from '../middleware/auth.middleware.js'
import * as cartController from '../controllers/cart.controller.js'

const router = express.Router()

// All cart routes use optionalAuth (supports both authenticated and guest users)
router.get('/', optionalAuth, cartController.getCart)
router.post('/items', optionalAuth, cartController.addToCart)
router.put('/items/:id', optionalAuth, cartController.updateCartItem)
router.delete('/items/:id', optionalAuth, cartController.removeCartItem)
router.delete('/', optionalAuth, cartController.clearCart)

export default router
