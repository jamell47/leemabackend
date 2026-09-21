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
 * Only allow JPG, JPEG, PNG, WEBP with strict validation
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new AppError('Invalid file type. Allowed: JPG, JPEG, PNG, WEBP.', 400, 'INVALID_FILE_TYPE'), false)
  }

  // Check file extension as additional validation
  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp']

  if (!allowedExts.includes(ext)) {
    return cb(new AppError('Invalid file extension. Allowed: .jpg, .jpeg, .png, .webp', 400, 'INVALID_FILE_TYPE'), false)
  }

  // Validate file size (additional check beyond multer limits)
  if (file.size && file.size > config.upload.maxFileSize) {
    return cb(new AppError(`File too large. Maximum size is ${config.upload.maxFileSize / (1024 * 1024)}MB.`, 400, 'FILE_TOO_LARGE'), false)
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
    fileSize: config.upload.maxFileSize,
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
    files: 5,
  },
}).array('images', 5)

/**
 * Helper to get image URL
 */
export const getImageUrl = (filename) => {
  if (!filename) return null
  if (config.nodeEnv === 'production') {
    // In production, use CDN or full URL
    return `${config.frontendUrl}/uploads/${filename}`
  }
  return `/api/uploads/${filename}`
}

/**
 * Helper to get multiple image URLs
 */
export const getImageUrls = (filenames) => {
  if (!filenames || !Array.isArray(filenames)) return []
  return filenames.map(getImageUrl).filter(Boolean)
}

/**
 * Middleware to serve uploaded files in development with proper MIME types
 */
export const serveUploads = (req, res, next) => {
  // This will be added to the express app
  next()
}

/**
 * Validate file type from buffer (for additional security)
 */
export const validateFileBuffer = (buffer, mimetype) => {
  // Basic magic number validation for images
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: 'Invalid file: too small' }
  }

  const signatures = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header for WebP
  }

  const expectedSig = signatures[mimetype]
  if (!expectedSig) {
    return { valid: false, error: `Unsupported MIME type: ${mimetype}` }
  }

  const matches = expectedSig.every((byte, index) => buffer[index] === byte)
  if (!matches) {
    return { valid: false, error: `File signature does not match ${mimetype}` }
  }

  return { valid: true, error: null }
}
