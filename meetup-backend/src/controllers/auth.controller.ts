import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../config/database'
import { sendPasswordResetEmail } from '../services/email'

// ── Refresh token helpers ──

const REFRESH_TOKEN_BYTES = 64
const REFRESH_TOKEN_DAYS = 30

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

async function generateRefreshToken(userId: number): Promise<string> {
  const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  })
  return raw
}

// ── Auth controllers ──

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Пожалуйста, укажите имя, email и пароль' })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    })

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' },
    )

    const refreshToken = await generateRefreshToken(user.id)

    res
      .status(201)
      .json({
        message: 'Пользователь создан',
        token,
        refreshToken,
        userId: user.id,
        role: user.role,
      })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ message: 'Ошибка сервера при регистрации' })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Пожалуйста, укажите email и пароль' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(400).json({ message: 'Неверные учетные данные' })
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      return res.status(400).json({ message: 'Неверные учетные данные' })
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' },
    )

    const refreshToken = await generateRefreshToken(user.id)

    res.json({ token, refreshToken, userId: user.id, role: user.role })
  } catch {}
}

export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      return res.status(400).json({ message: 'refreshToken обязателен' })
    }

    const hashed = hashToken(refreshToken)
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashed },
      include: { user: true },
    })

    if (!existing || existing.expiresAt < new Date()) {
      // Удаляем просроченный токен если есть
      if (existing) {
        await prisma.refreshToken.delete({ where: { id: existing.id } })
      }
      return res.status(401).json({ message: 'Refresh-токен недействителен или истёк' })
    }

    // Token rotation: удаляем старый, создаём новый
    const [newRefreshToken] = await Promise.all([
      generateRefreshToken(existing.userId),
      prisma.refreshToken.delete({ where: { id: existing.id } }),
    ])

    const user = existing.user
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' },
    )

    res.json({ token, refreshToken: newRefreshToken, userId: user.id, role: user.role })
  } catch (error) {
    console.error('refresh error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const logout = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      const hashed = hashToken(refreshToken)
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashed } })
    }
    res.json({ message: 'Выход выполнен' })
  } catch (error) {
    console.error('logout error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ message: 'Email обязателен' })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Всегда отвечаем одинаково — не раскрываем существование пользователя
    if (user) {
      // Удаляем старые токены пользователя
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

      const token = crypto.randomBytes(32).toString('hex')
      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 час
        },
      })

      await sendPasswordResetEmail(user.email, token)
    }

    res.json({
      message: 'Если пользователь с таким email существует, инструкция отправлена на почту',
    })
  } catch (error) {
    console.error('forgotPassword error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Токен и новый пароль обязательны' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Пароль должен быть не менее 6 символов' })
    }

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } })
    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Токен недействителен или истёк' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ])

    res.json({ message: 'Пароль успешно изменён. Теперь вы можете войти.' })
  } catch (error) {
    console.error('resetPassword error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}
