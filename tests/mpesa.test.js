import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateStkPassword } from '../src/services/mpesa.service.js'

describe('M-Pesa Service', () => {
  describe('generateStkPassword', () => {
    it('should generate password using ShortCode + PassKey + Timestamp order', () => {
      const shortcode = '123456'
      const passkey = 'mysecretpasskey'
      const timestamp = '20240115143022'

      const password = generateStkPassword(shortcode, passkey, timestamp)

      // Daraja spec: Base64(ShortCode + PassKey + Timestamp)
      const expected = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

      assert.equal(password, expected)
    })

    it('should NOT use ShortCode + Timestamp + PassKey order (the bug)', () => {
      const shortcode = '123456'
      const passkey = 'mysecretpasskey'
      const timestamp = '20240115143022'

      const password = generateStkPassword(shortcode, passkey, timestamp)

      // The incorrect order would produce a different password
      const wrong = Buffer.from(`${shortcode}${timestamp}${passkey}`).toString('base64')

      assert.notEqual(password, wrong)
    })

    it('should produce valid base64', () => {
      const password = generateStkPassword('4405831', 'testpasskey', '20240115143022')
      assert.match(password, /^[A-Za-z0-9+/=]+$/)
    })
  })
})
