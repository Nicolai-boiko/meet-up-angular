import { Request, Response } from 'express'
import { prisma } from '../config/database'
import { sendMeetingInviteEmail, sendMeetingUpdatedEmail } from '../services/email'
import { parsePagination, paginatedResponse } from '../utils/pagination'

interface AuthRequest extends Request {
  user?: { userId: string; email: string }
}

interface AuthRequest extends Request {
  user?: { userId: string; email: string }
}

const meetingInclude = {
  host: {
    select: { id: true, name: true, email: true, avatar: true, firstName: true, lastName: true },
  },
  meetingParticipants: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  room: { select: { id: true, title: true, slug: true, isActive: true, isPrivate: true } },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function meetingToResponse(m: any) {
  return {
    ...m,
    participants:
      m.meetingParticipants?.map(
        (mp: { user: Record<string, unknown>; status: string; id: number }) => ({
          ...mp.user,
          status: mp.status,
          meetingParticipantId: mp.id,
        }),
      ) ?? [],
    meetingParticipants: undefined,
  }
}

// ── Recurrence helpers ──

const RECURRENCE_INTERVALS: Record<string, (d: Date) => Date> = {
  DAILY: (d) => {
    const n = new Date(d)
    n.setDate(n.getDate() + 1)
    return n
  },
  WEEKLY: (d) => {
    const n = new Date(d)
    n.setDate(n.getDate() + 7)
    return n
  },
  BIWEEKLY: (d) => {
    const n = new Date(d)
    n.setDate(n.getDate() + 14)
    return n
  },
  MONTHLY: (d) => {
    const n = new Date(d)
    n.setMonth(n.getMonth() + 1)
    return n
  },
}

const MAX_RECURRENCE_INSTANCES = 366

function generateRecurrenceInstances(
  startTime: Date,
  endTime: Date,
  recurrenceType: string,
  recurrenceEndDate: Date,
): Array<{ startTime: Date; endTime: Date }> {
  const intervalFn = RECURRENCE_INTERVALS[recurrenceType]
  if (!intervalFn) return []

  const duration = endTime.getTime() - startTime.getTime()
  const instances: Array<{ startTime: Date; endTime: Date }> = []
  let current = intervalFn(new Date(startTime))

  while (current <= recurrenceEndDate && instances.length < MAX_RECURRENCE_INSTANCES) {
    instances.push({
      startTime: new Date(current),
      endTime: new Date(current.getTime() + duration),
    })
    current = intervalFn(current)
  }

  return instances
}

const VALID_RECURRENCE_TYPES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']

// ── GET / ──
export const getAllMeetups = async (req: Request, res: Response) => {
  try {
    const userIdsParam = req.query.userIds as string | undefined
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

    if (userIdsParam) {
      const ids = userIdsParam.split(',').map(Number).filter(Boolean)
      if (ids.length > 0) {
        where.OR = [
          { hostId: { in: ids } },
          { meetingParticipants: { some: { userId: { in: ids } } } },
        ]
      }
    }

    const [meetups, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        skip,
        take: limit,
        include: meetingInclude,
        orderBy: { startTime: 'asc' },
      }),
      prisma.meeting.count({ where }),
    ])

    res.status(200).json(paginatedResponse(meetups.map(meetingToResponse), total, page, limit))
  } catch (error) {
    console.error('getAllMeetups error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

// ── POST / ──
export const createMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      roomId,
      participantIds,
      recurrenceType,
      recurrenceEndDate,
    } = req.body
    const hostId = Number(req.user?.userId)

    if (!title || !startTime || !endTime) {
      return res
        .status(400)
        .json({ message: 'Необходимо указать название, время начала и окончания' })
    }

    // Валидация повторения
    if (recurrenceType && !VALID_RECURRENCE_TYPES.includes(recurrenceType)) {
      return res.status(400).json({ message: 'Недопустимый тип повторения' })
    }
    if (recurrenceType && !recurrenceEndDate) {
      return res.status(400).json({ message: 'Необходимо указать дату окончания повторений' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      title,
      description: description ?? null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      hostId,
    }

    if (roomId) {
      const room = await prisma.room.findUnique({ where: { id: Number(roomId) } })
      if (!room) return res.status(404).json({ message: 'Комната не найдена' })
      data.roomId = Number(roomId)
    }

    if (recurrenceType) {
      data.recurrenceType = recurrenceType
      data.recurrenceEndDate = new Date(recurrenceEndDate)
    }

    const invitedIds = (participantIds as number[] | undefined)?.filter((id) => id !== hostId) ?? []

    // Создаём родительскую встречу
    const meetup = await prisma.meeting.create({
      data: {
        ...data,
        meetingParticipants: invitedIds.length
          ? { create: invitedIds.map((userId) => ({ userId, status: 'INVITED' })) }
          : undefined,
      },
      include: meetingInclude,
    })

    // Генерируем дочерние вхождения
    if (recurrenceType && recurrenceEndDate) {
      const instances = generateRecurrenceInstances(
        new Date(startTime),
        new Date(endTime),
        recurrenceType,
        new Date(recurrenceEndDate),
      )

      if (instances.length > 0) {
        await prisma.meeting.createMany({
          data: instances.map((inst) => ({
            title,
            description: description ?? null,
            startTime: inst.startTime,
            endTime: inst.endTime,
            hostId,
            roomId: data.roomId ?? null,
            parentMeetingId: meetup.id,
          })),
        })

        // Создаём участников для всех дочерних встреч
        if (invitedIds.length > 0) {
          const childMeetings = await prisma.meeting.findMany({
            where: { parentMeetingId: meetup.id },
            select: { id: true },
          })
          const childParticipants = childMeetings.flatMap((cm) =>
            invitedIds.map((userId) => ({ meetingId: cm.id, userId, status: 'INVITED' })),
          )
          await prisma.meetingParticipant.createMany({ data: childParticipants })
        }
      }
    }

    // Отправляем email приглашённым (только для родительской встречи)
    if (invitedIds.length) {
      const invitedUsers = meetup.meetingParticipants.filter((mp) => mp.status === 'INVITED')
      for (const mp of invitedUsers) {
        if (mp.user.email) {
          sendMeetingInviteEmail(mp.user.email, title, new Date(startTime), meetup.id).catch((e) =>
            console.error('Failed to send invite email:', e),
          )
        }
      }
    }

    res.status(201).json({ message: 'Встреча создана', data: meetingToResponse(meetup) })
  } catch (error) {
    console.error('createMeetup error:', error)
    res.status(500).json({ message: 'Ошибка сервера при создании встречи' })
  }
}

// ── GET /:id ──
export const getMeetupById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const meetup = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: meetingInclude,
    })
    if (!meetup) return res.status(404).json({ message: 'Встреча не найдена' })
    res.status(200).json(meetingToResponse(meetup))
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

