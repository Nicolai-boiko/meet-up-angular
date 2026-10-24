import { Router } from 'express'
import * as AdminController from '../controllers/admin.controller'
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/stats', authMiddleware, adminMiddleware, AdminController.getStats)

export default router
