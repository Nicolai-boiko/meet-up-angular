import { Router } from 'express'
import * as AuthController from '../controllers/auth.controller'
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimit'
import { sanitizeBody } from '../middleware/sanitize'

const router = Router()

router.post('/register', registerLimiter, sanitizeBody, AuthController.register)
router.post('/login', loginLimiter, sanitizeBody, AuthController.login)
router.post('/forgot-password', forgotPasswordLimiter, sanitizeBody, AuthController.forgotPassword)
router.post('/reset-password', resetPasswordLimiter, sanitizeBody, AuthController.resetPassword)
router.post('/refresh', sanitizeBody, AuthController.refresh)
router.post('/logout', sanitizeBody, AuthController.logout)

export default router
