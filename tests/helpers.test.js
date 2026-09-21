import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeKenyanPhone,
  validateKenyanPhone,
  calculateDeliveryFee,
  calculateOrderTotal,
  generateOrderNumber,
  sanitizeString,
  validateEmail,
  formatCurrency,
} from '../src/utils/helpers.js'

describe('Helper Functions', () => {
  describe('normalizeKenyanPhone', () => {
    it('should normalize 07 format to 2547', () => {
      assert.equal(normalizeKenyanPhone('0712345678'), '254712345678')
      assert.equal(normalizeKenyanPhone('0700000000'), '254700000000')
    })

    it('should normalize 01 format to 2541', () => {
      assert.equal(normalizeKenyanPhone('0112345678'), '254112345678')
      assert.equal(normalizeKenyanPhone('0100000000'), '254100000000')
    })

    it('should keep 254 format as is', () => {
      assert.equal(normalizeKenyanPhone('254712345678'), '254712345678')
      assert.equal(normalizeKenyanPhone('254112345678'), '254112345678')
    })

    it('should handle +254 format', () => {
      assert.equal(normalizeKenyanPhone('+254712345678'), '254712345678')
    })

    it('should handle 7/1 format without leading 0', () => {
      assert.equal(normalizeKenyanPhone('712345678'), '254712345678')
      assert.equal(normalizeKenyanPhone('112345678'), '254112345678')
    })

    it('should return empty string for invalid formats', () => {
      assert.equal(normalizeKenyanPhone(''), '')
      assert.equal(normalizeKenyanPhone('123'), '')
      assert.equal(normalizeKenyanPhone('071234567'), '') // too short
      assert.equal(normalizeKenyanPhone('0812345678'), '') // invalid prefix
      assert.equal(normalizeKenyanPhone('25471234567'), '') // too short
    })
  })

  describe('validateKenyanPhone', () => {
    it('should validate correct 2547 numbers', () => {
      const result = validateKenyanPhone('0712345678')
      assert.equal(result.valid, true)
      assert.equal(result.normalized, '254712345678')
      assert.equal(result.error, null)
    })

    it('should validate correct 2541 numbers', () => {
      const result = validateKenyanPhone('0112345678')
      assert.equal(result.valid, true)
      assert.equal(result.normalized, '254112345678')
    })

    it('should reject invalid formats', () => {
      const result = validateKenyanPhone('0812345678')
      assert.equal(result.valid, false)
      assert.equal(result.error, 'Invalid phone number format')
    })

    it('should reject too short numbers', () => {
      const result = validateKenyanPhone('071234567')
      assert.equal(result.valid, false)
    })

    it('should handle empty input', () => {
      const result = validateKenyanPhone('')
      assert.equal(result.valid, false)
    })
  })

  describe('calculateDeliveryFee', () => {
    it('should return 150 for orders below 2000', () => {
      assert.equal(calculateDeliveryFee(1000), 150)
      assert.equal(calculateDeliveryFee(1999), 150)
      assert.equal(calculateDeliveryFee(0), 150)
    })

    it('should return 0 for orders 2000 and above', () => {
      assert.equal(calculateDeliveryFee(2000), 0)
      assert.equal(calculateDeliveryFee(5000), 0)
    })
  })

  describe('calculateOrderTotal', () => {
    it('should add subtotal and delivery fee', () => {
      assert.equal(calculateOrderTotal(1000, 150), 1150)
      assert.equal(calculateOrderTotal(2000, 0), 2000)
    })

    it('should default delivery fee to 0', () => {
      assert.equal(calculateOrderTotal(1000), 1000)
    })
  })

  describe('generateOrderNumber', () => {
    it('should generate order number with correct format', () => {
      const orderNumber = generateOrderNumber()
      assert.match(orderNumber, /^LEEMA-ORD-[A-Z0-9]+$/)
    })

    it('should generate unique numbers', () => {
      const numbers = new Set()
      for (let i = 0; i < 100; i++) {
        numbers.add(generateOrderNumber())
      }
      assert.equal(numbers.size, 100)
    })
  })

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      assert.equal(sanitizeString('  hello  '), 'hello')
    })

    it('should remove HTML tags', () => {
      assert.equal(sanitizeString('<script>alert(1)</script>hello'), 'alert(1)hello')
      assert.equal(sanitizeString('<b>bold</b>'), 'bold')
    })

    it('should handle empty/null input', () => {
      assert.equal(sanitizeString(''), '')
      assert.equal(sanitizeString(null), '')
      assert.equal(sanitizeString(undefined), '')
    })

    it('should handle non-string input', () => {
      assert.equal(sanitizeString(123), '')
      assert.equal(sanitizeString({}), '')
    })
  })

  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      assert.equal(validateEmail('test@example.com').valid, true)
      assert.equal(validateEmail('user.name@domain.co.ke').valid, true)
    })

    it('should reject invalid emails', () => {
      assert.equal(validateEmail('invalid').valid, false)
      assert.equal(validateEmail('missing@domain').valid, false)
      assert.equal(validateEmail('@nodomain.com').valid, false)
    })

    it('should allow empty email (optional)', () => {
      assert.equal(validateEmail('').valid, true)
      assert.equal(validateEmail(null).valid, true)
    })
  })

  describe('formatCurrency', () => {
    it('should format KES currency', () => {
      const result = formatCurrency(1234)
      assert.match(result, /[Kk][Ss][Hh]?\s?1,234/)
    })

    it('should handle zero', () => {
      const result = formatCurrency(0)
      assert.match(result, /[Kk][Ss][Hh]?\s?0/)
    })
  })
})