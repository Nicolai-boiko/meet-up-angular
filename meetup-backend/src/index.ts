import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { mkdirSync } from 'fs'
import { createServer } from 'http' // 👈 Импортируем createServer
import { initSignalingServer } from './services/signaling' // 👈 Импортируем наш сервер сигнализации
import meetupRoutes from './routes/meetup.routes'
import authRoutes from './routes/auth.routes'
import roomRoutes from './routes/room.routes'
import profileRoutes from './routes/profile.routes'
import contentRoutes from './routes/content.routes'
import userRoutes from './routes/user.routes'
import tagRoutes from './routes/tag.routes'
import adminRoutes from './routes/admin.routes'
import { prisma } from './config/database'
import { validateEnv } from './config/env'

dotenv.config()
validateEnv()

const app = express()
const PORT = process.env.PORT || 3000

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:5173',
    credentials: true,
  }),
)
app.use(express.json({ limit: '5mb' }))

const uploadsDir = path.join(__dirname, '..', 'uploads')
mkdirSync(path.join(uploadsDir, 'avatars'), { recursive: true })
mkdirSync(path.join(uploadsDir, 'files'), { recursive: true })
app.use('/uploads', express.static(uploadsDir))
app.use('/api/meetups', meetupRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/content', contentRoutes)
app.use('/api/users', userRoutes)
app.use('/api/tags', tagRoutes)
app.use('/api/admin', adminRoutes)

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'UP', message: 'Server is running and database is connected.' })
  } catch {
    res
      .status(503)
      .json({ status: 'DOWN', message: 'Server is running but database connection failed.' })
  }
})

// 👇 Создаем HTTP сервер из нашего Express приложения
const httpServer = createServer(app)

// 👇 Инициализируем сервер сигнализации, передав ему HTTP сервер
initSignalingServer(httpServer)

const startServer = async () => {
  try {
    // 👇 Запускаем прослушивание на HTTP сервере, а не на app
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server with signaling is running at http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ Unable to start the server:', error)
  }
}

// Запускаем сервер только если файл запущен напрямую (не импортирован для тестов)
if (require.main === module) {
  startServer()
}

export { app, httpServer }