// ── PUT /:id ──
export const updateMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const {
      title,
      description,
      startTime,
      endTime,
      roomId,
      participantIds,
      scope,
      recurrenceType,
      recurrenceEndDate,
    } = req.body

    const existing = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: { meetingParticipants: true },
    })
    if (!existing) return res.status(404).json({ message: 'Встреча не найдена' })

    // Определяем родительскую встречу для scope-операций
    let targetId: number
    if ((scope === 'all' || scope === 'future') && existing.parentMeetingId) {
      targetId = existing.parentMeetingId!
    } else {
      targetId = Number(id)
    }

    const parent = await prisma.meeting.findUnique({
      where: { id: targetId },
      include: { meetingParticipants: true },
    })
    if (!parent) return res.status(404).json({ message: 'Встреча не найдена' })
    if (parent.hostId !== Number(req.user?.userId)) {
      return res.status(403).json({ message: 'Только организатор может редактировать встречу' })
    }

    if (scope === 'future' && !existing.parentMeetingId && !parent.recurrenceType) {
      return res.status(400).json({ message: 'Эта встреча не является повторяющейся' })
    }

    // Удаляем будущие вхождения если scope = future
    if (scope === 'future') {
      await prisma.meetingParticipant.deleteMany({
        where: { meeting: { parentMeetingId: targetId, startTime: { gte: existing.startTime } } },
      })
      await prisma.meeting.deleteMany({
        where: { parentMeetingId: targetId, startTime: { gte: existing.startTime } },
      })
    }

    // Удаляем ВСЕ дочерние вхождения если scope = all
    if (scope === 'all') {
      await prisma.meetingParticipant.deleteMany({
        where: { meeting: { parentMeetingId: targetId } },
      })
      await prisma.meeting.deleteMany({ where: { parentMeetingId: targetId } })
    }

    // Собираем данные для обновления
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (startTime !== undefined) data.startTime = new Date(startTime)
    if (endTime !== undefined) data.endTime = new Date(endTime)
    if (roomId !== undefined) {
      if (roomId === null) {
        data.roomId = null
      } else {
        const room = await prisma.room.findUnique({ where: { id: Number(roomId) } })
        if (!room) return res.status(404).json({ message: 'Комната не найдена' })
        data.roomId = Number(roomId)
      }
    }

    // Обновление recurrence полей (только на родителе)
    if (scope !== 'this' && recurrenceType !== undefined) {
      if (recurrenceType && !VALID_RECURRENCE_TYPES.includes(recurrenceType)) {
        return res.status(400).json({ message: 'Недопустимый тип повторения' })
      }
      data.recurrenceType = recurrenceType || null
      data.recurrenceEndDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null
    }

    // Синхронизация участников на целевой встрече
    if (participantIds !== undefined) {
      const hostId = parent.hostId
      const newIds = (participantIds as number[]).filter((pid) => pid !== hostId)
      const existingMps = parent.meetingParticipants

      const toRemove = existingMps.filter(
        (mp) => !newIds.includes(mp.userId) && mp.status === 'INVITED',
      )
      if (toRemove.length) {
        await prisma.meetingParticipant.deleteMany({
          where: { id: { in: toRemove.map((mp) => mp.id) } },
        })
      }

      const existingUserIds = existingMps.map((mp) => mp.userId)
      const toAdd = newIds.filter((uid) => !existingUserIds.includes(uid))
      if (toAdd.length) {
        await prisma.meetingParticipant.createMany({
          data: toAdd.map((userId) => ({ meetingId: targetId, userId, status: 'INVITED' })),
        })

        for (const userId of toAdd) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
          if (user?.email) {
            const meetingTitle = title ?? parent.title
            const meetingStart = startTime ? new Date(startTime) : parent.startTime
            sendMeetingUpdatedEmail(user.email, meetingTitle, meetingStart).catch((e) =>
              console.error('Failed to send updated invite email:', e),
            )
          }
        }
      }
    }

    // Обновляем родительскую встречу
    const meetup = await prisma.meeting.update({
      where: { id: targetId },
      data,
      include: meetingInclude,
    })

    // Пересоздаём дочерние вхождения если scope = all/future и есть recurrenceType
    const effectiveRecurrenceType =
      data.recurrenceType !== undefined ? data.recurrenceType || null : parent.recurrenceType
    const effectiveRecurrenceEnd =
      data.recurrenceEndDate !== undefined
        ? data.recurrenceEndDate || null
        : parent.recurrenceEndDate

    if (
      (scope === 'all' || scope === 'future') &&
      effectiveRecurrenceType &&
      effectiveRecurrenceEnd
    ) {
      const refStart =
        scope === 'future'
          ? data.startTime || existing.startTime
          : data.startTime || parent.startTime
      const refEnd =
        scope === 'future' ? data.endTime || existing.endTime : data.endTime || parent.endTime

      const instances = generateRecurrenceInstances(
        new Date(refStart),
        new Date(refEnd),
        effectiveRecurrenceType,
        new Date(effectiveRecurrenceEnd),
      )

      if (instances.length > 0) {
        await prisma.meeting.createMany({
          data: instances.map((inst) => ({
            title: data.title ?? parent.title,
            description: data.description !== undefined ? data.description : parent.description,
            startTime: inst.startTime,
            endTime: inst.endTime,
            hostId: parent.hostId,
            roomId: data.roomId !== undefined ? (data.roomId ?? null) : parent.roomId,
            parentMeetingId: targetId,
          })),
        })

        const invitedIds = participantIds
          ? (participantIds as number[]).filter((pid) => pid !== parent.hostId)
          : parent.meetingParticipants.map((mp) => mp.userId)

        if (invitedIds.length > 0) {
          const childMeetings = await prisma.meeting.findMany({
            where: { parentMeetingId: targetId },
            select: { id: true },
          })
          const childParticipants = childMeetings.flatMap((cm) =>
            invitedIds.map((userId) => ({ meetingId: cm.id, userId, status: 'INVITED' as const })),
          )
          if (childParticipants.length) {
            await prisma.meetingParticipant.createMany({ data: childParticipants })
          }
        }
      }
    }

    // Синхронизируем участников на дочерних встречах если scope = all и обновлялись участники
    if (scope === 'all' && participantIds !== undefined) {
      const hostId = parent.hostId
      const newIds = (participantIds as number[]).filter((pid) => pid !== hostId)
      const childMeetings = await prisma.meeting.findMany({
        where: { parentMeetingId: targetId },
        include: { meetingParticipants: true },
      })

      for (const child of childMeetings) {
        const childMps = child.meetingParticipants
        const toRemove = childMps.filter(
          (mp) => !newIds.includes(mp.userId) && mp.status === 'INVITED',
        )
        if (toRemove.length) {
          await prisma.meetingParticipant.deleteMany({
            where: { id: { in: toRemove.map((mp) => mp.id) } },
          })
        }
        const existingUserIds = childMps.map((mp) => mp.userId)
        const toAdd = newIds.filter((uid) => !existingUserIds.includes(uid))
        if (toAdd.length) {
          await prisma.meetingParticipant.createMany({
            data: toAdd.map((userId) => ({ meetingId: child.id, userId, status: 'INVITED' })),
          })
        }
      }
    }

    res.status(200).json({ message: 'Встреча обновлена', data: meetingToResponse(meetup) })
  } catch {
    res.status(500).json({ message: 'Ошибка сервера при обновлении встречи' })
  }
}

