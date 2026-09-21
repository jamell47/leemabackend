import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'

export const createNotification = async ({ userId, type, title, message, data }) => {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: data || null,
    },
  })
  return notification
}

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user?.id
    if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const { page = 1, limit = 50, unreadOnly } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const where = { userId }
    if (unreadOnly === 'true') {
      where.read = false
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, read: false } }),
    ])

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: take,
          total,
          totalPages: Math.ceil(total / take),
        },
        unreadCount,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getNotification = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.id
    if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) throw new AppError('Notification not found', 404, 'NOT_FOUND')
    if (notification.userId !== userId) throw new AppError('Access denied', 403, 'FORBIDDEN')

    res.json({
      success: true,
      data: notification,
    })
  } catch (error) {
    next(error)
  }
}

export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.id
    if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) throw new AppError('Notification not found', 404, 'NOT_FOUND')
    if (notification.userId !== userId) throw new AppError('Access denied', 403, 'FORBIDDEN')

    await prisma.notification.update({
      where: { id },
      data: { read: true },
    })

    res.json({
      success: true,
      message: 'Notification marked as read',
    })
  } catch (error) {
    next(error)
  }
}

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const userId = req.user?.id
    if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })

    res.json({
      success: true,
      message: 'All notifications marked as read',
    })
  } catch (error) {
    next(error)
  }
}

export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.id
    if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const notification = await prisma.notification.findUnique({
      where: { id },
    })

    if (!notification) throw new AppError('Notification not found', 404, 'NOT_FOUND')
    if (notification.userId !== userId) throw new AppError('Access denied', 403, 'FORBIDDEN')

    await prisma.notification.delete({ where: { id } })

    res.json({
      success: true,
      message: 'Notification deleted',
    })
  } catch (error) {
    next(error)
  }
}

export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user?.id
    if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED')

    const count = await prisma.notification.count({
      where: { userId, read: false },
    })

    res.json({
      success: true,
      data: { unreadCount: count },
    })
  } catch (error) {
    next(error)
  }
}

export default {
  createNotification,
  getNotifications,
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getUnreadCount,
}