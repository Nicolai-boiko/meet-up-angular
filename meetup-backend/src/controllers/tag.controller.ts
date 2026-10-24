import { Request, Response } from 'express'
import { prisma } from '../config/database'

export const getAll = async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } })
    res.json(tags)
  } catch (error) {
    console.error('getAll tags error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const create = async (req: Request, res: Response) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ message: 'Название тега обязательно' })

    const existing = await prisma.tag.findUnique({ where: { name } })
    if (existing) return res.json(existing)

    const tag = await prisma.tag.create({ data: { name } })
    res.status(201).json(tag)
  } catch (error) {
    console.error('create tag error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const remove = async (req: Request, res: Response) => {
  try {
    await prisma.tag.delete({ where: { id: Number(req.params.id) } })
    res.json({ message: 'Тег удалён' })
  } catch (error) {
    console.error('delete tag error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}