// ── DELETE /:id ──
export const deleteMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { scope } = req.body

    const existing = await prisma.meeting.findUnique({ where: { id: Number(id) } })
    if (!existing) return res.status(404).json({ message: 'Встреча не найдена' })

    // Определяем родителя для проверки прав
    const targetId = existing.parentMeetingId ?? Number(id)

    const parent = existing.parentMeetingId
      ? await prisma.meeting.findUnique({ where: { id: existing.parentMeetingId } })
      : existing
    if (!parent || parent.hostId !== Number(req.user?.userId)) {
      return res.status(403).json({ message: 'Только организатор может удалить встречу' })
    }

    if (scope === 'all') {
      // Удалить родителя → каскадно удалятся все дочерние
      await prisma.meeting.delete({ where: { id: targetId } })
    } else if (scope === 'future') {
      // Удалить это и будущие вхождения
      await prisma.meetingParticipant.deleteMany({
        where: { meeting: { parentMeetingId: targetId, startTime: { gte: existing.startTime } } },
      })
      await prisma.meeting.deleteMany({
        where: { parentMeetingId: targetId, startTime: { gte: existing.startTime } },
      })
      // Обновить recurrenceEndDate у родителя
      const prevDay = new Date(existing.startTime)
      prevDay.setDate(prevDay.getDate() - 1)
      await prisma.meeting.update({
        where: { id: targetId },
        data: { recurrenceEndDate: prevDay },
      })
    } else {
      // scope = this (по умолчанию)
      await prisma.meeting.delete({ where: { id: Number(id) } })
    }

    res.status(200).json({ message: 'Встреча удалена' })
  } catch (error) {
    console.error('deleteMeetup error:', error)
    res.status(500).json({ message: 'Ошибка сервера при удалении встречи' })
  }
}

