import { PrismaClient } from '@prisma/client'
import { config } from './env.js'

// Create Prisma client instance
const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Export with graceful shutdown handling
const prismaClient = prisma

// Handle connection errors
prisma.$on('error', (e) => {
  console.error('Prisma Client Error:', e.message)
})

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`)
  try {
    await prisma.$disconnect()
    console.log('Prisma client disconnected.')
    process.exit(0)
  } catch (error) {
    console.error('Error during Prisma disconnect:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default prismaClient
