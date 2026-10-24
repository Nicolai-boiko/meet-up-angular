import { Request, Response } from 'express'
import { prisma } from '../config/database'

interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string }
}

export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Новые пользователи по дням за 30 дней
    const usersByDay = await prisma.$queryRawUnsafe<{ date: string; count: bigint }[]>(
      `SELECT DATE("createdAt") as date, COUNT(*)::int as count
       FROM "User"
       WHERE "createdAt" >= $1
       GROUP BY DATE("createdAt")
       ORDER BY date ASC`,
      thirtyDaysAgo,
    )

    const [
      contentByType,
      topAuthorsRaw,
      contentByTagRaw,
      totalUsers,
      totalContent,
      totalMeetings,
      totalFiles,
      totalStorage,
    ] = await Promise.all([
      // Материалы по типам
      prisma.content.groupBy({ by: ['type'], _count: { id: true } }),

      // Топ-5 авторов
      prisma.content.groupBy({
        by: ['authorId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),

      // Материалы по тегам
      prisma.contentTag.groupBy({ by: ['tagId'], _count: true }),

      // Счётчики
      prisma.user.count(),
      prisma.content.count(),
      prisma.meeting.count(),
      prisma.contentFile.count(),
      prisma.contentFile.aggregate({ _sum: { fileSize: true } }),
    ])

    // Дозапросить имена авторов
    const authorIds = topAuthorsRaw.map((a) => a.authorId)
    const authors = authorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, avatar: true },
        })
      : []
    const authorMap = new Map(authors.map((a) => [a.id, a]))

    const topAuthors = topAuthorsRaw.map((a) => {
      const user = authorMap.get(a.authorId)
      return {
        id: a.authorId,
        name: user?.name ?? 'Неизвестный',
        avatar: user?.avatar ?? null,
        count: a._count.id,
      }
    })

    // Дозапросить названия тегов
    const tagIds = contentByTagRaw.map((t) => t.tagId)
    const tags = tagIds.length
      ? await prisma.tag.findMany({
          where: { id: { in: tagIds } },
          select: { id: true, name: true },
        })
      : []
    const tagMap = new Map(tags.map((t) => [t.id, t.name]))

    const contentByTag = contentByTagRaw.map((t) => ({
      tagId: t.tagId,
      tagName: tagMap.get(t.tagId) ?? `#${t.tagId}`,
      count: t._count,
    }))

    res.json({
      totals: {
        users: totalUsers,
        content: totalContent,
        meetings: totalMeetings,
        files: totalFiles,
        totalStorage: totalStorage._sum.fileSize ?? 0,
      },
      usersByDay: usersByDay.map((d) => ({ date: d.date, count: Number(d.count) })),
      contentByType: contentByType.map((c) => ({ type: c.type, count: c._count.id })),
      topAuthors,
      contentByTag,
    })
  } catch (error) {
    console.error('admin getStats error:', error)
    res.status(500).json({ message: 'Ошибка сервера при получении статистики' })
  }
}
