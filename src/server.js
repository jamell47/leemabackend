import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
import { config, isDevelopment } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import productRoutes from './routes/product.routes.js'
import categoryRoutes from './routes/category.routes.js'
import cartRoutes from './routes/cart.routes.js'
import orderRoutes from './routes/order.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import authRoutes from './routes/auth.routes.js'
import contactRoutes from './routes/contact.routes.js'

const app = express()

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1)

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disable CSP for API
}))

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGINS || config.frontendUrl)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// In development also allow common localhost dev servers
if (config.nodeEnv !== 'production') {
  allowedOrigins.push(
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  )
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
  maxAge: 86400, // 24 hours
}
app.use(cors(corsOptions))

// Rate limiting - general API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/', generalLimiter)

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many authentication attempts, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
})
app.use('/api/auth/register', authLimiter)
app.use('/api/auth/login', authLimiter)

// STK push rate limit
const stkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many payment attempts. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
})
app.use('/api/payments/mpesa/stk-push', stkLimiter)

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve uploads in development
if (isDevelopment()) {
  const uploadsPath = path.resolve('uploads')
  if (fs.existsSync(uploadsPath)) {
    app.use('/api/uploads', express.static(uploadsPath, {
      maxAge: '1d',
      etag: true,
      setHeaders: (res, filePath) => {
        // Set proper MIME types
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
        }
        if (mimeTypes[ext]) {
          res.setHeader('Content-Type', mimeTypes[ext])
        }
      },
    }))
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Leema Tech Solutions API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: config.nodeEnv,
  })
})

// API Routes
app.use('/api/products', productRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/contact', contactRoutes)

// 404 handler
app.use(notFoundHandler)

// Global error handler
app.use(errorHandler)

// Start server
const PORT = config.port
const server = app.listen(PORT, () => {
  console.log(`Leema Tech Solutions API running on port ${PORT} in ${config.nodeEnv} mode`)
})

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`)
  server.close(async () => {
    console.log('HTTP server closed.')
    process.exit(0)
  })

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

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
