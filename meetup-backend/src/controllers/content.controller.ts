import { Request, Response } from 'express'
import multer, { type FileFilterCallback } from 'multer'
import path from 'path'
import fs from 'fs'
import { prisma } from '../config/database'
import { parsePagination, paginatedResponse } from '../utils/pagination'
import type { ContentWhereInput, ContentUpdateData } from '../interfaces'

interface AuthRequest extends Request {
  user?: { userId: string; email: string }
  file?: Express.Multer.File
}

// ── File upload setup ──

const fileStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads', 'files'),
  filename: (_, file, cb) => {
    // Исправляем кодировку для кириллицы (multer issue с latin1)
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8')
    const safeName = original.replace(/[<>:"/\\|?*]/g, '_')
    cb(null, `file-${Date.now()}-${safeName}`)
  },
})

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowedExtensions =
    /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z|jpg|jpeg|png|gif|webp|svg|mp3|mp4|mov|avi/
  const allowedMimes =
    /pdf|msword|officedocument|spreadsheet|presentation|text\/plain|csv|zip|rar|x-7z|image\/|audio\/|video\//
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '')
  const extOk = allowedExtensions.test(ext)
  const mimeOk = allowedMimes.test(file.mimetype)
  cb(null, extOk && mimeOk)
}

export const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter,
}).single('file')

export const multiFileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter,
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: 20 },
])

const authorSelect = { select: { id: true, name: true, avatar: true } }

interface ContentRow {
  contentTags?: Array<{ tag: { id: number; name: string } }>
  files?: Array<{
    id: number
    contentId: number
    fileName: string
    filePath: string
    fileSize: number | null
    createdAt: Date
  }>
  favorites?: Array<{ userId: number }>
  [key: string]: unknown
}

function itemToResponse(item: ContentRow, userId?: number) {
  return {
    ...item,
    tags: item.contentTags?.map((ct) => ct.tag) ?? [],
    files: item.files ?? [],
    isFavorited: userId ? (item.favorites?.some((f) => f.userId === userId) ?? false) : false,
  }
}

export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string })
    const tagId = req.query.tagId ? Number(req.query.tagId) : null
    const favoritesOnly = req.query.favorites === '1'
    const authReq = req as AuthRequest
    const userId = authReq.user ? Number(authReq.user.userId) : null

    // Сортировка
    const sortBy = (req.query.sortBy as string) || 'createdAt'
    const sortOrder: 'asc' | 'desc' = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc'
    const allowedSortFields = ['createdAt', 'title', 'type']
    const field = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt'
    const orderBy = { [field]: sortOrder } as Record<string, 'asc' | 'desc'>

    const where: ContentWhereInput = {}
    if (tagId) {
      where.contentTags = { some: { tagId } }
    }
    if (favoritesOnly && userId) {
      where.favorites = { some: { userId } }
    }

    const include = {
      author: authorSelect,
      contentTags: { include: { tag: true } },
      files: { orderBy: { createdAt: 'asc' as const } },
      ...(userId ? { favorites: { where: { userId }, select: { userId: true } } } : {}),
    }

    const [items, total] = await Promise.all([
      prisma.content.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include,
      }),
      prisma.content.count({ where }),
    ])

    res.json(
      paginatedResponse(
        items.map((i) => itemToResponse(i, userId ?? undefined)),
        total,
        page,
        limit,
      ),
    )
  } catch (error) {
    console.error('content getAll error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const getById = async (req: Request, res: Response) => {
  try {
    const item = await prisma.content.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        author: authorSelect,
        contentTags: { include: { tag: true } },
        files: { orderBy: { createdAt: 'asc' as const } },
      },
    })
    if (!item) return res.status(404).json({ message: 'Материал не найден' })
    res.json(itemToResponse(item))
  } catch (error) {
    console.error('content getById error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const { title, type, body, mediaUrl, tagIds } = req.body
    if (!title || !type) {
      return res.status(400).json({ message: 'Название и тип обязательны' })
    }

    // Нормализация tagIds из FormData (может быть строкой или массивом)
    const normalizedTagIds: number[] = tagIds
      ? (Array.isArray(tagIds) ? tagIds : [tagIds]).map(Number).filter(Boolean)
      : []

    // Извлекаем файлы из .fields() middleware: { file: File[], files: File[] }
    const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const mainFile = filesMap?.['file']?.[0]
    const additionalFiles = filesMap?.['files'] ?? []

    // Основной файл (backward compat): mediaUrl/fileName на Content
    let fileMediaUrl = mediaUrl ?? null
    let fileName: string | null = null
    if (type === 'file' && mainFile) {
      fileMediaUrl = `/uploads/files/${mainFile.filename}`
      fileName = Buffer.from(mainFile.originalname, 'latin1').toString('utf8')
    }

    const item = await prisma.content.create({
      data: {
        title,
        type,
        body: body ?? null,
        mediaUrl: fileMediaUrl,
        fileName,
        authorId: Number(req.user!.userId),
        contentTags: normalizedTagIds.length
          ? { create: normalizedTagIds.map((tagId) => ({ tagId })) }
          : undefined,
        files: additionalFiles.length
          ? {
              create: additionalFiles.map((f) => ({
                fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
                filePath: `/uploads/files/${f.filename}`,
                fileSize: f.size,
              })),
            }
          : undefined,
      },
      include: {
        author: authorSelect,
        contentTags: { include: { tag: true } },
        files: { orderBy: { createdAt: 'asc' as const } },
      },
    })
    res.status(201).json(itemToResponse(item))
  } catch (error) {
    console.error('content create error:', error)
    res.status(500).json({ message: 'Ошибка сервера при создании' })
  }
}

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { title, type, body, mediaUrl, tagIds } = req.body

    if (tagIds !== undefined) {
      // Нормализация tagIds из FormData
      const normalizedTagIds: number[] = tagIds
        ? (Array.isArray(tagIds) ? tagIds : [tagIds]).map(Number).filter(Boolean)
        : []

      // Sync tags: delete old, create new
      await prisma.contentTag.deleteMany({ where: { contentId: Number(id) } })
      if (normalizedTagIds.length) {
        await prisma.contentTag.createMany({
          data: normalizedTagIds.map((tagId) => ({ contentId: Number(id), tagId })),
        })
      }
    }

    const data: ContentUpdateData = {}
    if (title !== undefined) data.title = title
    if (type !== undefined) data.type = type
    if (body !== undefined) data.body = body
    if (mediaUrl !== undefined) data.mediaUrl = mediaUrl

    // Извлекаем файлы из .fields() middleware
    const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const mainFile = filesMap?.['file']?.[0]
    const additionalFiles = filesMap?.['files'] ?? []

    // Основной файл (backward compat)
    if (mainFile) {
      const existing = await prisma.content.findUnique({
        where: { id: Number(id) },
        select: { mediaUrl: true },
      })
      if (existing?.mediaUrl) {
        const oldPath = path.join(__dirname, '..', '..', existing.mediaUrl)
        fs.unlink(oldPath, () => {})
      }
      data.mediaUrl = `/uploads/files/${mainFile.filename}`
      data.fileName = Buffer.from(mainFile.originalname, 'latin1').toString('utf8')
    }

    const item = await prisma.content.update({
      where: { id: Number(id) },
      data,
      include: {
        author: authorSelect,
        contentTags: { include: { tag: true } },
        files: { orderBy: { createdAt: 'asc' as const } },
      },
    })

    // Создаём ContentFile записи для дополнительных файлов
    if (additionalFiles.length) {
      await prisma.contentFile.createMany({
        data: additionalFiles.map((f) => ({
          contentId: Number(id),
          fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
          filePath: `/uploads/files/${f.filename}`,
          fileSize: f.size,
        })),
      })
      // Перезагружаем чтобы вернуть актуальный список файлов
      const reloaded = await prisma.content.findUnique({
        where: { id: Number(id) },
        include: {
          author: authorSelect,
          contentTags: { include: { tag: true } },
          files: { orderBy: { createdAt: 'asc' as const } },
        },
      })
      if (!reloaded) return res.status(404).json({ message: 'Материал не найден' })
      return res.json(itemToResponse(reloaded))
    }

    res.json(itemToResponse(item))
  } catch (error) {
    console.error('content update error:', error)
    res.status(500).json({ message: 'Ошибка сервера при обновлении' })
  }
}

