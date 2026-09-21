import express from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js'
import { uploadSingleImage } from '../middleware/upload.middleware.js'
import * as productController from '../controllers/product.controller.js'

const router = express.Router()

// Public routes
router.get('/', productController.getAllProducts)
router.get('/:id', productController.getProduct)

// Admin routes
router.post('/', authenticate, requireAdmin, uploadSingleImage, productController.createProduct)
router.put('/:id', authenticate, requireAdmin, uploadSingleImage, productController.updateProduct)
router.delete('/:id', authenticate, requireAdmin, productController.deleteProduct)

// Admin stats
router.get('/stats', authenticate, requireAdmin, productController.getProductStats)

export default router
