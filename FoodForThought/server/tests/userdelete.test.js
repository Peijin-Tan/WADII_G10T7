// Unit tests for deleting a user (admin dashboard -> DELETE /users/:id, server/src/router/users.js).
// Run from the server folder with:   npm test
// No database: each model's delete call is replaced with a fake that records what it was asked to delete,
// and the request goes through the real Express router (with a real login token for an admin).

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const jwt = require('jsonwebtoken')

const User = require('../models/User')
const Pantry = require('../models/Pantry')
const MealPlan = require('../models/MealPlan')
const ShoppingList = require('../models/ShoppingList')
const UserPreference = require('../models/UserPreference')
const Comment = require('../models/Comment')
const Like = require('../models/Like')
const PantryShare = require('../models/PantryShare')
const NeighbourInvite = require('../models/NeighbourInvite')
const PantryRequest = require('../models/PantryRequest')
const usersRouter = require('../src/router/users')

const ADMIN_ID = '670000000000000000000001'
const EVE_ID = '670000000000000000000002'

// Starts the real router on a free port, logged in as an admin. Returns the base URL and a stop function.
async function startServer(t) {
  process.env.JWT_SECRET = 'test-secret'
  // requireAuth looks the token's user up: answer with an admin
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: ADMIN_ID, name: 'Ada', role: 'admin' }) }))
  const app = express()
  app.use(express.json())
  app.use('/users', usersRouter)
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
  t.after(() => server.close())
  const token = jwt.sign({}, 'test-secret', { subject: ADMIN_ID, expiresIn: '1h' })
  return { url: `http://127.0.0.1:${server.address().port}`, headers: { Authorization: `Bearer ${token}` } }
}

// Replaces deleteMany on every model with a fake that remembers its filter
function recordDeletes(t) {
  const asked = {}
  const fake = (name) => async (filter) => { asked[name] = filter; return { deletedCount: 1 } }
  for (const [name, model] of Object.entries({ MealPlan, ShoppingList, UserPreference, Comment, Like, PantryShare, NeighbourInvite, PantryRequest })) {
    t.mock.method(model, 'deleteMany', fake(name))
  }
  t.mock.method(Pantry.collection, 'deleteMany', fake('Pantry'))
  return asked
}

test('deleting a user also removes their Neighbour Pantry links, invites and borrow requests', async (t) => {
  const { url, headers } = await startServer(t)
  const asked = recordDeletes(t)
  t.mock.method(User, 'findByIdAndDelete', async () => ({ _id: EVE_ID, name: 'Eve', email: 'eve@test.com', role: 'user' }))

  const res = await fetch(`${url}/users/${EVE_ID}`, { method: 'DELETE', headers })
  const body = await res.json()

  assert.equal(res.status, 200)
  // both directions: Eve shared with others AND others shared with Eve
  assert.deepEqual(asked.PantryShare, { $or: [{ owner: EVE_ID }, { friend: EVE_ID }] })
  assert.deepEqual(asked.NeighbourInvite, { $or: [{ from: EVE_ID }, { to: EVE_ID }] })
  assert.deepEqual(asked.PantryRequest, { $or: [{ requester: EVE_ID }, { owner: EVE_ID }] })
  assert.equal(body.removed.neighbourLinks, 1)
  assert.equal(body.removed.borrowRequests, 1)
})

test('deleting a user removes their own data, including pantry rows saved with the id as text', async (t) => {
  const { url, headers } = await startServer(t)
  const asked = recordDeletes(t)
  t.mock.method(User, 'findByIdAndDelete', async () => ({ _id: EVE_ID, name: 'Eve', email: 'eve@test.com', role: 'user' }))

  await fetch(`${url}/users/${EVE_ID}`, { method: 'DELETE', headers })

  const pantryIds = asked.Pantry.user.$in.map(String)
  assert.deepEqual(pantryIds, [EVE_ID, EVE_ID]) // once as text, once as an ObjectId
  assert.deepEqual(asked.MealPlan, { userId: EVE_ID })
  assert.deepEqual(asked.ShoppingList, { userId: EVE_ID })
  assert.deepEqual(asked.Comment, { userId: EVE_ID })
  assert.deepEqual(asked.Like, { userId: EVE_ID })
})

test('nothing is deleted for an unknown user or for the admin themselves', async (t) => {
  const { url, headers } = await startServer(t)
  const asked = recordDeletes(t)
  t.mock.method(User, 'findByIdAndDelete', async () => null)

  const unknown = await fetch(`${url}/users/${EVE_ID}`, { method: 'DELETE', headers })
  const self = await fetch(`${url}/users/${ADMIN_ID}`, { method: 'DELETE', headers })
  const bad = await fetch(`${url}/users/not-an-id`, { method: 'DELETE', headers })

  assert.equal(unknown.status, 404)
  assert.equal(self.status, 400)
  assert.equal(bad.status, 400)
  assert.deepEqual(asked, {}) // no data touched
})
