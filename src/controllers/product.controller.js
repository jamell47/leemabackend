import prisma from '../config/prisma.js'
import { AppError } from '../middleware/error.middleware.js'
import { getImageUrl } from '../middleware/upload.middleware.js'

const productInclude = { category: true }

const transformProduct = (product) => ({
  ...product,
  image: getImageUrl(product.image),
  gallery: product.gallery?.map(getImageUrl) || [],
})

export const getAllProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, search, available, featured, subcategory } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)
    const where = {}

    if (category && category !== 'all') where.categoryId = category
    if (available === 'true') where.isAvailable = true
    else if (available === 'false') where.isAvailable = false
    if (featured === 'true') where.featured = true
    else if (featured === 'false') where.featured = false
    if (subcategory) where.subcategory = subcategory

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search] } },
      ]
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ])

    const transformed = products.map(transformProduct)

    res.json({
      success: true,
      data: {
        products: transformed,
        pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) },
      },
    })
  } catch (error) { next(error) }
}

export const getProduct = async (req, res, next) => {
  try {
    const { id } = req.params
    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    })

    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND')

    res.json({ success: true, data: transformProduct(product) })
  } catch (error) { next(error) }
}

export const createProduct = async (req, res, next) => {
  try {
    let imagePath = req.body.image
    if (req.file) imagePath = req.file.filename
    else if (req.files && Array.isArray(req.files) && req.files.length > 0) imagePath = req.files[0].filename

    if (!imagePath) throw new AppError('Product image is required', 400, 'VALIDATION_ERROR')

    const {
      name, description, price, unit, stock, isAvailable, categoryId,
      gallery, featured, organic, delivery, tags, subcategory, farmerId,
    } = req.body

    const product = await prisma.product.create({
      data: {
        name, description, price: parseFloat(price), unit,
        image: imagePath,
        gallery: gallery ? JSON.parse(gallery) : [],
        stock: parseInt(stock) || 0,
        isAvailable: isAvailable !== 'false',
        featured: featured === 'true',
        organic: organic === 'true',
        delivery: delivery !== 'false',
        tags: tags ? JSON.parse(tags) : [],
        subcategory: subcategory || null,
        farmerId: farmerId || null,
        categoryId,
      },
      include: productInclude,
    })

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: transformProduct(product),
    })
  } catch (error) { next(error) }
}

export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) throw new AppError('Product not found', 404, 'NOT_FOUND')

    let imagePath = req.body.image
    if (req.file) imagePath = req.file.filename
    else if (req.files && Array.isArray(req.files) && req.files.length > 0) imagePath = req.files[0].filename

    const {
      name, description, price, unit, stock, isAvailable, categoryId,
      gallery, featured, organic, delivery, tags, subcategory, farmerId,
    } = req.body

    const updateData = {}
    if (name) updateData.name = name
    if (description) updateData.description = description
    if (price) updateData.price = parseFloat(price)
    if (unit) updateData.unit = unit
    if (imagePath) updateData.image = imagePath
    if (stock !== undefined) updateData.stock = parseInt(stock)
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable !== 'false'
    if (featured !== undefined) updateData.featured = featured === 'true'
    if (organic !== undefined) updateData.organic = organic === 'true'
    if (delivery !== undefined) updateData.delivery = delivery !== 'false'
    if (gallery !== undefined) updateData.gallery = JSON.parse(gallery)
    if (tags !== undefined) updateData.tags = JSON.parse(tags)
    if (subcategory !== undefined) updateData.subcategory = subcategory || null
    if (farmerId !== undefined) updateData.farmerId = farmerId || null
    if (categoryId) updateData.categoryId = categoryId

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: productInclude,
    })

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: transformProduct(product),
    })
  } catch (error) { next(error) }
}

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND')

    await prisma.product.delete({ where: { id } })
    res.json({ success: true, message: 'Product deleted successfully' })
  } catch (error) { next(error) }
}

export const getProductStats = async (req, res, next) => {
  try {
    const [totalProducts, availableProducts, featuredProducts, totalStock, totalValue] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isAvailable: true } }),
      prisma.product.count({ where: { featured: true } }),
      prisma.product.aggregate({ _sum: { stock: true } }),
      prisma.product.aggregate({ _sum: { stock: true, price: true } }),
    ])

    res.json({
      success: true,
      data: {
        totalProducts,
        availableProducts,
        featuredProducts,
        outOfStock: totalProducts - availableProducts,
        totalStock: totalStock._sum.stock || 0,
        totalInventoryValue: (totalValue._sum.stock || 0) * (totalValue._sum.price || 0),
      },
    })
  } catch (error) { next(error) }
}

export default { getAllProducts, getProduct, createProduct, updateProduct, deleteProduct, getProductStats }