// ── POST /:id/join ──
export const joinMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = Number(req.user?.userId)

    const meetup = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: { meetingParticipants: true },
    })
    if (!meetup) return res.status(404).json({ message: 'Встреча не найдена' })

    // Найти или создать запись участия со статусом ACCEPTED
    const existing = meetup.meetingParticipants.find((mp) => mp.userId === userId)
    if (existing) {
      await prisma.meetingParticipant.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED' },
      })
    } else {
      await prisma.meetingParticipant.create({
        data: { meetingId: Number(id), userId, status: 'ACCEPTED' },
      })
    }

    const updated = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: meetingInclude,
    })

    res
      .status(200)
      .json({ message: 'Вы приняли участие во встрече', data: meetingToResponse(updated!) })
  } catch (error) {
    console.error('joinMeetup error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

// ── POST /:id/decline ──
export const declineMeetup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const userId = Number(req.user?.userId)

    const meetup = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: { meetingParticipants: true },
    })
    if (!meetup) return res.status(404).json({ message: 'Встреча не найдена' })

    const existing = meetup.meetingParticipants.find((mp) => mp.userId === userId)
    if (existing) {
      await prisma.meetingParticipant.update({
        where: { id: existing.id },
        data: { status: 'DECLINED' },
      })
    } else {
      await prisma.meetingParticipant.create({
        data: { meetingId: Number(id), userId, status: 'DECLINED' },
      })
    }

    const updated = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: meetingInclude,
    })

    res.status(200).json({ message: 'Вы отказались от участия', data: meetingToResponse(updated!) })
  } catch (error) {
    console.error('declineMeetup error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}

// ── ICS helpers ──

function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateIcs(m: any): string {
  const dtstamp = formatIcsDate(new Date())
  const dtstart = formatIcsDate(new Date(m.startTime))
  const dtend = formatIcsDate(new Date(m.endTime))
  const uid = `meeting-${m.id}@meetup`

  let description = m.description || ''
  if (m.host) {
    const hostName = [m.host.firstName, m.host.lastName].filter(Boolean).join(' ') || m.host.name
    description = description
      ? `${description}\\n\\nОрганизатор: ${hostName}`
      : `Организатор: ${hostName}`
  }

  let location = ''
  if (m.room) {
    location = m.room.title
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MeetUp//Calendar//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `DTSTAMP:${dtstamp}`,
    `UID:${uid}`,
    `SUMMARY:${escapeIcsText(m.title)}`,
  ]

  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`)
  if (m.host?.email) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(m.host.name)}:mailto:${m.host.email}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

// ── GET /:id/ics ──
export const getMeetupIcs = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const meetup = await prisma.meeting.findUnique({
      where: { id: Number(id) },
      include: meetingInclude,
    })
    if (!meetup) return res.status(404).json({ message: 'Встреча не найдена' })

    const ics = generateIcs(meetingToResponse(meetup))
    res
      .set('Content-Type', 'text/calendar; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="meetup-${id}.ics"`)
      .status(200)
      .send(ics)
  } catch (error) {
    console.error('getMeetupIcs error:', error)
    res.status(500).json({ message: 'Ошибка сервера' })
  }
}
