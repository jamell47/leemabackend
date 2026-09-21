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
  const environment = config.mpesa.environment || 'sandbox'
  return DARAJA_URLS[environment] || DARAJA_URLS.sandbox
}

export const generateStkPassword = (shortcode, passkey) => {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  return Buffer.from(`${shortcode}${timestamp}${passkey}`).toString('base64')
}

export const getAccessToken = async () => {
  if (accessToken && Date.now() < tokenExpiry - 5 * 60 * 1000) return accessToken

  const urls = getDarajaUrls()
  try {
    const response = await axios.get(urls.auth, {
      auth: {
        username: config.mpesa.consumerKey,
        password: config.mpesa.consumerSecret,
      },
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.data?.access_token) {
      throw new AppError('M-Pesa authentication response was invalid.', 500, 'MPESA_AUTH_FAILED')
    }
    accessToken = response.data.access_token
    tokenExpiry = Date.now() + (Number(response.data.expires_in) || 3500) * 1000
    return accessToken
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error.response?.status === 401) {
      throw new AppError('M-Pesa authentication failed. Check credentials.', 500, 'MPESA_AUTH_FAILED')
    }
    throw new AppError('Failed to connect to M-Pesa. Please try again later.', 503, 'MPESA_CONNECTION_ERROR')
  }
}

const normalizePhoneForDaraja = (phone254) => (
  phone254.startsWith('254') ? `0${phone254.slice(3)}` : phone254
)

export const initiateStkPush = async ({ phone, amount, orderNumber, callbackUrl = null }) => {
  const phoneValidation = validateKenyanPhone(phone)
  if (!phoneValidation.valid) {
    throw new AppError(phoneValidation.error, 400, 'INVALID_PHONE')
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new AppError('Payment amount is invalid', 400, 'INVALID_AMOUNT')
  }

  const urls = getDarajaUrls()
  const token = await getAccessToken()
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  const payload = {
    BusinessShortCode: config.mpesa.shortcode,
    Password: generateStkPassword(config.mpesa.shortcode, config.mpesa.passkey),
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(Number(amount)),
    PartyA: normalizePhoneForDaraja(phoneValidation.normalized),
    PartyB: config.mpesa.shortcode,
    PhoneNumber: normalizePhoneForDaraja(phoneValidation.normalized),
    CallBackURL: callbackUrl || config.mpesa.callbackUrl,
    AccountReference: orderNumber,
    TransactionDesc: 'Leema Farm Order',
  }

  try {
    const response = await axios.post(urls.stk, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const data = response.data || {}
    return {
      success: data.ResponseCode === '0',
      merchantRequestId: data.MerchantRequestId || null,
      checkoutRequestId: data.CheckoutRequestId || null,
      responseCode: data.ResponseCode || null,
      responseDescription: data.ResponseDescription || 'M-Pesa request accepted',
    }
  } catch (error) {
    if (error.response?.status === 401) {
      throw new AppError('M-Pesa authentication expired. Please try again.', 500, 'MPESA_AUTH_FAILED')
    }
    throw new AppError(
      error.response?.data?.errorMessage || 'Failed to initiate M-Pesa payment. Please try again.',
      503,
      'MPESA_STK_FAILED',
    )
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
    checkoutRequestId: stkCallback.CheckoutRequestID || null,
    responseCode: stkCallback.ResponseCode == null ? null : String(stkCallback.ResponseCode),
    resultCode: stkCallback.ResultCode == null ? null : String(stkCallback.ResultCode),
    resultDescription: stkCallback.ResultDesc || 'M-Pesa callback received',
    receiptNumber: metadata.MpesaReceiptNumber || metadata.MerchantReceiptNumber || null,
    transactionDate,
    amount: metadata.Amount == null ? null : Number(metadata.Amount),
  }
}

export const getCallbackStatus = (callback) => {
  const resultCode = String(callback?.resultCode || '')
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
