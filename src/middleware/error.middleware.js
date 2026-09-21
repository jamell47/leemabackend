import multer from 'multer'
import { config } from '../config/env.js'

/**
 * Error handling middleware
 * Provides consistent error responses
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err)

  // Default error values
  let statusCode = 500
  let message = 'Internal server error'
  let code = 'INTERNAL_ERROR'

  // Handle Prisma errors
  if (err.code) {
    // Prisma unique constraint violation
    if (err.code === 'P2002') {
      statusCode = 409
      message = 'Resource already exists'
      code = 'CONFLICT'
    }
    // Prisma record not found
    else if (err.code === 'P2025') {
      statusCode = 404
      message = 'Resource not found'
      code = 'NOT_FOUND'
    }
    // Prisma foreign key violation
    else if (err.code === 'P2003') {
      statusCode = 400
      message = 'Invalid reference to related record'
      code = 'FOREIGN_KEY_ERROR'
    }
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400
    message = 'Validation failed'
    code = 'VALIDATION_ERROR'
    err.errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }))
  }

  // Handle custom app errors
  if (err.isAppError) {
    statusCode = err.statusCode || 400
    message = err.message
    code = err.code || 'APP_ERROR'
  }

  // Handle Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400
    message = 'File too large. Maximum size is 5MB.'
    code = 'FILE_TOO_LARGE'
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 400
      message = 'File too large. Maximum size is 5MB.'
      code = 'FILE_TOO_LARGE'
    } else if (err.code === 'INVALID_FILE_TYPE') {
      statusCode = 400
      message = 'Invalid file type. Allowed: JPG, JPEG, PNG, WEBP.'
      code = 'INVALID_FILE_TYPE'
    } else {
      statusCode = 400
      message = err.message
      code = 'UPLOAD_ERROR'
    }
  }

  // Don't expose stack traces in production
  const response = {
    success: false,
    message,
    code,
  }

  if (config.nodeEnv === 'development') {
    response.stack = err.stack
    if (err.errors) {
      response.errors = err.errors
    }
  }

  res.status(statusCode).json(response)
}

/**
 * Not found handler
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  })
}

/**
 * Create a custom application error
 */
export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isAppError = true
    Error.captureStackTrace(this, this.constructor)
  }
}
