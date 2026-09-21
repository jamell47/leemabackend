# Leema Tech Solutions API Documentation

## Base URL
```
Development: http://localhost:4000/api
Production: https://api.leema.tech/api
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

---

## Authentication Endpoints

### Register User
```
POST /auth/register
```
**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "0712345678",
  "password": "securepassword"
}
```
**Response:** 201 Created
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": { "id": "...", "name": "...", "email": "...", "phone": "...", "role": "CUSTOMER" },
    "token": "jwt-token"
  }
}
```

### Login
```
POST /auth/login
```
**Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```
Or:
```json
{
  "phone": "0712345678",
  "password": "securepassword"
}
```
**Response:** 200 OK
```json
{
  "success": true,
  "message": "Login successful",
  "data": { "user": {...}, "token": "jwt-token" }
}
```

### Get Profile
```
GET /auth/profile
```
**Headers:** Authorization: Bearer <token>
**Response:** 200 OK

### Update Profile
```
PUT /auth/profile
```
**Headers:** Authorization: Bearer <token>
**Body:**
```json
{ "name": "New Name", "email": "new@example.com" }
```

### Change Password
```
PUT /auth/profile/password
```
**Headers:** Authorization: Bearer <token>
**Body:**
```json
{ "currentPassword": "old", "newPassword": "new" }
```

---

## Product Endpoints

### List Products
```
GET /products
```
**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `category` - Category ID
- `search` - Search in name/description/tags
- `available` - true/false
- `featured` - true/false
- `subcategory` - Subcategory name

**Response:** 200 OK
```json
{
  "success": true,
  "data": {
    "products": [...],
    "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
  }
}
```

### Get Product
```
GET /products/:id
```
**Response:** 200 OK

### Create Product (Admin)
```
POST /products
```
**Headers:** Authorization: Bearer <admin-token>, Content-Type: multipart/form-data
**Body (form-data):**
- `name` (string)
- `description` (string)
- `price` (number)
- `unit` (string) - e.g. "kg", "bunch", "piece"
- `stock` (integer)
- `categoryId` (string)
- `image` (file) - required
- `gallery` (JSON string array) - optional
- `featured` (boolean) - optional
- `organic` (boolean) - optional
- `delivery` (boolean) - optional
- `tags` (JSON string array) - optional
- `subcategory` (string) - optional
- `farmerId` (string) - optional

### Update Product (Admin)
```
PUT /products/:id
```
**Headers:** Authorization: Bearer <admin-token>

### Delete Product (Admin)
```
DELETE /products/:id
```
**Headers:** Authorization: Bearer <admin-token>

### Product Stats (Admin)
```
GET /products/stats
```
**Headers:** Authorization: Bearer <admin-token>

---

## Category Endpoints

### List Categories
```
GET /categories
```

### Get Category with Products
```
GET /categories/:id
```

### Create Category (Admin)
```
POST /categories
```
**Headers:** Authorization: Bearer <admin-token>
**Body:**
```json
{ "name": "Vegetables", "description": "Fresh vegetables", "image": "url" }
```

### Update Category (Admin)
```
PUT /categories/:id
```

### Delete Category (Admin)
```
DELETE /categories/:id
```

---

## Cart Endpoints

All cart endpoints support both authenticated users and guests (via `X-Session-ID` header).

### Get Cart
```
GET /cart
```
**Headers:** Authorization: Bearer <token> (optional) OR `X-Session-ID: <session-id>`

### Add to Cart
```
POST /cart/items
```
**Headers:** Authorization or `X-Session-ID`
**Body:**
```json
{ "productId": "...", "quantity": 2 }
```

### Update Cart Item
```
PUT /cart/items/:id
```
**Headers:** Authorization or `X-Session-ID`
**Body:**
```json
{ "quantity": 3 }
```

### Remove Cart Item
```
DELETE /cart/items/:id
```
**Headers:** Authorization or `X-Session-ID`

### Clear Cart
```
DELETE /cart
```
**Headers:** Authorization or `X-Session-ID`

---

## Order Endpoints

