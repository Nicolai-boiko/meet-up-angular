import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string }
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    return next()
  }

  try {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({ message: 'Нет авторизации' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!)
    req.user = decoded as { userId: string; email: string; role: string }
    next()
  } catch {
    res.status(401).json({ message: 'Нет авторизации' })
  }
}

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!)
      req.user = decoded as { userId: string; email: string; role: string }
    }
  } catch {
    // Игнорируем — пользователь просто не авторизован
  }
  next()
}

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Доступ запрещён. Требуются права администратора.' })
  }
  next()
}
