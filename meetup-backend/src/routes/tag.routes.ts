import { Router } from 'express'
import * as TagController from '../controllers/tag.controller'
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware'
import { sanitizeBody } from '../middleware/sanitize'

const router = Router()

router.get('/', TagController.getAll)
router.post('/', authMiddleware, adminMiddleware, sanitizeBody, TagController.create)
router.delete('/:id', authMiddleware, adminMiddleware, TagController.remove)

export default router
