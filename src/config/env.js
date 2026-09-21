import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.resolve(__filename, '..', '..')

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '.env') })

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

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

if (missingVars.length > 0 && process.env.NODE_ENV === 'production') {
  console.error('❌ Missing required environment variables:')
  missingVars.forEach((varName) => console.error(`   - ${varName}`))
  process.exit(1)
}

// Validate M-Pesa credentials in non-sandbox mode
if (process.env.MPESA_ENVIRONMENT !== 'sandbox') {
  const mpesaVars = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY']
  const missingMpesa = mpesaVars.filter((v) => !process.env[v] || process.env[v].includes('YOUR_'))

  if (missingMpesa.length > 0) {
    console.warn('⚠️  M-Pesa credentials appear to be placeholder values. STK Push will fail.')
  }
}

// Export configuration object
export const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL,
  mpesa: {
    environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
    callbackUrl: process.env.MPESA_CALLBACK_URL,
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024, // 5MB default
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((t) => t.trim()),
  },
}

// Helper to check if running in production
export const isProduction = () => config.nodeEnv === 'production'

// Helper to check if running in development
export const isDevelopment = () => config.nodeEnv === 'development'
