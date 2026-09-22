import axios from 'axios'
import { config } from '../config/env.js'
import { AppError } from '../middleware/error.middleware.js'
import { validateKenyanPhone } from '../utils/helpers.js'

let accessToken = null
let tokenExpiry = 0

const DARAJA_URLS = {
  sandbox: {
    auth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stk: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  },
  production: {
    auth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stk: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
  },
}

const getDarajaUrls = () => {
  const environment = config.mpesa.environment
  const urls = DARAJA_URLS[environment]
  if (!urls) throw new AppError('Unsupported M-Pesa environment.', 500, 'MPESA_CONFIG_ERROR')
  return urls
}

const getDarajaTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`
}

// Mask phone number for safe logging — keeps first 4 and last 2 digits
const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '***'
  if (phone.length <= 6) return phone.slice(0, 2) + '*'.repeat(phone.length - 2)
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2)
}

// Log M-Pesa config status (YES/NO) without revealing secret values
const logMpesaConfig = () => {
  console.log('[M-Pesa Config]')
  console.log(`  Environment:      ${config.mpesa.environment}`)
  console.log(`  Consumer Key:     ${config.mpesa.consumerKey ? 'YES' : 'NO'}`)
  console.log(`  Consumer Secret:  ${config.mpesa.consumerSecret ? 'YES' : 'NO'}`)
  console.log(`  Shortcode:        ${config.mpesa.shortcode ? 'YES' : 'NO'}`)
  console.log(`  Passkey:          ${config.mpesa.passkey ? 'YES' : 'NO'}`)
  console.log(`  Callback URL:     ${config.mpesa.callbackUrl ? 'YES' : 'NO'}`)
  console.log(`  TransactionType:  ${config.mpesa.transactionType || 'NOT SET'}`)
}

// Always log errors, but mask sensitive values in context
const logDarajaError = (operation, error, context = {}) => {
  const safeContext = { ...context }
  if (safeContext.phone) safeContext.phone = maskPhone(safeContext.phone)
  console.error(`[M-Pesa ${operation} failed]`, {
    httpStatus: error.response?.status || null,
    darajaResponse: error.response?.data || null,
    message: error.message,
    stack: error.stack,
    ...safeContext,
  })
}

export const generateStkPassword = (shortcode, passkey, timestamp = getDarajaTimestamp()) => {
  // Daraja spec: Base64(ShortCode + PassKey + Timestamp)
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')
}

export const getAccessToken = async () => {
  if (accessToken && Date.now() < tokenExpiry - 5 * 60 * 1000) return accessToken

  const urls = getDarajaUrls()

  console.log('[M-Pesa OAuth] === Requesting access token ===')
  console.log(`[M-Pesa OAuth] Environment: ${config.mpesa.environment}`)
  console.log(`[M-Pesa OAuth] Endpoint: ${urls.auth}`)
  console.log(`[M-Pesa OAuth] Consumer Key configured:  ${config.mpesa.consumerKey ? 'YES' : 'NO'}`)
  console.log(`[M-Pesa OAuth] Consumer Secret configured: ${config.mpesa.consumerSecret ? 'YES' : 'NO'}`)

  try {
    const response = await axios.get(urls.auth, {
      auth: {
        username: config.mpesa.consumerKey,
        password: config.mpesa.consumerSecret,
      },
      headers: { 'Content-Type': 'application/json' },
    })

    console.log('[M-Pesa OAuth] === OAuth response received ===')
    console.log(`[M-Pesa OAuth] HTTP Status: ${response.status}`)
    console.log(`[M-Pesa OAuth] Token received: ${response.data?.access_token ? 'YES' : 'NO'}`)
    console.log(`[M-Pesa OAuth] Expires in: ${response.data?.expires_in || 'NOT SET'} seconds`)

    if (!response.data?.access_token) {
      console.error('[M-Pesa OAuth] ERROR: No access_token in response')
      console.error('[M-Pesa OAuth] Response body:', response.data)
      throw new AppError('M-Pesa authentication response was invalid.', 500, 'MPESA_AUTH_FAILED')
    }

    accessToken = response.data.access_token
    tokenExpiry = Date.now() + (Number(response.data.expires_in) || 3500) * 1000
    console.log('[M-Pesa OAuth] Token stored successfully.')
    return accessToken
  } catch (error) {
    console.error('[M-Pesa OAuth] === OAuth FAILED ===')
    console.error(`[M-Pesa OAuth] HTTP Status: ${error.response?.status || 'N/A'}`)
    console.error('[M-Pesa OAuth] Response body:', error.response?.data || error.message)

    if (error instanceof AppError) throw error
    logDarajaError('access token', error, { endpoint: urls.auth })

    if (error.response?.status === 401) {
      throw new AppError('M-Pesa authentication failed. Check credentials.', 500, 'MPESA_AUTH_FAILED')
    }
    throw new AppError('Failed to connect to M-Pesa. Please try again later.', 503, 'MPESA_CONNECTION_ERROR')
  }
}

// Pass-through: phone is already normalized to 254XXXXXXXX by validateKenyanPhone
const normalizePhoneForDaraja = (phone254) => phone254

export const initiateStkPush = async ({ phone, amount, orderNumber, callbackUrl = null }) => {
  console.log('[M-Pesa STK Push] === Initiating STK Push ===')
  logMpesaConfig()

  const phoneValidation = validateKenyanPhone(phone)
  console.log(`[M-Pesa STK Push] Original phone:   ${maskPhone(phone)}`)
  console.log(`[M-Pesa STK Push] Normalized phone: ${maskPhone(phoneValidation.normalized)}`)

  if (!phoneValidation.valid) {
    console.error(`[M-Pesa STK Push] Phone validation FAILED: ${phoneValidation.error}`)
    throw new AppError(phoneValidation.error, 400, 'INVALID_PHONE')
  }

  const paymentAmount = Number(amount)
  if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
    console.error(`[M-Pesa STK Push] Invalid amount: ${amount}`)
    throw new AppError('Payment amount must be a positive integer', 400, 'INVALID_AMOUNT')
  }

  if (!config.mpesa.shortcode || !config.mpesa.passkey || !(callbackUrl || config.mpesa.callbackUrl)) {
    console.error('[M-Pesa STK Push] Configuration incomplete')
    throw new AppError('M-Pesa configuration is incomplete', 500, 'MPESA_CONFIG_ERROR')
  }
  if (!['sandbox', 'production'].includes(config.mpesa.environment)) {
    throw new AppError('M-Pesa environment must be sandbox or production', 500, 'MPESA_CONFIG_ERROR')
  }
  if (config.mpesa.transactionType !== 'CustomerPayBillOnline') {
    throw new AppError('M-Pesa PayBill transaction type must be CustomerPayBillOnline', 500, 'MPESA_CONFIG_ERROR')
  }
  if (!orderNumber) throw new AppError('Order number is required', 400, 'INVALID_ORDER')

  const urls = getDarajaUrls()

  // === Step 1: Obtain OAuth access token ===
  const token = await getAccessToken()

  // === Step 2: Build STK Push payload ===
  const timestamp = getDarajaTimestamp()
  const password = generateStkPassword(config.mpesa.shortcode, config.mpesa.passkey, timestamp)
  const normalizedPhone = normalizePhoneForDaraja(phoneValidation.normalized)
  const resolvedCallbackUrl = callbackUrl || config.mpesa.callbackUrl

  const payload = {
    BusinessShortCode: config.mpesa.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.mpesa.transactionType,
    Amount: paymentAmount,
    PartyA: normalizedPhone,
    PartyB: config.mpesa.shortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: resolvedCallbackUrl,
    AccountReference: orderNumber,
    TransactionDesc: 'Leema Farm Order',
  }

  console.log('[M-Pesa STK Push] === Sending STK Push request ===')
  console.log(`[M-Pesa STK Push] Endpoint:        ${urls.stk}`)
  console.log(`[M-Pesa STK Push] BusinessShortCode: ${config.mpesa.shortcode}`)
  console.log(`[M-Pesa STK Push] TransactionType:   ${config.mpesa.transactionType}`)
  console.log(`[M-Pesa STK Push] Amount:            ${paymentAmount}`)
  console.log(`[M-Pesa STK Push] PartyA:            ${maskPhone(normalizedPhone)}`)
  console.log(`[M-Pesa STK Push] PhoneNumber:       ${maskPhone(normalizedPhone)}`)
  console.log(`[M-Pesa STK Push] CallBackURL:       ${resolvedCallbackUrl}`)
  console.log(`[M-Pesa STK Push] AccountReference:  ${orderNumber}`)
  console.log(`[M-Pesa STK Push] Timestamp:         ${timestamp}`)

  try {
    const response = await axios.post(urls.stk, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const data = response.data || {}
    const checkoutRequestId = data.CheckoutRequestID || data.CheckoutRequestId || null

    console.log('[M-Pesa STK Push] === STK Push response received ===')
    console.log(`[M-Pesa STK Push] HTTP Status:    ${response.status}`)

    // Daraja may return HTTP 200 with an error body (errorCode / errorMessage)
    if (data.errorCode || data.errorMessage || data.errorCode === '500') {
      console.error('[M-Pesa STK Push] === ERROR: Daraja returned an error response ===')
      console.error(`[M-Pesa STK Push] Daraja ErrorCode:    ${data.errorCode || 'NOT SET'}`)
      console.error(`[M-Pesa STK Push] Daraja ErrorMessage: ${data.errorMessage || 'NOT SET'}`)
      console.error('[M-Pesa STK Push] Full Daraja response:', data)
      throw new AppError(
        `M-Pesa STK request failed: ${data.errorMessage || data.errorCode || 'Unknown Daraja error'}`,
        503,
        'MPESA_STK_FAILED'
      )
    }

    console.log('[M-Pesa STK Push] ResponseCode:           ', data.ResponseCode || 'NOT SET')
    console.log('[M-Pesa STK Push] ResponseDescription:    ', data.ResponseDescription || 'NOT SET')
    console.log('[M-Pesa STK Push] MerchantRequestID:      ', data.MerchantRequestID || data.MerchantRequestId || 'NOT SET')
    console.log('[M-Pesa STK Push] CheckoutRequestID:      ', checkoutRequestId || 'NOT SET')
    console.log('[M-Pesa STK Push] CustomerMessage:        ', data.CustomerMessage || 'NOT SET')

    const success = data.ResponseCode === '0' && Boolean(checkoutRequestId)
    console.log(`[M-Pesa STK Push] STK accepted by Daraja: ${success ? 'YES' : 'NO'}`)
    if (!success) {
      console.error('[M-Pesa STK Push] === STK Push NOT accepted by Daraja ===')
      console.error('[M-Pesa STK Push] Full response:', data)
    }

    return {
      success,
      merchantRequestId: data.MerchantRequestID || data.MerchantRequestId || null,
      checkoutRequestId,
      responseCode: data.ResponseCode || null,
      responseDescription: data.ResponseDescription || (checkoutRequestId ? 'M-Pesa request accepted' : 'M-Pesa did not return a checkout request ID.'),
    }
  } catch (error) {
    console.error('[M-Pesa STK Push] === STK Push request FAILED ===')
    console.error(`[M-Pesa STK Push] HTTP Status:   ${error.response?.status || 'N/A'}`)
    console.error(`[M-Pesa STK Push] Error message:  ${error.message}`)
    console.error('[M-Pesa STK Push] Daraja response:', error.response?.data || 'No response data')

    logDarajaError('STK Push', error, {
      endpoint: urls.stk,
      shortcode: config.mpesa.shortcode,
      transactionType: config.mpesa.transactionType,
      amount: paymentAmount,
      phone: phoneValidation.normalized,
      orderNumber,
      callbackUrl: resolvedCallbackUrl,
    })

    if (error.response?.status === 401) {
      throw new AppError('M-Pesa authentication expired. Please try again.', 500, 'MPESA_AUTH_FAILED')
    }

    // If the error was already an AppError thrown from our Daraja error check above, re-throw it
    if (error instanceof AppError) throw error

    throw new AppError('Failed to initiate M-Pesa payment. Please try again later.', 503, 'MPESA_STK_FAILED')
  }
}

export const parseCallback = (callbackData) => {
  const stkCallback = callbackData?.Body?.stkCallback

  if (!stkCallback) {
    throw new AppError('Invalid callback: missing stkCallback', 400, 'INVALID_CALLBACK')
  }

  const metadata = {}
  for (const item of stkCallback.CallbackMetadata?.Item || []) {
    if (item?.Name) metadata[item.Name] = item.Value
  }

  const transactionDateValue = metadata.TransactionDate
  let transactionDate = null
  if (transactionDateValue) {
    const value = String(transactionDateValue)
    const parsed = /^\d{14}$/.test(value)
      ? new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}Z`)
      : new Date(Number(value) * 1000)
    transactionDate = Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return {
    merchantRequestId: stkCallback.MerchantRequestID || null,
    checkoutRequestId: stkCallback.CheckoutRequestID || stkCallback.CheckoutRequestId || null,
    responseCode: stkCallback.ResponseCode == null ? null : String(stkCallback.ResponseCode),
    resultCode: stkCallback.ResultCode == null ? null : String(stkCallback.ResultCode),
    resultDescription: stkCallback.ResultDesc || 'M-Pesa callback received',
    receiptNumber: metadata.MpesaReceiptNumber || metadata.MerchantReceiptNumber || null,
    transactionDate,
    amount: metadata.Amount == null ? null : Number(metadata.Amount),
  }
}

export const getCallbackStatus = (callback) => {
  const resultCode = String(callback?.resultCode ?? '')
  if (resultCode === '0') {
    return { paymentStatus: 'SUCCESS', orderStatus: 'PAID', message: 'Payment successful' }
  }
  if (resultCode === '1032' || resultCode === '1033') {
    return { paymentStatus: 'CANCELLED', orderStatus: 'PAYMENT_PENDING', message: 'Payment cancelled by customer' }
  }
  return { paymentStatus: 'FAILED', orderStatus: 'PAYMENT_PENDING', message: callback?.resultDescription || 'Payment failed' }
}

export const refreshAccessToken = async () => {
  accessToken = null
  tokenExpiry = 0
  return getAccessToken()
}

export default {
  getAccessToken,
  initiateStkPush,
  parseCallback,
  getCallbackStatus,
  generateStkPassword,
  refreshAccessToken,
}
