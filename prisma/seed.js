import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { email: 'admin@leema.tech' },
    update: {},
    create: { name: 'Leema Admin', email: 'admin@leema.tech', phone: '0700000000', password: adminPassword, role: 'ADMIN' }
  })
  console.log('✅ Admin user created')

  // Create test customer
  const customerPassword = await bcrypt.hash('customer123', 12)
  await prisma.user.upsert({
    where: { email: 'customer@leema.tech' },
    update: {},
    create: { name: 'Test Customer', email: 'customer@leema.tech', phone: '0712345678', password: customerPassword, role: 'CUSTOMER' }
  })
  console.log('✅ Test customer created')

  // Create categories
  const cats = await Promise.all([
    prisma.category.upsert({ where: { name: 'Vegetables' }, update: {}, create: { name: 'Vegetables', description: 'Fresh organic vegetables', image: null } }),
    prisma.category.upsert({ where: { name: 'Fruits' }, update: {}, create: { name: 'Fruits', description: 'Ripe farm-fresh fruits', image: null } }),
    prisma.category.upsert({ where: { name: 'Dairy & Eggs' }, update: {}, create: { name: 'Dairy & Eggs', description: 'Fresh dairy and eggs', image: null } }),
    prisma.category.upsert({ where: { name: 'Grains & Cereals' }, update: {}, create: { name: 'Grains & Cereals', description: 'Quality grains', image: null } }),
    prisma.category.upsert({ where: { name: 'Honey' }, update: {}, create: { name: 'Honey', description: 'Pure natural honey', image: null } }),
  ])
  console.log('✅ Categories created:', cats.length)

  const [vegetables, fruits, dairy, grains, honey] = cats

  // Create products with all new fields
  const products = await Promise.all([
    // Vegetables
    prisma.product.upsert({
      where: { name: 'Organic Spinach' },
      update: {},
      create: {
        name: 'Organic Spinach',
        description: 'Fresh organic spinach harvested daily from our farms. Rich in iron and vitamins.',
        price: 120,
        unit: 'bunch',
        image: 'spinach.jpg',
        gallery: ['spinach1.jpg', 'spinach2.jpg'],
        stock: 50,
        isAvailable: true,
        featured: true,
        organic: true,
        delivery: true,
        rating: 4.8,
        reviewCount: 124,
        tags: ['organic', 'leafy', 'iron-rich', 'vegan'],
        subcategory: 'Leafy Greens',
        farmerId: 'FARMER-001',
        categoryId: vegetables.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Kale (Sukuma Wiki)' },
      update: {},
      create: {
        name: 'Kale (Sukuma Wiki)',
        description: 'Traditional Kenyan kale, perfect for ugali accompaniment. Fresh and crisp.',
        price: 80,
        unit: 'bunch',
        image: 'kale.jpg',
        gallery: ['kale1.jpg'],
        stock: 100,
        isAvailable: true,
        featured: true,
        organic: false,
        delivery: true,
        rating: 4.6,
        reviewCount: 89,
        tags: ['traditional', 'staple', 'affordable'],
        subcategory: 'Leafy Greens',
        farmerId: 'FARMER-002',
        categoryId: vegetables.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Organic Carrots' },
      update: {},
      create: {
        name: 'Organic Carrots',
        description: 'Sweet organic carrots, great for salads, juices, or cooking.',
        price: 150,
        unit: 'kg',
        image: 'carrots.jpg',
        gallery: ['carrots1.jpg', 'carrots2.jpg'],
        stock: 30,
        isAvailable: true,
        featured: false,
        organic: true,
        delivery: true,
        rating: 4.7,
        reviewCount: 67,
        tags: ['organic', 'root-vegetable', 'sweet'],
        subcategory: 'Root Vegetables',
        farmerId: 'FARMER-001',
        categoryId: vegetables.id,
      },
    }),
    // Fruits
    prisma.product.upsert({
      where: { name: 'Tree-Ripened Mangoes' },
      update: {},
      create: {
        name: 'Tree-Ripened Mangoes',
        description: 'Sweet, juicy mangoes ripened on the tree for maximum flavor.',
        price: 250,
        unit: 'kg',
        image: 'mangoes.jpg',
        gallery: ['mangoes1.jpg', 'mangoes2.jpg', 'mangoes3.jpg'],
        stock: 40,
        isAvailable: true,
        featured: true,
        organic: true,
        delivery: true,
        rating: 4.9,
        reviewCount: 203,
        tags: ['organic', 'tropical', 'seasonal', 'sweet'],
        subcategory: 'Tropical Fruits',
        farmerId: 'FARMER-003',
        categoryId: fruits.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Organic Avocados' },
      update: {},
      create: {
        name: 'Organic Avocados',
        description: 'Creamy, buttery organic avocados. Perfect for toast, salads, or guacamole.',
        price: 300,
        unit: 'kg',
        image: 'avocados.jpg',
        gallery: ['avocados1.jpg'],
        stock: 25,
        isAvailable: true,
        featured: true,
        organic: true,
        delivery: true,
        rating: 4.8,
        reviewCount: 156,
        tags: ['organic', 'healthy-fats', 'keto-friendly'],
        subcategory: 'Tropical Fruits',
        farmerId: 'FARMER-003',
        categoryId: fruits.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Passion Fruits' },
      update: {},
      create: {
        name: 'Passion Fruits',
        description: 'Tangy passion fruits, excellent for juices and desserts.',
        price: 180,
        unit: 'kg',
        image: 'passion.jpg',
        gallery: [],
        stock: 60,
        isAvailable: true,
        featured: false,
        organic: true,
        delivery: true,
        rating: 4.5,
        reviewCount: 45,
        tags: ['organic', 'tropical', 'juicing'],
        subcategory: 'Tropical Fruits',
        farmerId: 'FARMER-004',
        categoryId: fruits.id,
      },
    }),
    // Dairy & Eggs
    prisma.product.upsert({
      where: { name: 'Free-Range Eggs' },
      update: {},
      create: {
        name: 'Free-Range Eggs',
        description: 'Fresh free-range eggs from happy hens. Rich yolks, superior taste.',
        price: 450,
        unit: 'tray (30 pcs)',
        image: 'eggs.jpg',
        gallery: ['eggs1.jpg', 'eggs2.jpg'],
        stock: 20,
        isAvailable: true,
        featured: true,
        organic: false,
        delivery: true,
        rating: 4.9,
        reviewCount: 312,
        tags: ['free-range', 'protein', 'breakfast'],
        subcategory: 'Eggs',
        farmerId: 'FARMER-005',
        categoryId: dairy.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Fresh Whole Milk' },
      update: {},
      create: {
        name: 'Fresh Whole Milk',
        description: 'Creamy fresh whole milk from grass-fed cows. No additives.',
        price: 120,
        unit: 'litre',
        image: 'milk.jpg',
        gallery: ['milk1.jpg'],
        stock: 50,
        isAvailable: true,
        featured: false,
        organic: false,
        delivery: true,
        rating: 4.7,
        reviewCount: 178,
        tags: ['fresh', 'dairy', 'calcium'],
        subcategory: 'Milk',
        farmerId: 'FARMER-006',
        categoryId: dairy.id,
      },
    }),
    // Grains & Cereals
    prisma.product.upsert({
      where: { name: 'Wimbi (Finger Millet) Flour' },
      update: {},
      create: {
        name: 'Wimbi (Finger Millet) Flour',
        description: 'Nutritious finger millet flour, perfect for ugali and porridge. Gluten-free.',
        price: 220,
        unit: 'kg',
        image: 'wimbi.jpg',
        gallery: ['wimbi1.jpg', 'wimbi2.jpg'],
        stock: 40,
        isAvailable: true,
        featured: true,
        organic: true,
        delivery: true,
        rating: 4.6,
        reviewCount: 98,
        tags: ['organic', 'gluten-free', 'traditional', 'nutritious'],
        subcategory: 'Flours',
        farmerId: 'FARMER-007',
        categoryId: grains.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Ndengu (Green Grams)' },
      update: {},
      create: {
        name: 'Ndengu (Green Grams)',
        description: 'Premium quality green grams. Cook quickly, delicious in stews.',
        price: 180,
        unit: 'kg',
        image: 'ndengu.jpg',
        gallery: ['ndengu1.jpg'],
        stock: 35,
        isAvailable: true,
        featured: false,
        organic: true,
        delivery: true,
        rating: 4.5,
        reviewCount: 76,
        tags: ['organic', 'legumes', 'protein-rich'],
        subcategory: 'Legumes',
        farmerId: 'FARMER-008',
        categoryId: grains.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Mixed Beans' },
      update: {},
      create: {
        name: 'Mixed Beans',
        description: 'Assorted beans mix - rosecoco, wairimu, and kidney beans.',
        price: 160,
        unit: 'kg',
        image: 'beans.jpg',
        gallery: [],
        stock: 45,
        isAvailable: true,
        featured: false,
        organic: false,
        delivery: true,
        rating: 4.4,
        reviewCount: 54,
        tags: ['legumes', 'protein', 'stew'],
        subcategory: 'Legumes',
        farmerId: 'FARMER-008',
        categoryId: grains.id,
      },
    }),
    // Honey
    prisma.product.upsert({
      where: { name: 'Pure Raw Honey' },
      update: {},
      create: {
        name: 'Pure Raw Honey',
        description: '100% pure raw honey from our apiaries. Unpasteurized, retaining all enzymes.',
        price: 800,
        unit: '500g jar',
        image: 'honey.jpg',
        gallery: ['honey1.jpg', 'honey2.jpg', 'honey3.jpg'],
        stock: 15,
        isAvailable: true,
        featured: true,
        organic: true,
        delivery: true,
        rating: 5.0,
        reviewCount: 87,
        tags: ['organic', 'raw', 'unpasteurized', 'natural-sweetener'],
        subcategory: 'Raw Honey',
        farmerId: 'FARMER-009',
        categoryId: honey.id,
      },
    }),
    prisma.product.upsert({
      where: { name: 'Honey Comb' },
      update: {},
      create: {
        name: 'Honey Comb',
        description: 'Natural honey comb - eat the wax and all! Premium delicacy.',
        price: 1200,
        unit: 'piece',
        image: 'honeycomb.jpg',
        gallery: ['honeycomb1.jpg'],
        stock: 8,
        isAvailable: true,
        featured: false,
        organic: true,
        delivery: true,
        rating: 4.8,
        reviewCount: 23,
        tags: ['organic', 'raw', 'premium', 'comb'],
        subcategory: 'Raw Honey',
        farmerId: 'FARMER-009',
        categoryId: honey.id,
      },
    }),
  ])
  console.log('✅ Products created:', products.length)

  console.log('🌱 Seeding completed!')
  console.log('📋 Admin: admin@leema.tech / admin123')
  console.log('📋 Customer: customer@leema.tech / customer123')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(async () => { await prisma.$disconnect() })
