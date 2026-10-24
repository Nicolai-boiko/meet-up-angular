import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { parsePagination, paginatedResponse } from '../utils/pagination'

interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string }
}

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN'
    const { page, limit, skip } = parsePagination(
      req.query as { page?: string; limit?: string; search?: string },
    )
    const search = (req.query.search as string)?.trim() || ''

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    // Сортировка
    const sortBy = (req.query.sortBy as string) || 'name'
    const sortOrder = (req.query.sortOrder as string) === 'desc' ? 'desc' : 'asc'
    const allowedSortFields = ['name', 'email', 'role']
    const field = allowedSortFields.includes(sortBy) ? sortBy : 'name'
    const orderBy = { [field]: sortOrder }

    const select = {
      id: true,
      name: true,
      email: true,
      avatar: true,
      firstName: true,
      lastName: true,
      ...(isAdmin ? { role: true } : {}),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, select, skip, take: limit, orderBy }),
      prisma.user.count({ where }),
    ])

    res.json(paginatedResponse(users, total, page, limit))
  } catch (error) {
    console.error('getUsers error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const updateUserRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { role } = req.body

    if (!role || !['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Роль должна быть USER или ADMIN' })
    }

    const targetUser = await prisma.user.findUnique({ where: { id: Number(id) } })
    if (!targetUser) {
      return res.status(404).json({ message: 'Пользователь не найден' })
    }

    if (Number(id) === Number(req.user!.userId)) {
      return res.status(400).json({ message: 'Нельзя изменить собственную роль' })
    }

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    })

    res.json({ message: 'Роль обновлена', user })
  } catch (error) {
    console.error('updateUserRole error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}
