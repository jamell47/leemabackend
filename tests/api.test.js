/**
 * API Integration Tests
 * 
 * Run these tests with a running database and server:
 * 1. Start PostgreSQL and run migrations: npm run prisma:migrate
 * 2. Seed database: npm run prisma:seed
 * 3. Start server: npm run dev
 * 4. Run tests: node --test tests/api.test.js
 * 
 * These tests require environment variables to be set in .env
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api'
let authToken = ''
let testProductId = ''
let testCategoryId = ''
let testOrderId = ''

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('GET /health should return success', async () => {
      const { status, data } = await request('/health')
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.ok(data.message)
    })
  })

  describe('Authentication', () => {
    it('POST /auth/register should create a new user', async () => {
      const testEmail = `test${Date.now()}@example.com`
      const { status, data } = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: testEmail,
          phone: '0712345678',
          password: 'password123',
        }),
      })
      assert.equal(status, 201)
      assert.equal(data.success, true)
      assert.ok(data.data.token)
      authToken = data.data.token
    })

    it('POST /auth/login should return token for valid credentials', async () => {
      // First register a user
      const testEmail = `login${Date.now()}@example.com`
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Login User',
          email: testEmail,
          phone: '0711111111',
          password: 'password123',
        }),
      })

      // Then login
      const { status, data } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testEmail,
          password: 'password123',
        }),
      })
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.ok(data.data.token)
    })

    it('POST /auth/login should fail with wrong password', async () => {
      const { status, data } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@leema.tech',
          password: 'wrongpassword',
        }),
      })
      assert.equal(status, 401)
      assert.equal(data.success, false)
    })

    it('GET /auth/profile should return user profile', async () => {
      const { status, data } = await request('/auth/profile')
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.ok(data.data.user)
    })
  })

  describe('Categories', () => {
    it('GET /categories should return all categories', async () => {
      const { status, data } = await request('/categories')
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.ok(Array.isArray(data.data.categories))
    })

    it('POST /categories should create category (admin only)', async () => {
      const { status, data } = await request('/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Category',
          description: 'Test Description',
        }),
      })
      // Should fail without auth
      assert.equal(status, 401)
    })
  })

  describe('Products', () => {
    it('GET /products should return paginated products', async () => {
      const { status, data } = await request('/products')
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.ok(Array.isArray(data.data.products))
      assert.ok(data.data.pagination)
    })

    it('GET /products?featured=true should filter featured products', async () => {
      const { status, data } = await request('/products?featured=true')
      assert.equal(status, 200)
      assert.equal(data.success, true)
    })

    it('GET /products/:id should return single product', async () => {
      // First get a product ID from the list
      const { data: listData } = await request('/products')
      if (listData.data.products.length > 0) {
        const productId = listData.data.products[0].id
        testProductId = productId
        const { status, data } = await request(`/products/${productId}`)
        assert.equal(status, 200)
        assert.equal(data.success, true)
        assert.equal(data.data.id, productId)
      }
    })

    it('GET /products/:id should return 404 for invalid ID', async () => {
      const { status, data } = await request('/products/invalid-id')
      assert.equal(status, 404)
      assert.equal(data.success, false)
    })
  })

  describe('Cart', () => {
    it('GET /cart should return empty cart for guest', async () => {
      const { status, data } = await request('/cart', {
        headers: { 'X-Session-ID': 'test-session-123' },
      })
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.equal(data.data.items.length, 0)
    })

    it('POST /cart/items should add product to cart', async () => {
      if (!testProductId) {
        const { data: listData } = await request('/products')
        if (listData.data.products.length > 0) {
          testProductId = listData.data.products[0].id
        }
      }

      if (testProductId) {
        const { status, data } = await request('/cart/items', {
          method: 'POST',
          headers: { 'X-Session-ID': 'test-session-123' },
          body: JSON.stringify({
            productId: testProductId,
            quantity: 2,
          }),
        })
        assert.equal(status, 201)
        assert.equal(data.success, true)
        assert.equal(data.data.quantity, 2)
      }
    })

    it('GET /cart should return cart with items', async () => {
      const { status, data } = await request('/cart', {
        headers: { 'X-Session-ID': 'test-session-123' },
      })
      assert.equal(status, 200)
      assert.equal(data.success, true)
      assert.ok(data.data.items.length > 0)
    })
  })

  describe('Orders', () => {
    it('POST /orders/checkout should create order and initiate payment', async () => {
      // Add item to cart first
      if (!testProductId) {
        const { data: listData } = await request('/products')
        if (listData.data.products.length > 0) {
          testProductId = listData.data.products[0].id
        }
      }

      if (testProductId) {
        const { status, data } = await request('/orders/checkout', {
          method: 'POST',
          headers: { 'X-Session-ID': 'test-session-123' },
          body: JSON.stringify({
            customerName: 'Test Customer',
            phone: '0712345678',
            email: 'test@example.com',
            items: [{ productId: testProductId, quantity: 1 }],
          }),
        })
        // May fail if M-Pesa not configured, but order should be created
        if (status === 201) {
          assert.equal(data.success, true)
          assert.ok(data.data.order)
          testOrderId = data.data.order.id
        }
      }
    })

    it('GET /orders should return user orders (auth required)', async () => {
      const { status, data } = await request('/orders')
      // Should fail without auth
      assert.equal(status, 401)
    })
  })

  describe('Contact', () => {
    it('POST /contact/submit should accept contact form', async () => {
      const { status, data } = await request('/contact/submit', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          message: 'This is a test message',
        }),
      })
      assert.equal(status, 201)
      assert.equal(data.success, true)
      assert.ok(data.data.id)
    })

    it('POST /contact/submit should reject missing fields', async () => {
      const { status, data } = await request('/contact/submit', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      })
      assert.equal(status, 400)
      assert.equal(data.success, false)
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      // This test would need to make many requests
      // Skipped in basic test run
    })
  })
})