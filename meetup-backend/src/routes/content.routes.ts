import { Router } from 'express'
import * as ContentController from '../controllers/content.controller'
import { authMiddleware, adminMiddleware, optionalAuth } from '../middleware/auth.middleware'
import { sanitizeBody } from '../middleware/sanitize'

const router = Router()

router.get('/', optionalAuth, ContentController.getAll)
router.get('/:id', ContentController.getById)
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  ContentController.multiFileUpload,
  ContentController.create,
)
router.post('/:id/favorite', authMiddleware, ContentController.toggleFavorite)
router.post(
  '/:id/files',
  authMiddleware,
  adminMiddleware,
  ContentController.fileUpload,
  ContentController.uploadFile,
)
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  ContentController.multiFileUpload,
  ContentController.update,
)
router.delete('/:id', authMiddleware, adminMiddleware, ContentController.remove)
router.delete('/:id/files/:fileId', authMiddleware, adminMiddleware, ContentController.deleteFile)
router.post(
  '/bulk-delete',
  authMiddleware,
  adminMiddleware,
  sanitizeBody,
  ContentController.bulkDelete,
)

export default router
