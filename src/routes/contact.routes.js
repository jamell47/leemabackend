import express from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js'
import * as contactController from '../controllers/contact.controller.js'

const router = express.Router()

// Public route for submitting contact form
router.post('/submit', contactController.submitContact)

// Admin routes
router.get('/', authenticate, requireAdmin, contactController.getAllContactSubmissions)
router.delete('/:id', authenticate, requireAdmin, contactController.deleteContactSubmission)

export default router
