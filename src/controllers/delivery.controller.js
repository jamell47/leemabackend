export const assignDeliveryToPerson = async (req, res, next) => {
  try {
    const { id } = req.params
    const { deliveryPersonId, notes } = req.body
    if (!deliveryPersonId) throw new AppError('Delivery person ID is required', 400, 'VALIDATION_ERROR')

    const delivery = await prisma.delivery.findUnique({ where: { id }, include: { order: true } })
    if (!delivery) throw new AppError('Delivery not found', 404, 'NOT_FOUND')
    if (delivery.order.status !== 'PAID' && delivery.order.status !== 'PROCESSING') throw new AppError('Order must be PAID or PROCESSING', 400, 'INVALID_ORDER_STATUS')
    if (delivery.status !== 'UNASSIGNED') throw new AppError('Delivery is already assigned', 400, 'ALREADY_ASSIGNED')

    const dp = await prisma.deliveryPerson.findUnique({ where: { id: deliveryPersonId }, include: { user: true } })
    if (!dp) throw new AppError('Delivery person not found', 404, 'NOT_FOUND')
    if (dp.availability !== 'AVAILABLE') throw new AppError('Delivery person is not available', 400, 'NOT_AVAILABLE')
    if (dp.status !== 'ACTIVE') throw new AppError('Delivery person is not active', 400, 'NOT_ACTIVE')

    const updated = await prisma.delivery.update({
      where: { id },
      data: { deliveryPersonId, status: 'ASSIGNED', assignedAt: new Date(), notes: notes || delivery.notes, address: delivery.address || delivery.order.deliveryAddress },
      include: { order: true, deliveryPerson: { include: { user: { select: { name: true, phone: true, email: true } } } } },
    })

    if (delivery.order.status === 'PAID') {
      await prisma.order.update({ where: { id: delivery.orderId }, data: { status: 'PROCESSING' } })
    }

    try {
      await createNotification({
        userId: dp.userId, type: 'DELIVERY_ASSIGNED',
        title: 'New Delivery Assigned',
        message: `Order ${delivery.order?.orderNumber || 'N/A'} has been assigned to you.`,
        data: JSON.stringify({ deliveryId: id, orderNumber: delivery.order?.orderNumber }),
      })
    } catch (e) {}

    res.json({ success: true, message: `Delivery assigned to ${dp.user.name}`, data: updated })
  } catch (error) { next(error) }
}

export const getAvailableDeliveryPeopleList = async (req, res, next) => {
  try {
    const deliveryPeople = await prisma.deliveryPerson.findMany({
      where: { availability: 'AVAILABLE', status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: deliveryPeople.map(dp => ({ ...dp, user: dp.user })) })
  } catch (error) { next(error) }
}

export default {
  createDeliveryPerson,
  getDeliveryPeople,
  getDeliveryPersonById,
  updateDeliveryPersonById,
  deleteDeliveryPersonById,
  getMyDeliveries,
  updateDeliveryStatusById,
  assignDeliveryToPerson,
  getAvailableDeliveryPeopleList,
}