import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
import { config } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import productRoutes from './routes/product.routes.js'
import categoryRoutes from './routes/category.routes.js'
import cartRoutes from './routes/cart.routes.js'
import orderRoutes from './routes/order.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import authRoutes from './routes/auth.routes.js'
import contactRoutes from './routes/contact.routes.js'

const app = express()

// Security
app.use(helmet())
app.use(cors({ origin: config.frontendUrl, credentials: true }))

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use(limiter)

// STK push rate limit
const stkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many payment attempts. Please try again later.' },
})
app.use('/api/payments/mpesa/stk-push', stkLimiter)

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve uploads in development
if (config.nodeEnv === 'development') {
  const uploadsPath = path.resolve('uploads')
  if (fs.existsSync(uploadsPath)) {
    app.use('/api/uploads', express.static(uploadsPath))
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Leema Tech Solutions API is running',
    timestamp: new Date().toISOString(),
  })
})

// Routes
app.use('/api/products', productRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/contact', contactRoutes)

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

// Start server
const PORT = config.port
app.listen(PORT, () => {
  console.log(`Leema Tech Solutions API running on port ${PORT}`)
})

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err)
  process.exit(1)
})

export default app
