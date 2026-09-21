import express from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import * as paymentController from '../controllers/payment.controller.js'

const router = express.Router()

// STK Push endpoint - frontend calls this to initiate payment
router.post('/mpesa/stk-push', authenticate, paymentController.initiateStkPush)

// M-Pesa callback endpoint - Daraja calls this
router.post('/mpesa/callback', paymentController.handleCallback)

// Get payment by ID
router.get('/:id', authenticate, paymentController.getPayment)

// Get payment by order ID
router.get('/order/:orderId', paymentController.getPaymentByOrderId)

export default router
