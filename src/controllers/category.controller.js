import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'

export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    })
    res.json({ success: true, data: { categories } })
  } catch (error) { next(error) }
}

export const getCategory = async (req, res, next) => {
  try {
    const { id } = req.params
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          where: { isAvailable: true },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND')

    res.json({ success: true, data: category })
  } catch (error) { next(error) }
}

export const createCategory = async (req, res, next) => {
  try {
    const { name, description, image } = req.body

    if (!name) throw new AppError('Category name is required', 400, 'VALIDATION_ERROR')

    const existing = await prisma.category.findUnique({ where: { name } })
    if (existing) throw new AppError('Category already exists', 409, 'CONFLICT')

    const category = await prisma.category.create({
      data: { name, description: description || null, image: image || null },
    })

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    })
  } catch (error) { next(error) }
}

export const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, description, image } = req.body

    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) throw new AppError('Category not found', 404, 'NOT_FOUND')

    if (name && name !== existing.name) {
      const nameExists = await prisma.category.findUnique({ where: { name } })
      if (nameExists) throw new AppError('Category name already exists', 409, 'CONFLICT')
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: name || existing.name,
        description: description !== undefined ? description : existing.description,
        image: image !== undefined ? image : existing.image,
      },
    })

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category,
    })
  } catch (error) { next(error) }
}

export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params

    const category = await prisma.category.findUnique({ where: { id } })
    if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND')

    // Check if category has products
    const productCount = await prisma.product.count({ where: { categoryId: id } })
    if (productCount > 0) {
      throw new AppError('Cannot delete category with existing products', 400, 'HAS_PRODUCTS')
    }

    await prisma.category.delete({ where: { id } })
    res.json({ success: true, message: 'Category deleted successfully' })
  } catch (error) { next(error) }
}

export default { getAllCategories, getCategory, createCategory, updateCategory, deleteCategory }