export const toggleFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const contentId = Number(req.params.id)
    const userId = Number(req.user!.userId)

    const existing = await prisma.favorite.findUnique({
      where: { userId_contentId: { userId, contentId } },
    })

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } })
      res.json({ favorited: false })
    } else {
      await prisma.favorite.create({ data: { userId, contentId } })
      res.json({ favorited: true })
    }
  } catch (error) {
    console.error('toggleFavorite error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

export const remove = async (req: Request, res: Response) => {
  try {
    await prisma.content.delete({ where: { id: Number(req.params.id) } })
    res.json({ message: 'Материал удалён' })
  } catch (error) {
    console.error('content delete error:', error)
    res.status(500).json({ message: 'Ошибка сервера при удалении' })
  }
}

export const bulkDelete = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids должен быть непустым массивом' })
    }
    const numericIds = ids.map(Number)
    const result = await prisma.content.deleteMany({ where: { id: { in: numericIds } } })
    res.json({ deleted: result.count })
  } catch (error) {
    console.error('content bulkDelete error:', error)
    res.status(500).json({ message: 'Ошибка сервера при удалении' })
  }
}

// ── File management ──

export const uploadFile = async (req: AuthRequest, res: Response) => {
  try {
    const contentId = Number(req.params.id)
    if (!req.file) {
      return res.status(400).json({ message: 'Файл обязателен' })
    }

    const file = await prisma.contentFile.create({
      data: {
        contentId,
        fileName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
        filePath: `/uploads/files/${req.file.filename}`,
        fileSize: req.file.size,
      },
    })

    res.status(201).json(file)
  } catch (error) {
    console.error('uploadFile error:', error)
    res.status(500).json({ message: 'Ошибка сервера при загрузке файла' })
  }
}

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const fileId = Number(req.params.fileId)
    const file = await prisma.contentFile.findUnique({ where: { id: fileId } })
    if (!file) return res.status(404).json({ message: 'Файл не найден' })

    // Удаляем с диска
    const filePath = path.join(__dirname, '..', '..', file.filePath)
    fs.unlink(filePath, () => {})

    await prisma.contentFile.delete({ where: { id: fileId } })
    res.json({ message: 'Файл удалён' })
  } catch (error) {
    console.error('deleteFile error:', error)
    res.status(500).json({ message: 'Ошибка сервера при удалении файла' })
  }
}
