import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config/env.js'
import { AppError } from './error.middleware.js'

// Ensure uploads directory exists
import { mkdirSync, existsSync } from 'fs'
const uploadsDir = path.resolve('uploads')
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true })
}

/**
 * File filter for product images
 * Only allow JPG, JPEG, PNG, WEBP
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type
  if (!config.upload.allowedTypes.includes(file.mimetype)) {
    return cb(new AppError('Invalid file type. Allowed: JPG, JPEG, PNG, WEBP.', 400, 'INVALID_FILE_TYPE'), false)
  }

  // Check file extension as additional validation
  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp']

  if (!allowedExts.includes(ext)) {
    return cb(new AppError('Invalid file extension. Allowed: .jpg, .jpeg, .png, .webp', 400, 'INVALID_FILE_TYPE'), false)
  }

  cb(null, true)
}

/**
 * Storage configuration for product images
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    // Generate unique filename: uuid.extension
    const uniqueSuffix = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueSuffix)
  },
})

/**
 * Upload middleware for single product image
 */
export const uploadSingleImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize, // 5MB default
  },
}).single('image')

/**
 * Upload middleware for multiple product images
 */
export const uploadMultipleImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 5, // Max 5 images
  },
}).array('images', 5)

/**
 * Helper to get image URL
 */
export const getImageUrl = (filename) => {
  // In development, serve from local uploads folder
  // In production, this could be a CDN URL
  if (config.nodeEnv === 'production') {
    // TODO: Update with your production CDN/domain
    return `/uploads/${filename}`
  }
  // Development: return full path for local serving
  return `/api/uploads/${filename}`
}

/**
 * Middleware to serve uploaded files in development
 */
export const serveUploads = (req, res, next) => {
  // This will be added to the express app
  next()
}
