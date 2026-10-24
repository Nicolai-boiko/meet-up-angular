import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'

interface AuthRequest extends Request {
  user?: { userId: string; email: string }
}

export const getAllRooms = async (_req: Request, res: Response) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, slug: true, isActive: true },
    })
    res.json(rooms)
  } catch (error) {
    console.error('getAllRooms error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const getRoomBySlug = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string
    const room = await prisma.room.findUnique({
      where: { slug },
      include: { host: { select: { id: true, name: true, email: true } } },
    })
    if (!room) return res.status(404).json({ message: 'Комната не найдена' })

    // Для приватных комнат проверяем доступ
    if (room.isPrivate) {
      const authReq = req as AuthRequest
      const userId = authReq.user ? Number(authReq.user.userId) : null
      const meetingId = parseInt(req.query.meetingId as string)
      let hasAccess = false

      // Хост комнаты — всегда имеет доступ
      if (userId && userId === room.hostId) {
        hasAccess = true
      }

      // Участник встречи или хост встречи
      if (!hasAccess && meetingId && userId) {
        const meeting = await prisma.meeting.findUnique({
          where: { id: meetingId },
          select: {
            hostId: true,
            meetingParticipants: { where: { userId }, select: { id: true } },
          },
        })
        if (meeting && (meeting.hostId === userId || meeting.meetingParticipants.length > 0)) {
          hasAccess = true
        }
      }

      if (!hasAccess) {
        // Возвращаем ограниченную информацию
        res.status(200).json({
          id: room.id,
          title: room.title,
          slug: room.slug,
          isActive: room.isActive,
          isPrivate: true,
        })
        return
      }
    }

    // Публичная комната или есть доступ: полная информация
    res.status(200).json({ ...room, isPrivate: room.isPrivate })
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { title, slug, password, isPrivate } = req.body
    const hostId = Number(req.user?.userId)
    if (!title || !slug) return res.status(400).json({ message: 'Название и slug обязательны' })

    // Хешируем пароль если передан
    let passwordHash: string | null = null
    if (password && typeof password === 'string' && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10)
    }

    const existing = await prisma.room.findUnique({ where: { slug } })

    if (existing) {
      if (existing.isActive) {
        return res.status(409).json({
          message:
            'Комната с таким названием уже активна. Присоединитесь к ней через поле "Войти".',
          room: existing,
        })
      }
      // Reactivate inactive room
      const room = await prisma.room.update({
        where: { id: existing.id },
        data: { isActive: true, hostId, passwordHash, isPrivate: !!passwordHash || !!isPrivate },
      })
      return res.status(200).json(room)
    }

    const room = await prisma.room.create({
      data: {
        title,
        slug,
        hostId,
        isActive: true,
        passwordHash,
        isPrivate: !!passwordHash || !!isPrivate,
      },
    })
    res.status(201).json(room)
  } catch (error) {
    console.error('createRoom error:', error)
    res.status(500).json({ message: 'Ошибка сервера при создании комнаты' })
  }
}

export const updateRoomStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { isActive } = req.body
    const room = await prisma.room.update({
      where: { id: Number(id) },
      data: { isActive },
    })
    res.status(200).json(room)
  } catch {
    res.status(500).json({ message: 'Ошибка сервера при обновлении комнаты' })
  }
}

export const deleteRoom = async (_req: Request, res: Response) => {
  try {
    const { id } = _req.params
    await prisma.room.delete({ where: { id: Number(id) } })
    res.json({ message: 'Комната удалена' })
  } catch (error) {
    console.error('deleteRoom error:', error)
    res.status(500).json({ message: 'Ошибка сервера при удалении комнаты' })
  }
}

export const verifyRoomPassword = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ message: 'Пароль обязателен' })
    }

    const room = await prisma.room.findUnique({
      where: { slug },
      select: { passwordHash: true },
    })
    if (!room || !room.passwordHash) {
      return res.status(404).json({ message: 'Комната не найдена или не защищена паролем' })
    }

    const valid = await bcrypt.compare(password, room.passwordHash)
    if (!valid) {
      return res.status(403).json({ message: 'Неверный пароль' })
    }

    res.json({ ok: true })
  } catch (error) {
    console.error('verifyRoomPassword error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const getMessages = async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50)

    const messages = await prisma.chatMessage.findMany({
      where: { roomSlug: slug },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })

    res.json(
      messages.map((m) => ({
        id: String(m.id),
        socketId: m.socketId,
        text: m.text,
        userName: m.userName,
        initials: m.initials,
        avatar: m.avatar,
        timestamp: m.createdAt.toISOString(),
      })),
    )
  } catch (error) {
    console.error('getMessages error:', error)
    res.status(500).json({ message: 'Ошибка сервера при загрузке сообщений' })
  }
}

export const bulkDelete = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids должен быть непустым массивом' })
    }
    const numericIds = ids.map(Number)
    const result = await prisma.room.deleteMany({ where: { id: { in: numericIds } } })
    res.json({ deleted: result.count })
  } catch (error) {
    console.error('room bulkDelete error:', error)
    res.status(500).json({ message: 'Ошибка сервера при удалении комнат' })
  }
}
