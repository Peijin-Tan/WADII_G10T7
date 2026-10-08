import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Create temporary mock modules and a temp auth loader that requires them.
const serverDir = path.resolve(__dirname, '..')
const tmpDir = serverDir

const mockExpress = `module.exports = { Router: () => ({ post: (path, ...handlers) => { if (!global.__registeredRoutes) global.__registeredRoutes = []; global.__registeredRoutes.push({ path, handlers }) } }) }`
const mockBcrypt = `module.exports = { hash: async (p) => 'hashed:' + p, compare: async (p, h) => h === 'hashed:' + p }`
const mockCsurf = `module.exports = () => ((req,res,next) => next())`
const mockUser = `const users = []; module.exports = { findOne: async (q) => users.find(u => u.email === q.email) || null, create: async (obj) => { const u = { _id: (users.length+1).toString(), ...obj }; users.push(u); return u }, __internal: users }`

beforeEach(() => {
  // write mocks
  fs.writeFileSync(path.join(tmpDir, '__mocks_express.js'), mockExpress)
  fs.writeFileSync(path.join(tmpDir, '__mocks_bcrypt.js'), mockBcrypt)
  fs.writeFileSync(path.join(tmpDir, '__mocks_csurf.js'), mockCsurf)
  fs.writeFileSync(path.join(tmpDir, '__mocks_UserMock.js'), mockUser)

  // create a temp auth loader that requires local mocks instead of real packages
  const authSrc = fs.readFileSync(path.join(serverDir, 'routes', 'auth.js'), 'utf8')
  let tmpSrc = authSrc
    .replace("const express = require('express')", "const express = require('./__mocks_express')")
    .replace("const bcrypt = require('bcrypt')", "const bcrypt = require('./__mocks_bcrypt')")
    .replace("const csurf = require('csurf')", "const csurf = require('./__mocks_csurf')")
    .replace("const User = require('../models/User')", "const User = require('./__mocks_UserMock')")

  fs.writeFileSync(path.join(tmpDir, 'tmp_auth_for_test.js'), tmpSrc)

  // reset global routes and mock user storage
  global.__registeredRoutes = []

  // load the temp module
  delete require.cache[require.resolve(path.join(tmpDir, 'tmp_auth_for_test.js'))]
  require(path.join(tmpDir, 'tmp_auth_for_test.js'))
})

describe('auth routes (file-mock)', () => {
  it('register and login routes registered', () => {
    const paths = global.__registeredRoutes.map(r => r.path)
    expect(paths).toContain('/register')
    expect(paths).toContain('/login')
  })

  it('register flow creates a user when email not taken', async () => {
    const r = global.__registeredRoutes.find(r => r.path === '/register')
    expect(r).toBeTruthy()
    const handler = r.handlers[r.handlers.length - 1]

    const req = { body: { email: 'a@b.com', password: 'secret' } }
    const res = { status: (s) => { res._status = s; return res }, json: (j) => { res._json = j; return res } }

    await handler(req, res)

    expect(res._status).toBe(201)
    expect(res._json).toHaveProperty('userId')

    const userMock = require(path.join(tmpDir, '__mocks_UserMock.js'))
    expect(userMock.__internal.find(u => u.email === 'a@b.com')).toBeTruthy()
  })

  it('login flow rejects invalid credentials and accepts valid', async () => {
    const userMock = require(path.join(tmpDir, '__mocks_UserMock.js'))
    await userMock.create({ email: 'x@y.com', password: 'hashed:pw' })

    const rLogin = global.__registeredRoutes.find(r => r.path === '/login')
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
