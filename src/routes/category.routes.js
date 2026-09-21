import express from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js'
import * as categoryController from '../controllers/category.controller.js'

const router = express.Router()

// Public routes
router.get('/', categoryController.getAllCategories)
router.get('/:id', categoryController.getCategory)

// Admin routes
router.post('/', authenticate, requireAdmin, categoryController.createCategory)
router.put('/:id', authenticate, requireAdmin, categoryController.updateCategory)
router.delete('/:id', authenticate, requireAdmin, categoryController.deleteCategory)

export default router
