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
  const env = config.mpesa.environment || 'sandbox'
  return DARAJA_URLS[env] || DARAJA_URLS.sandbox
}

export const generateStkPassword = (shortcode, passkey) => {
  const timestamp = new Date().toISOString().replace(/[-\:T.]/g, '').slice(0, 14)
  const password = shortcode + timestamp + passkey
  return Buffer.from(password).toString('base64')
}

export const getAccessToken = async () => {
  if (accessToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return accessToken
  }

  const urls = getDarajaUrls()

  try {
    const response = await axios.get(urls.auth, {
      auth: {
        username: config.mpesa.consumerKey,
        password: config.mpesa.consumerSecret,
      },
      headers: { 'Content-Type': 'application/json' },
    })

    accessToken = response.data.access_token
    tokenExpiry = Date.now() + (response.data.expires_in * 1000)
    return accessToken
  } catch (error) {
    console.error('M-Pesa OAuth error:', error.response?.data || error.message)
    if (error.response?.status === 401) {
      throw new AppError('M-Pesa authentication failed. Check credentials.', 500, 'MPESA_AUTH_FAILED')
    }
    throw new AppError('Failed to connect to M-Pesa. Please try again later.', 503, 'MPESA_CONNECTION_ERROR')
  }
}

/**
 * Normalize phone for Daraja STK Push
 * Daraja expects format: 07XXXXXXXX or 01XXXXXXXX (10 digits starting with 0)
 * We receive 2547XXXXXXXX or 2541XXXXXXXX (12 digits starting with 254)
 */
const normalizePhoneForDaraja = (phone254) => {
  // Convert 2547XXXXXXXX -> 07XXXXXXXX
  // Convert 2541XXXXXXXX -> 01XXXXXXXX
  if (phone254.startsWith('254')) {
    return '0' + phone254.slice(3)
  }
  return phone254
}

export const initiateStkPush = async ({ phone, amount, orderNumber, callbackUrl = null }) => {
  const phoneValidation = validateKenyanPhone(phone)
  if (!phoneValidation.valid) {
    throw new AppError(phoneValidation.error, 400, 'INVALID_PHONE')
  }

  // phoneValidation.normalized is in 2547XXXXXXXX format
  // Daraja needs 07XXXXXXXX format
  const darajaPhone = normalizePhoneForDaraja(phoneValidation.normalized)
  const urls = getDarajaUrls()
  const accessToken = await getAccessToken()
  const password = generateStkPassword(config.mpesa.shortcode, config.mpesa.passkey)

  // Use CustomerPayBillOnline exactly as required
  const transactionType = 'CustomerPayBillOnline'

  const payload = {
    BusinessShortCode: config.mpesa.shortcode,
    Password: password,
    Timestamp: new Date().toISOString().replace(/[-\:T.]/g, '').slice(0, 14),
    TransactionType: transactionType,
    Amount: Math.round(amount), // Amount must be integer
    PartyA: darajaPhone,
    PartyB: config.mpesa.shortcode,
    PhoneNumber: darajaPhone,
    CallBackURL: callbackUrl || config.mpesa.callbackUrl,
    AccountReference: orderNumber,
    TransactionDesc: 'Leema Farm Order',
  }

  console.log('M-Pesa STK Push:', { phone: darajaPhone, amount: Math.round(amount), orderNumber, transactionType })

  try {
    const response = await axios.post(urls.stk, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken,
      },
    })

    const stkData = response.data
    return {
      success: stkData.ResponseCode === '0',
      merchantRequestId: stkData.MerchantRequestId,
      checkoutRequestId: stkData.CheckoutRequestId,
      responseCode: stkData.ResponseCode,
      responseDescription: stkData.ResponseDescription,
    }
  } catch (error) {
    console.error('M-Pesa STK Push error:', error.response?.data || error.message)
    if (error.response?.status === 401) {
      throw new AppError('M-Pesa authentication expired. Please try again.', 500, 'MPESA_AUTH_FAILED')
    }
    throw new AppError('Failed to initiate M-Pesa payment. Please try again.', 503, 'MPESA_STK_FAILED')
  }
}

export const parseCallback = (callbackData) => {
  const { Body } = callbackData
  if (!Body) throw new AppError('Invalid callback: missing Body', 400, 'INVALID_CALLBACK')

  const { stkCallback } = Body
  if (!stkCallback) throw new AppError('Invalid callback: missing stkCallback', 400, 'INVALID_CALLBACK')

  const { MerchantRequestID, CheckoutRequestID, ResponseCode, ResultCode, ResultDesc, CallbackMetadata } = stkCallback

  let receiptNumber = null
  let transactionDate = null
  let amount = null

  if (CallbackMetadata?.Item) {
    const metadata = {}
    CallbackMetadata.Item.forEach((item) => {
      metadata[item.Name] = item.Value
    })
    receiptNumber = metadata.MerchantReceiptNumber || null
    transactionDate = metadata.TransactionDate ? new Date(metadata.TransactionDate * 1000) : null
    amount = metadata.Amount || null
  }

  return {
    merchantRequestId: MerchantRequestID,
    checkoutRequestId: CheckoutRequestID,
    responseCode: ResponseCode,
    resultCode: ResultCode,
    resultDescription: ResultDesc,
    receiptNumber,
    transactionDate,
    amount,
  }
}

export const getCallbackStatus = (callbackData) => {
  const { resultCode, responseCode } = callbackData

  // ResponseCode '0' means STK push was accepted, but ResultCode determines actual payment result
  // ResultCode '0' = Success
  // ResultCode '1032' = Cancelled by user
  // ResultCode '1037' = Timeout
  // Other ResultCodes = Failed
  if (resultCode === '0') {
    return { paymentStatus: 'SUCCESS', orderStatus: 'PAID', message: 'Payment successful' }
  }

  if (resultCode === '1032' || resultCode === '1033') {
    return { paymentStatus: 'CANCELLED', orderStatus: 'CANCELLED', message: 'Payment cancelled by user' }
  }

  if (resultCode === '1037') {
    return { paymentStatus: 'FAILED', orderStatus: 'CANCELLED', message: 'Payment timed out' }
  }

  return { paymentStatus: 'FAILED', orderStatus: 'CANCELLED', message: callbackData.resultDescription || 'Payment failed' }
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
