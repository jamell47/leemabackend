import bcrypt from 'bcryptjs'
import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'
import { generateToken } from '../utils/helpers.js'

export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body

    if (!name || !email || !phone || !password) {
      throw new AppError('Name, email, phone, and password are required', 400, 'VALIDATION_ERROR')
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    })

    if (existingUser) {
      if (existingUser.email === email) {
        throw new AppError('Email already registered', 409, 'EMAIL_EXISTS')
      }
      throw new AppError('Phone number already registered', 409, 'PHONE_EXISTS')
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone,
        password: hashedPassword,
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    })

    const token = generateToken(user.id)

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { user, token },
    })
  } catch (error) {
    next(error)
  }
}

export const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body

    if (!email && !phone) {
      throw new AppError('Email or phone is required', 400, 'VALIDATION_ERROR')
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email?.toLowerCase() },
          { phone },
        ],
      },
    })

    if (!user) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    }

    const token = generateToken(user.id)

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },
        token,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getProfile = async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  })
}

export const updateProfile = async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    const updateData = {}

    if (name) updateData.name = name
    if (email) updateData.email = email.toLowerCase()

    if (password) {
      if (password.length < 6) {
        throw new AppError('Password must be at least 6 characters', 400, 'VALIDATION_ERROR')
      }
      updateData.password = await bcrypt.hash(password, 12)
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    })
  } catch (error) {
    next(error)
  }
}

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400, 'VALIDATION_ERROR')
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', 400, 'VALIDATION_ERROR')
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password)
    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 400, 'INVALID_PASSWORD')
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    })

    res.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    next(error)
  }
}

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ success: true, data: { users } })
  } catch (error) {
    next(error)
  }
}

export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params

    if (userId === req.user.id) {
      throw new AppError('Cannot delete your own account', 400, 'VALIDATION_ERROR')
    }

    await prisma.user.delete({ where: { id: userId } })

    res.json({ success: true, message: 'User deleted successfully' })
  } catch (error) {
    next(error)
  }
}

export default {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers,
  deleteUser,
}
