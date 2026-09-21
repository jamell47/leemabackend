import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'

/**
 * Generate JWT token for user
 */
export const generateToken = (userId) => {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  })
}

/**
 * Generate unique order number
 * Format: LEEMA-ORD-XXXXX
 */
export const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-5)
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `LEEMA-ORD-${timestamp}${random}`
}

/**
 * Normalize Kenyan phone number to 2547XXXXXXXX format
 * Handles:
 * - 0712345678 -> 254712345678
 * - 0112345678 -> 254712345678
 * - 254712345678 -> 254712345678
 * - +254712345678 -> 254712345678
 */
export const normalizeKenyanPhone = (phone) => {
  if (!phone) return ''

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // Handle different formats
  if (digits.startsWith('254')) {
    // Already in 254 format, ensure it's 12 digits
    return digits.length === 12 ? digits : ''
  }

  if (digits.startsWith('0')) {
    // Convert 07XX... to 2547XX...
    if (digits.length === 10) {
      return `254${digits.slice(1)}`
    }
    return ''
  }

  // If starts with 7 or 1 but not 0 or 254
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    return `254${digits}`
  }

  return ''
}

/**
 * Validate Kenyan phone number
 */
export const validateKenyanPhone = (phone) => {
  const normalized = normalizeKenyanPhone(phone)

  if (!normalized) {
    return { valid: false, normalized: '', error: 'Invalid phone number format' }
  }

  // Check if it's a valid Kenyan mobile number (2547XXXXXXXX or 2541XXXXXXXX)
  const isValid = /^(2547|2541)\d{8}$/.test(normalized)

  return {
    valid: isValid,
    normalized,
    error: isValid ? null : 'Phone number must be a valid Kenyan mobile number',
  }
}

/**
 * Format currency in KSh
 */
export const formatCurrency = (amount, currency = 'KES') => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Calculate delivery fee based on subtotal
 * Free delivery for orders above 2000 KSh
 */
export const calculateDeliveryFee = (subtotal) => {
  return subtotal >= 2000 ? 0 : 150
}

/**
 * Calculate order total
 */
export const calculateOrderTotal = (subtotal, deliveryFee = 0) => {
  return subtotal + deliveryFee
}

/**
 * Sanitize string input
 */
export const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return ''
  return str.trim().replace(/<[^>]*>/g, '') // Remove HTML tags
}

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  if (!email) return { valid: true, error: null } // Email is optional
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return {
    valid: emailRegex.test(email),
    error: emailRegex.test(email) ? null : 'Invalid email format',
  }
}

/**
 * Truncate text with ellipsis
 */
export const truncate = (text, maxLength) => {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Sleep utility for delays
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Generate random string
 */
export const randomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