### Checkout (Create Order + Initiate Payment)
```
POST /orders/checkout
```
**Headers:** Authorization: Bearer <token> (optional) OR `X-Session-ID`
**Body:**
```json
{
  "customerName": "John Doe",
  "phone": "0712345678",
  "email": "john@example.com",
  "items": [
    { "productId": "...", "quantity": 2 }
  ]
}
```
**Response:** 201 Created
```json
{
  "success": true,
  "message": "Order created. M-Pesa prompt sent to your phone.",
  "data": {
    "order": { "id": "...", "orderNumber": "LEEMA-ORD-...", "status": "PAYMENT_PENDING", "totalAmount": 1500 },
    "payment": { "id": "...", "status": "PENDING", "checkoutRequestId": "..." },
    "message": "M-Pesa prompt sent. Please enter your PIN to complete payment."
  }
}
```

### Get Order by ID
```
GET /orders/:id
```
**Headers:** Authorization: Bearer <token>

### Get Order by Order Number
```
GET /orders/number/:orderNumber
```
**Headers:** Authorization: Bearer <token> (optional)

### List Orders
```
GET /orders
```
**Headers:** Authorization: Bearer <token>
**Query:** `page`, `limit`

### Update Order Status (Admin)
```
PUT /orders/:id/status
```
**Headers:** Authorization: Bearer <admin-token>
**Body:**
```json
{ "status": "PROCESSING" }
```

---

## Payment Endpoints

### Initiate STK Push
```
POST /payments/mpesa/stk-push
```
**Headers:** Authorization: Bearer <token>
**Body:**
```json
{ "orderId": "..." }
```

### M-Pesa Callback (Daraja)
```
POST /payments/mpesa/callback
```
**Note:** Called by Safaricom Daraja API. Must be publicly accessible.

### Get Payment by ID
```
GET /payments/:id
```
**Headers:** Authorization: Bearer <token>

### Get Payment by Order ID
```
GET /payments/order/:orderId
```
**Headers:** Authorization: Bearer <token> (optional)

---

## Contact Endpoints

### Submit Contact Form
```
POST /contact/submit
```
**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "0712345678",
  "subject": "Inquiry",
  "message": "Hello, I have a question..."
}
```

### List Submissions (Admin)
```
GET /contact
```
**Headers:** Authorization: Bearer <admin-token>

### Delete Submission (Admin)
```
DELETE /contact/:id
```
**Headers:** Authorization: Bearer <admin-token>

---

## Health Check
```
GET /health
```
**Response:** 200 OK
```json
{
  "success": true,
  "message": "Leema Tech Solutions API is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "environment": "development"
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API | 100 requests | 15 minutes |
| Auth (register/login) | 20 requests | 15 minutes |
| M-Pesa STK Push | 10 requests | 1 hour |

---

## File Uploads

- **Max file size:** 5MB
- **Allowed types:** JPEG, PNG, WebP
- **Upload endpoint:** Multipart form data with `image` field
- **Development serving:** `/api/uploads/<filename>`
- **Production:** Configure CDN URL in `FRONTEND_URL`

---

## Environment Variables

See `.env.example` for all required variables.

---

## Database Schema Overview

### User
- id, name, email, phone, password, role (CUSTOMER/ADMIN)

### Category
- id, name, description, image

### Product
- id, name, description, price, unit, image, gallery[], stock
- isAvailable, featured, organic, delivery, rating, reviewCount
- tags[], subcategory, farmerId, categoryId

### Cart / CartItem
- Guest sessions supported via Session model

### Order / OrderItem
- Order status: PENDING → PAYMENT_PENDING → PAID → PROCESSING → READY → COMPLETED
- CANCELLED at any point

### Payment
- M-Pesa integration with idempotent callback handling
- Stock reserved on payment success, released on failure

### ContactSubmission
- Customer inquiries storage

---

## M-Pesa Integration Details

- **Transaction Type:** CustomerPayBillOnline
- **Phone Format:** 2547XXXXXXXX stored, 07XXXXXXXX sent to Daraja
- **Callback Processing:** Idempotent using `callbackProcessed` flag
- **Stock Handling:** Decrement on payment SUCCESS, restore on FAILED/CANCELLED
- **Status Mapping:**
  - ResultCode 0 → SUCCESS/PAID
  - ResultCode 1032/1033 → CANCELLED
  - ResultCode 1037 → FAILED (timeout)
  - Other → FAILED