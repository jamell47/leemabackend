import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })

const cleanEnvValue = (value) => {
  if (value == null) return value
  const trimmed = String(value).trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

const env = (name) => cleanEnvValue(process.env[name])

// Validate required environment variables
const requiredEnvVars = [
  'PORT',
  'NODE_ENV',
  'DATABASE_URL',
  'JWT_SECRET',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CALLBACK_URL',
  'FRONTEND_URL',
]

const missingVars = requiredEnvVars.filter((varName) => !env(varName))

if (env('MPESA_ENVIRONMENT') && env('MPESA_ENVIRONMENT') !== 'sandbox') {
  console.error('M-Pesa STK Push is restricted to the sandbox environment.')
  process.exit(1)
}

if (missingVars.length > 0 && env('NODE_ENV') === 'production') {
  console.error('❌ Missing required environment variables:')
  missingVars.forEach((varName) => console.error(`   - ${varName}`))
  process.exit(1)
}

// Validate M-Pesa credentials in non-sandbox mode
if (env('MPESA_ENVIRONMENT') !== 'sandbox') {
  const mpesaVars = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY']
  const missingMpesa = mpesaVars.filter((v) => !process.env[v] || process.env[v].includes('YOUR_'))

  if (missingMpesa.length > 0) {
    console.warn('⚠️  M-Pesa credentials appear to be placeholder values. STK Push will fail.')
  }
}

// Export configuration object
export const config = {
  port: parseInt(env('PORT'), 10) || 4000,
  nodeEnv: env('NODE_ENV') || 'development',
  databaseUrl: env('DATABASE_URL'),
  jwtSecret: env('JWT_SECRET'),
  jwtExpiresIn: env('JWT_EXPIRES_IN') || '7d',
  frontendUrl: env('FRONTEND_URL'),
  mpesa: {
    environment: 'sandbox',
    consumerKey: env('MPESA_CONSUMER_KEY'),
    consumerSecret: env('MPESA_CONSUMER_SECRET'),
    shortcode: env('MPESA_SHORTCODE'),
    passkey: env('MPESA_PASSKEY'),
    transactionType: env('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline',
    callbackUrl: env('MPESA_CALLBACK_URL'),
  },
  upload: {
    maxFileSize: parseInt(env('MAX_FILE_SIZE'), 10) || 5 * 1024 * 1024, // 5MB default
    allowedTypes: (env('ALLOWED_FILE_TYPES') || 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((t) => t.trim()),
  },
}

// Helper to check if running in production
export const isProduction = () => config.nodeEnv === 'production'

// Helper to check if running in development
export const isDevelopment = () => config.nodeEnv === 'development'
