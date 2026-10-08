import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks
const registeredRoutes = [] // This line remains unchanged


vi.mock('express', () => {
  return {
    Router: () => ({ // This line remains unchanged
      post: (path, ...handlers) => {
        registeredRoutes.push({ path, handlers })
      }
    })
  }
})

const mockHash = vi.fn(async (p) => `hashed:${p}`)
const mockCompare = vi.fn(async (p, h) => h === `hashed:${p}`)
vi.mock('bcrypt', () => ({ hash: mockHash, compare: mockCompare }))

// csurf returns a middleware generator; mock to return a middleware that calls next() // This line remains unchanged
vi.mock('csurf', () => {
  return () => ((req, res, next) => next())
})

// Simple in-memory User mock
const users = []
const UserMock = {
  findOne: vi.fn(async (query) => users.find(u => u.email === query.email) || null),
  prototype: {},
}

vi.mock('../models/User', () => UserMock) // This line remains unchanged

// Now require the router module (it will use our mocks)
let authRouterModule
beforeEach(async () => {
  // clear registeredRoutes and mocks
  registeredRoutes.length = 0
  users.length = 0
  mockHash.mockClear()
  mockCompare.mockClear()
  UserMock.findOne.mockClear()

  // load module // This line remains unchanged
  authRouterModule = await import('../routes/auth.js')
})

describe('auth routes (isolated mocks)', () => {
  it('register and login routes registered', () => {
    const paths = registeredRoutes.map(r => r.path)
    expect(paths).toContain('/register')
    expect(paths).toContain('/login')
  })

  it('register flow creates a user when email not taken', async () => {
    // find handler for /register
    const r = registeredRoutes.find(r => r.path === '/register')
    expect(r).toBeTruthy()
    // last handler is the async handler (after middleware)
    const handler = r.handlers[r.handlers.length - 1]

    const req = { body: { email: 'a@b.com', password: 'secret' } }
    const res = { status: (s) => { res._status = s; return res }, json: (j) => { res._json = j; return res } }

    // Call handler
    await handler(req, res)

    expect(res._status).toBe(201)
    expect(res._json).toHaveProperty('userId')
    // user stored with hashed password
    const created = users.find(u => u.email === 'a@b.com')
    expect(created).toBeTruthy()
    expect(created.password).toMatch(/^hashed:/)
  })

  it('login flow rejects invalid credentials and accepts valid', async () => {
    // seed a user (simulate previously created hashed password)
    users.push({ email: 'x@y.com', password: await mockHash('pw') })

    const rLogin = registeredRoutes.find(r => r.path === '/login')
    const handler = rLogin.handlers[rLogin.handlers.length - 1]

    const badReq = { body: { email: 'x@y.com', password: 'wrong' } }
    const badRes = { status: (s) => { badRes._status = s; return badRes }, json: (j) => { badRes._json = j; return badRes } }
    await handler(badReq, badRes)
    expect(badRes._status).toBe(401)

    const goodReq = { body: { email: 'x@y.com', password: 'pw' } }
    const goodRes = { status: (s) => { goodRes._status = s; return goodRes }, json: (j) => { goodRes._json = j; return goodRes } }
    await handler(goodReq, goodRes)
    expect(goodRes._json).toHaveProperty('userId')
  })
})
