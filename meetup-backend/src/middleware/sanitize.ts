import { Request, Response, NextFunction } from 'express'
import { sanitizeInput } from '../utils/sanitize'

/**
 * Middleware that sanitizes req.body against XSS.
 * Apply only to JSON routes (not multipart/form-data).
 */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    req.body = sanitizeInput(req.body)
  }
  next()
}
