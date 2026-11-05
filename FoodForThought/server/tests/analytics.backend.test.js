// Backend integration tests. Run from FoodForThought/server:
// npm install -D mongodb-memory-server supertest
// node --test tests/analytics.backend.test.js
// Real Express router, JWT middleware, Mongoose models and temporary MongoDB.
// No config.env, MONGODB_URI, demo credentials or existing database is used.
process.env.TZ = 'Asia/Singapore'
const { describe, it, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const express = require('express')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const { MongoMemoryServer } = require('mongodb-memory-server')
const Recipe = require('../models/Recipe')
const Like = require('../models/Like')
const Comment = require('../models/Comment')
const MealPlan = require('../models/MealPlan')
const User = require('../models/User')
const analyticsRouter = require('../src/router/analytics')

const userA = new mongoose.Types.ObjectId('670000000000000000000001')
const userB = new mongoose.Types.ObjectId('670000000000000000000002')
const fixedNow = new Date('2026-11-05T04:00:00Z') // 5 November, noon Singapore
const inMonth = new Date('2026-11-03T04:00:00Z')
const previousSecret = process.env.JWT_SECRET
let mongo, app, token

function get(path, authToken = token) {
  const call = request(app).get('/analytics' + path)
  return authToken === null ? call : call.set('Authorization', `Bearer ${authToken}`)
}
async function recipe(title, extra = {}) {
  const row = {
    _id: new mongoose.Types.ObjectId(), source: 'user', createdBy: userA,
    title, image: '/test-recipe.png', summary: 'Test fixture', cuisine: ['chinese'],
    servings: 1, prepTime: 5, cookingTime: 5, totalTime: 10,
    ingredients: [], instructions: [], ...extra,
  }
  await Recipe.collection.insertOne(row)
  return row
}
async function likes(row, count, { at = inMonth, owner, key } = {}) {
  if (!count) return
  const recipeKey = key || (row.externalId != null ? `spoonacular-${row.externalId}` : `recipe-${row._id}`)
  await Like.collection.insertMany(Array.from({ length: count }, () => ({
    _id: new mongoose.Types.ObjectId(), recipeKey,
    userId: owner || new mongoose.Types.ObjectId(), createdAt: new Date(at), updatedAt: new Date(at),
  })))
}
async function events(Model, owner, dates) {
  if (!dates.length) return
  await Model.collection.insertMany(dates.map(at => ({
    _id: new mongoose.Types.ObjectId(), userId: owner, createdAt: new Date(at),
    ...(Model === Like ? { recipeKey: `recipe-${new mongoose.Types.ObjectId()}` }
      : { recipeId: new mongoose.Types.ObjectId(), content: 'Test comment' }),
  })))
}
async function plan(week, entries, owner = userA) {
  await MealPlan.collection.insertOne({
    _id: new mongoose.Types.ObjectId(), userId: owner,
    weekStart: new Date(`${week}T00:00:00+08:00`),
    entries: entries.map(([dayOfWeek, status, extra = {}]) => ({
      _id: new mongoose.Types.ObjectId(), dayOfWeek, status, servings: 1,
      mealSlot: 'lunch', customMeal: { title: 'Test meal' }, ...extra,
    })),
  })
}
async function progress(expected) {
  const res = await get('/meal-progress').expect(200)
  assert.deepEqual(res.body, expected)
}

// Raw collection inserts keep timestamps exact and avoid unrelated save hooks.
// The application still performs REAL MongoDB queries when handling each request.
describe('Analytics backend with real MongoDB', { concurrency: false }, () => {
  before(async () => {
    mongo = await MongoMemoryServer.create({
      instance: {
        args: process.platform === 'win32'
          ? []
          : ['--nounixsocket']
      }
    })
    await mongoose.connect(mongo.getUri(), { dbName: 'analytics_tests' })
    process.env.JWT_SECRET = 'temporary-analytics-test-secret'
    await User.collection.insertMany([
      { _id: userA, name: 'Test A', email: 'a@test.invalid', role: 'user', password: 'unused' },
      { _id: userB, name: 'Test B', email: 'b@test.invalid', role: 'user', password: 'unused' },
    ])
    token = jwt.sign({ sub: userA.toString() }, process.env.JWT_SECRET, { noTimestamp: true })
    app = express()
    app.use(express.json())
    app.use('/analytics', analyticsRouter)
  })
  after(async () => {
    await mongoose.disconnect()
    if (mongo) await mongo.stop()
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  })
  beforeEach(async t => {
    await Promise.all([Recipe, Like, Comment, MealPlan].map(Model => Model.deleteMany({})))
    // Freeze Date only. Network I/O and timer timeouts continue using real time.
    t.mock.timers.enable({ apis: ['Date'], now: fixedNow.getTime() })
  })

  describe('Most liked recipes', () => {
    it('B01 returns an empty list without liked recipes', async () => {
      await recipe('Unliked tofu')
      assert.deepEqual((await get('').expect(200)).body, [])
    })
    it('B02 sorts by likes, breaks ties by title, and returns only five', async () => {
      for (const [title, count] of [['Zulu', 4], ['Beta', 4], ['Leader', 7], ['Delta', 3], ['Echo', 2], ['Foxtrot', 1]]) {
        await likes(await recipe(title), count)
      }
      const res = await get('').expect(200)
      assert.deepEqual(res.body.map(r => [r.title, r.likeCount]),
        [['Leader', 7], ['Beta', 4], ['Zulu', 4], ['Delta', 3], ['Echo', 2]])
    })
    it('B03 includes Singapore month start and now, excludes older and future likes', async () => {
      const r = await recipe('Tofu')
      for (const at of ['2026-10-31T15:59:59.999Z', '2026-10-31T16:00:00Z', fixedNow, '2026-11-05T04:00:00.001Z']) {
        await likes(r, 1, { at })
      }
      assert.equal((await get('').expect(200)).body[0].likeCount, 2)
    })
    it('B04 counts community likes from all users, not only the viewer', async () => {
      const r = await recipe('Tofu')
      await likes(r, 1, { owner: userA })
      await likes(r, 1, { owner: userB })
      assert.equal((await get('').expect(200)).body[0].likeCount, 2)
    })
    it('B05 excludes Spoonacular-source recipes from community rankings', async () => {
      await likes(await recipe('External', { source: 'spoonacular', externalId: 123 }), 5)
      const saved = await recipe('Community')
      await likes(saved, 1)
      assert.deepEqual((await get('').expect(200)).body.map(r => r.title), ['Community'])
    })
    it('B06 counts matching recipe keys and returns the correct preview', async () => {
      const r = await recipe('Tofu', { externalId: 123 })
      await likes(r, 2)
      await likes(r, 1, { key: 'recipe-does-not-exist' })
      const res = await get('').expect(200)
      assert.deepEqual(res.body, [{
        recipeId: r._id.toString(), title: 'Tofu',
        image: '/test-recipe.png', cuisine: ['chinese'], totalTime: 10, likeCount: 2
      }])
    })
  })

  describe('Trending cuisines', () => {
    it('B07 returns an empty list when no recipes have likes', async () => {
      await recipe('Tofu')
      assert.deepEqual((await get('/cuisines').expect(200)).body, [])
    })
    it('B08 trims names, ignores case and blanks, and deduplicates within each recipe', async () => {
      await likes(await recipe('A', { cuisine: [' Chinese ', 'CHINESE', '', ' ', 'Indian'] }), 2)
      await likes(await recipe('B', { cuisine: ['chinese'] }), 3)
      assert.deepEqual((await get('/cuisines').expect(200)).body,
        [{ cuisine: 'chinese', likeCount: 5 }, { cuisine: 'indian', likeCount: 2 }])
    })
    it('B09 adds each recipe’s full like count to each of its distinct cuisines', async () => {
      await likes(await recipe('A', { cuisine: ['chinese', 'indian'] }), 3)
      assert.deepEqual((await get('/cuisines').expect(200)).body,
        [{ cuisine: 'chinese', likeCount: 3 }, { cuisine: 'indian', likeCount: 3 }])
    })
    it('B10 sorts ties alphabetically and returns at most five cuisines', async () => {
      for (const name of ['zulu', 'foxtrot', 'echo', 'delta', 'beta', 'alpha']) {
        await likes(await recipe(name, { cuisine: [name] }), 1)
      }
      assert.deepEqual((await get('/cuisines').expect(200)).body.map(r => r.cuisine),
        ['alpha', 'beta', 'delta', 'echo', 'foxtrot'])
    })
    it('B11 excludes previous-month, future and non-community likes', async () => {
      const r = await recipe('A', { cuisine: ['chinese'] })
      await likes(r, 1, { at: '2026-10-31T16:00:00Z' })
      await likes(r, 1, { at: '2026-10-31T15:59:59.999Z' })
      await likes(r, 1, { at: '2026-11-05T04:00:00.001Z' })
      await likes(await recipe('B', { source: 'spoonacular', cuisine: ['indian'], externalId: 456 }), 3)
      assert.deepEqual((await get('/cuisines').expect(200)).body, [{ cuisine: 'chinese', likeCount: 1 }])
    })
    it('B12 handles recipes with no cuisine information', async () => {
      await likes(await recipe('A', { cuisine: [] }), 1)
      await likes(await recipe('B', { cuisine: null }), 1)
      assert.deepEqual((await get('/cuisines').expect(200)).body, [])
    })
  })

  describe('Personal seven-day activity', () => {
    it('B13 returns exactly seven chronological Singapore dates with zero counts', async () => {
      const res = await get('/activity').expect(200)
      assert.equal(res.body.length, 7)
      assert.deepEqual(res.body.map(d => d.date), [
        '2026-10-29T16:00:00.000Z', '2026-10-30T16:00:00.000Z', '2026-10-31T16:00:00.000Z',
        '2026-11-01T16:00:00.000Z', '2026-11-02T16:00:00.000Z', '2026-11-03T16:00:00.000Z',
        '2026-11-04T16:00:00.000Z',
      ])
      assert.ok(res.body.every(d => d.commentCount === 0 && d.likeCount === 0))
    })
    it('B14 counts comments and likes separately and excludes another user', async () => {
      await events(Comment, userA, [inMonth, inMonth])
      await events(Like, userA, [inMonth])
      await events(Comment, userB, [inMonth])
      await events(Like, userB, [inMonth])
      const days = (await get('/activity').expect(200)).body
      assert.deepEqual(days[4], { date: '2026-11-02T16:00:00.000Z', commentCount: 2, likeCount: 1 })
      assert.equal(days.reduce((sum, d) => sum + d.commentCount, 0), 2)
      assert.equal(days.reduce((sum, d) => sum + d.likeCount, 0), 1)
    })
    it('B15 includes the first midnight, excludes older activity and future timestamps', async () => {
      const dates = ['2026-10-29T15:59:59.999Z', '2026-10-29T16:00:00Z', fixedNow, '2026-11-05T04:00:00.001Z']
      await events(Comment, userA, dates)
      await events(Like, userA, dates)
      const days = (await get('/activity').expect(200)).body
      assert.equal(days[0].commentCount, 1)
      assert.equal(days[6].commentCount, 1)
      assert.equal(days.reduce((sum, d) => sum + d.commentCount, 0), 2)
      assert.equal(days.reduce((sum, d) => sum + d.likeCount, 0), 2)
    })
    it('B16 assigns Singapore midnight events to the new day only', async () => {
      await events(Comment, userA, ['2026-11-01T15:59:59.999Z', '2026-11-01T16:00:00Z'])
      const days = (await get('/activity').expect(200)).body
      assert.equal(days[2].commentCount, 1) // 1 November
      assert.equal(days[3].commentCount, 1) // 2 November
    })
  })

  describe('Monthly meal-plan calculations', () => {
    it('B17 returns zero totals and 0% without any meal plans', async () => {
      await progress({ totalMeals: 0, completedMeals: 0, skippedMeals: 0, percentage: 0 })
    })
    it('B18 counts Cooked, Planned and Skipped meals and rounds 2/3 to 67%', async () => {
      await plan('2026-11-02', [[0, 'Cooked'], [1, 'Cooked'], [2, 'Skipped']])
      await progress({ totalMeals: 3, completedMeals: 2, skippedMeals: 1, percentage: 67 })
    })
    it('B19 counts planned and skipped meals in the denominator, rounding 1/3 to 33%', async () => {
      await plan('2026-11-02', [[0, 'Cooked'], [1, 'Planned'], [2, 'Skipped']])
      await progress({ totalMeals: 3, completedMeals: 1, skippedMeals: 1, percentage: 33 })
    })
    it('B20 includes a meal this month from a week beginning last month', async () => {
      await plan('2026-10-26', [[4, 'Cooked'], [5, 'Skipped'], [6, 'Cooked']])
      await progress({ totalMeals: 1, completedMeals: 1, skippedMeals: 0, percentage: 100 })
    })
    it('B21 excludes next-month entries in a week beginning this month', async () => {
      await plan('2026-11-30', [[0, 'Planned'], [1, 'Cooked'], [2, 'Skipped']])
      await progress({ totalMeals: 1, completedMeals: 0, skippedMeals: 0, percentage: 0 })
    })
    it('B22 excludes plans belonging to a different user', async () => {
      await plan('2026-11-02', [[0, 'Cooked']])
      await plan('2026-11-02', [[0, 'Skipped'], [1, 'Planned']], userB)
      await progress({ totalMeals: 1, completedMeals: 1, skippedMeals: 0, percentage: 100 })
    })
    it('B23 uses the scheduled month, not cookedAt or the record creation month', async () => {
      await plan('2026-10-26', [[0, 'Cooked', { cookedAt: fixedNow }],
      [6, 'Cooked', { cookedAt: new Date('2026-10-01T00:00:00Z') }]])
      await progress({ totalMeals: 1, completedMeals: 1, skippedMeals: 0, percentage: 100 })
    })
    it('B24 counts meal entries rather than multiplying by servings', async () => {
      await plan('2026-11-02', [[0, 'Cooked', { servings: 6 }], [1, 'Planned', { servings: 12 }]])
      await progress({ totalMeals: 2, completedMeals: 1, skippedMeals: 0, percentage: 50 })
    })
    it('B25 aggregates entries across multiple weeks including later planned meals', async () => {
      await plan('2026-11-02', [[0, 'Cooked'], [1, 'Cooked']])
      await plan('2026-11-09', [[0, 'Skipped'], [1, 'Planned']])
      await progress({ totalMeals: 4, completedMeals: 2, skippedMeals: 1, percentage: 50 })
    })
    it('B26 handles the Singapore month rollover while UTC is still in October', async t => {
      t.mock.timers.setTime(new Date('2026-10-31T16:00:00Z').getTime())
      await plan('2026-10-26', [[5, 'Skipped'], [6, 'Cooked']])
      await progress({ totalMeals: 1, completedMeals: 1, skippedMeals: 0, percentage: 100 })
    })
    it('B27 handles December to January rollover', async t => {
      t.mock.timers.setTime(new Date('2026-12-31T16:00:00Z').getTime())
      await plan('2026-12-28', [[3, 'Skipped'], [4, 'Cooked']])
      await progress({ totalMeals: 1, completedMeals: 1, skippedMeals: 0, percentage: 100 })
    })
    it('B28 includes leap day and excludes the following March date', async t => {
      t.mock.timers.setTime(new Date('2028-02-29T04:00:00Z').getTime())
      await plan('2028-02-28', [[0, 'Cooked'], [1, 'Skipped'], [2, 'Cooked']])
      await progress({ totalMeals: 2, completedMeals: 1, skippedMeals: 1, percentage: 50 })
    })
    it('B29 handles a saved plan with no entries', async () => {
      await plan('2026-11-02', [])
      await progress({ totalMeals: 0, completedMeals: 0, skippedMeals: 0, percentage: 0 })
    })
    it('B30 reports all skipped meals with zero completion', async () => {
      await plan('2026-11-02', [[0, 'Skipped'], [1, 'Skipped']])
      await progress({ totalMeals: 2, completedMeals: 0, skippedMeals: 2, percentage: 0 })
    })
  })

  describe('Real authentication on analytics routes', () => {
    for (const path of ['', '/cuisines', '/activity', '/meal-progress']) {
      it(`B31 rejects missing credentials for /analytics${path}`, async () => {
        await get(path, null).expect(401)
      })
    }
    it('B32 rejects an invalid JWT rather than returning private results', async () => {
      await get('/meal-progress', 'invalid-jwt').expect(401)
    })
    it('B33 rejects a signed token belonging to a missing user', async () => {
      const missing = jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, process.env.JWT_SECRET)
      await get('/activity', missing).expect(401)
    })
  })
})
