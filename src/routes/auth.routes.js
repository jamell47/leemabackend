import express from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js'
import * as authController from '../controllers/auth.controller.js'

const router = express.Router()

// Public routes
router.post('/register', authController.register)
router.post('/login', authController.login)

// Protected routes
router.get('/profile', authenticate, authController.getProfile)
router.put('/profile', authenticate, authController.updateProfile)
router.put('/profile/password', authenticate, authController.changePassword)

// Admin routes
router.get('/users', authenticate, requireAdmin, authController.getAllUsers)
router.delete('/users/:userId', authenticate, requireAdmin, authController.deleteUser)

export default router
