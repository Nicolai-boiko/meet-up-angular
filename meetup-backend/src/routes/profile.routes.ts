import { Router } from 'express'
import * as ProfileController from '../controllers/profile.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { sanitizeBody } from '../middleware/sanitize'

const router = Router()

router.get('/', authMiddleware, ProfileController.getProfile)
router.put('/', authMiddleware, sanitizeBody, ProfileController.updateProfile)
router.put('/password', authMiddleware, sanitizeBody, ProfileController.changePassword)
router.post(
  '/avatar',
  authMiddleware,
  ProfileController.upload.single('avatar'),
  ProfileController.uploadAvatar,
)

export default router
