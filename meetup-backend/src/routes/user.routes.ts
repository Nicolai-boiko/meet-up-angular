import { Router } from 'express'
import * as UserController from '../controllers/user.controller'
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.get('/', authMiddleware, UserController.getUsers)
router.put('/:id/role', authMiddleware, adminMiddleware, UserController.updateUserRole)

export default router
