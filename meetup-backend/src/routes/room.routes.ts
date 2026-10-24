import { Router } from 'express'
import * as RoomController from '../controllers/room.controller'
import { authMiddleware, adminMiddleware, optionalAuth } from '../middleware/auth.middleware'
import { sanitizeBody } from '../middleware/sanitize'

const router = Router()

router.get('/', RoomController.getAllRooms)
router.get('/:slug/messages', authMiddleware, RoomController.getMessages)
router.post('/:slug/verify', authMiddleware, sanitizeBody, RoomController.verifyRoomPassword)
router.get('/:slug', optionalAuth, RoomController.getRoomBySlug)
router.post('/', authMiddleware, sanitizeBody, RoomController.createRoom)
router.put('/:id', authMiddleware, sanitizeBody, RoomController.updateRoomStatus)
router.delete('/:id', authMiddleware, adminMiddleware, RoomController.deleteRoom)
router.post(
  '/bulk-delete',
  authMiddleware,
  adminMiddleware,
  sanitizeBody,
  RoomController.bulkDelete,
)

export default router
