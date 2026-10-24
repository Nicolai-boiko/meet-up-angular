import { Router } from 'express'
import * as MeetupController from '../controllers/meetup.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { sanitizeBody } from '../middleware/sanitize'

const router = Router()

router.get('/', MeetupController.getAllMeetups)
router.get('/:id/ics', MeetupController.getMeetupIcs)
router.get('/:id', MeetupController.getMeetupById)
router.post('/', authMiddleware, sanitizeBody, MeetupController.createMeetup)
router.put('/:id', authMiddleware, sanitizeBody, MeetupController.updateMeetup)
router.delete('/:id', authMiddleware, sanitizeBody, MeetupController.deleteMeetup)
router.post('/:id/join', authMiddleware, MeetupController.joinMeetup)
router.post('/:id/decline', authMiddleware, MeetupController.declineMeetup)

export default router
