import express from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js'
import * as deliveryController from '../controllers/delivery.controller.js'

const router = express.Router()

// Admin routes for delivery people
router.post('/', authenticate, requireAdmin, deliveryController.createDeliveryPerson)
router.get('/', authenticate, requireAdmin, deliveryController.getDeliveryPeople)
router.get('/available', authenticate, requireAdmin, deliveryController.getAvailableDeliveryPeopleList)
router.get('/:id', authenticate, requireAdmin, deliveryController.getDeliveryPersonById)
router.put('/:id', authenticate, requireAdmin, deliveryController.updateDeliveryPersonById)
router.delete('/:id', authenticate, requireAdmin, deliveryController.deleteDeliveryPersonById)

// Delivery routes
router.get('/deliveries', authenticate, requireAdmin, deliveryController.getDeliveryPeople) // Reuse for admin delivery list
router.post('/deliveries/:id/assign', authenticate, requireAdmin, deliveryController.assignDeliveryToPerson)

// Delivery person routes
router.get('/me/deliveries', authenticate, deliveryController.getMyDeliveries)
router.put('/deliveries/:id/status', authenticate, deliveryController.updateDeliveryStatusById)

export default router