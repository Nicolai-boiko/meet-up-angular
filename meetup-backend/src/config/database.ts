import { PrismaClient } from '../../prisma/generated/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import 'dotenv/config'

// 1. Создаем стандартный пул соединений PostgreSQL через библиотеку 'pg'
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

// 2. Оборачиваем его в адаптер Prisma 7
const adapter = new PrismaPg(pool)

// 3. Передаем адаптер в конструктор PrismaClient
export const prisma = new PrismaClient({ adapter })
