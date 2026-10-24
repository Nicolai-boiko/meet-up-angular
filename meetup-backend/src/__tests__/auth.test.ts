import request from 'supertest'
import { app } from '../index'

const testUser = {
  name: `test-user-${Date.now()}`,
  email: `test-${Date.now()}@example.com`,
  password: 'testpassword123',
}

describe('Auth API', () => {
  let accessToken: string
  let refreshToken: string

  it('POST /api/auth/register — creates a new user', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser).expect(201)

    expect(res.body.token).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
    expect(res.body.userId).toBeDefined()
    expect(res.body.message).toBe('Пользователь создан')

    accessToken = res.body.token
    refreshToken = res.body.refreshToken
  })

  it('POST /api/auth/register — rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser).expect(400)

    expect(res.body.message).toContain('уже существует')
  })

  it('POST /api/auth/login — authenticates with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200)

    expect(res.body.token).toBeDefined()
    expect(res.body.role).toBe('USER')
    accessToken = res.body.token
    refreshToken = res.body.refreshToken
  })

  it('POST /api/auth/login — rejects wrong password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' })
      .expect(400)
  })

  it('POST /api/auth/refresh — returns new token pair', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken }).expect(200)

    expect(res.body.token).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
    accessToken = res.body.token
    refreshToken = res.body.refreshToken
  })

  it('GET /api/profile — returns user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    expect(res.body.email).toBe(testUser.email)
    expect(res.body.name).toBe(testUser.name)
  })

  it('GET /api/profile — rejects unauthenticated request', async () => {
    await request(app).get('/api/profile').expect(401)
  })

  it('GET /api/health — returns UP status', async () => {
    const res = await request(app).get('/api/health').expect(200)

    expect(res.body.status).toBe('UP')
  })
})
