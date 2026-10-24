import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import multer, { type FileFilterCallback } from 'multer'
import path from 'path'
import fs from 'fs'
import { prisma } from '../config/database'

interface AuthRequest extends Request {
  user?: { userId: string; email: string }
  file?: Express.Multer.File
}

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads', 'avatars'),
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (err: Error | null, name: string) => void,
  ) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowed = /jpeg|jpg|png|gif|webp/
    const ok =
      allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase())
    cb(null, ok)
  },
})

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatar: true,
        createdAt: true,
      },
    })
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' })
    res.json(user)
  } catch (error) {
    console.error('getProfile error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId)
    const { firstName, lastName, birthDate, avatar } = req.body

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(firstName !== undefined && { firstName: firstName || null }),
        ...(lastName !== undefined && { lastName: lastName || null }),
        ...(birthDate !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
        ...(avatar !== undefined && { avatar }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatar: true,
        createdAt: true,
      },
    })
    res.json(user)
  } catch (error) {
    console.error('updateProfile error:', error)
    res.status(500).json({ message: 'Ошибка сервера при обновлении профиля' })
  }
}

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId)
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Укажите текущий и новый пароль' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Новый пароль должен быть не менее 6 символов' })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' })

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isMatch) {
      return res.status(400).json({ message: 'Текущий пароль неверен' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    })

    res.json({ message: 'Пароль успешно изменён' })
  } catch {}
}

export const uploadAvatar = async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId)
    if (!req.file) return res.status(400).json({ message: 'Файл не загружен' })

    const avatarUrl = `/uploads/avatars/${req.file.filename}`

    // удалить старый файл аватара если был
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } })
    if (user?.avatar?.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, '..', '..', user.avatar)
      fs.unlink(oldPath, () => {})
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        avatar: true,
        createdAt: true,
      },
    })
    res.json(updated)
  } catch (error) {
    console.error('uploadAvatar error:', error)
    res.status(500).json({ message: 'Ошибка сервера при загрузке аватара' })
  }
}
