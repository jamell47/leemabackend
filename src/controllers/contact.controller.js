import { AppError } from '../middleware/error.middleware.js'
import prisma from '../config/prisma.js'

/**
 * Contact Controller
 * Handles contact form submissions
 */

export const submitContact = async (req, res, next) => {
  try {
    const { name, email, phone, message, subject } = req.body

    if (!name || !message) {
      throw new AppError('Name and message are required', 400, 'VALIDATION_ERROR')
    }

    // In production, this could send an email or store in database
    // For now, we'll store in database and log

    const contact = await prisma.contactSubmission.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        subject: subject || 'General Inquiry',
        message,
      },
    })

    console.log('Contact form submission:', {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      subject: contact.subject,
    })

    res.status(201).json({
      success: true,
      message: 'Thank you for contacting us. We will get back to you soon.',
      data: {
        id: contact.id,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getAllContactSubmissions = async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      throw new AppError('Admin access required', 403, 'FORBIDDEN')
    }

    const submissions = await prisma.contactSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    res.json({
      success: true,
      data: { submissions },
    })
  } catch (error) {
    next(error)
  }
}

export const deleteContactSubmission = async (req, res, next) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      throw new AppError('Admin access required', 403, 'FORBIDDEN')
    }

    const { id } = req.params

    await prisma.contactSubmission.delete({
      where: { id },
    })

    res.json({
      success: true,
      message: 'Submission deleted',
    })
  } catch (error) {
    next(error)
  }
}

export default { submitContact, getAllContactSubmissions, deleteContactSubmission }
