// Weekly shopping list API
// Mount in server.js / app.js, next to the planner:
//   app.use('/shoppinglist', require('./routes/shoppingList/ShoppingList'))
// (the frontend calls http://localhost:8000/shoppinglist, the same way it calls /planner)
//
//   GET    /shoppinglist?start=YYYY-MM-DD       -> the logged-in user's list for that week
//   POST   /shoppinglist/generate  { start }    -> build / refresh it from that week's meal plan
//   PATCH  /shoppinglist/items/:itemId  { purchased }   -> tick / untick an item
//   POST   /shoppinglist/items  { start, name, quantity, unit, category }  -> add a manual item
//   DELETE /shoppinglist/items/:itemId          -> remove a manual item
//
// Same structure, auth and error handling as routes/planner/Planner.js.

const express = require('express')
const ShoppingList = require('../../models/ShoppingList')
const MealPlan = require('../../models/MealPlan')
const requireAuth = require('../middleware/auth')
const {
  CATEGORIES,
  normalizeName,
  normalizeUnit,
  buildShoppingItems,
  reconcileItems,
} = require('../services/shoppinglistbuilder')

// Reuse the planner's helpers so both features agree on what a "week" is and what a valid id is
const { normalizeWeekStart, isValidId } = MealPlan

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Helpers (same as Planner.js)                                        */
/* ------------------------------------------------------------------ */

// Throw this inside a route to send a 4xx with a message
function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Wraps an async route so every error ends up in one place (Express 4 doesn't catch async errors)
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message })
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      return res.status(400).json({ message: err.message })
    }
    if (err.code === 11000) {
      // two requests created the same week's list at once; the unique index rejected one
      return res.status(409).json({ message: 'Your list was just updated, please try again' })
    }
    console.error(err)
    res.status(500).json({ message: 'Something went wrong with the shopping list' })
  }
}

// Every shopping-list route needs a logged-in user.
// requireAuth (Kester's JWT middleware) puts the user from the database on req.user.
// We copy their id to req.userId, so every query below only touches the logged-in user's own lists.
router.use(requireAuth)
router.use((req, res, next) => {
  req.userId = String(req.user._id)
  next()
})

// Same rule as the planner: start must be a Monday in YYYY-MM-DD format
function parseWeekStart(start) {
  const weekStart = normalizeWeekStart(start)
  if (!weekStart) throw httpError(400, 'start must be a Monday in YYYY-MM-DD format')
  return weekStart
}

function checkItemId(itemId) {
  if (!isValidId(itemId)) throw httpError(400, 'Invalid item id')
}

// TODO(James): replace with the real pantry lookup once the Pantry model is ready.
// Unlike getPantryNames() in Planner.js, this needs AMOUNTS so they can be subtracted:
// return [{ name: 'Milk', quantity: 500, unit: 'ml' }, ...]
async function getPantry(userId) {
  return []
}

/* ---------- Converting the meal plan into what the list builder expects ---------- */

// Turns one MealPlan (with entries.recipeId populated) into a plain list of meals.
// Custom meals and deleted recipes have no ingredients, so they're left out.
function mealsFromPlan(plan) {
  if (!plan) return []
  return plan.entries
    .filter((entry) => entry.recipeId && Array.isArray(entry.recipeId.ingredients))
    .map((entry) => {
      const recipe = entry.recipeId // populated Recipe document
      return {
        status: entry.status,
        recipeId: recipe._id,
        title: recipe.title || 'Untitled recipe',
        recipeServings: recipe.servings,
        plannedServings: entry.servings,
        ingredients: recipe.ingredients
          .filter((ing) => ing && ing.name)
          .map((ing) => ({
            name: ing.name,
            quantity: ing.amount, // Recipe stores Spoonacular's "amount" (same field Planner.js reads)
            unit: ing.unit,
            category: ing.category,
            aisle: ing.aisle,
          })),
      }
    })
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// GET /api/shopping-list?start=2026-10-19
router.get('/', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.query.start)
  const list = await ShoppingList.findOne({ userId: req.userId, weekStart }).lean()
  // No list yet -> send an empty one so the frontend always gets the same shape
  res.json(list || { weekStart, items: [], generatedAt: null })
}))

// POST /api/shopping-list/generate   body: { start }
router.post('/generate', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)

  const [plan, pantry, existing] = await Promise.all([
    MealPlan.findOne({ userId: req.userId, weekStart }).populate('entries.recipeId').lean(),
    getPantry(req.userId),
    ShoppingList.findOne({ userId: req.userId, weekStart }),
  ])

  const freshItems = buildShoppingItems(mealsFromPlan(plan), pantry)

  const list = existing || new ShoppingList({ userId: req.userId, weekStart, items: [] })
  // Keeps manual items, and keeps ticks on items that are still needed
  list.items = reconcileItems(list.items.map((i) => i.toObject()), freshItems)
  list.mealPlanId = plan ? plan._id : null
  list.generatedAt = new Date()
  await list.save()

  res.json(list)
}))

// PATCH /api/shopping-list/items/:itemId   body: { purchased: true | false }
router.patch('/items/:itemId', handle(async (req, res) => {
  const { itemId } = req.params
  const { purchased } = req.body
  checkItemId(itemId)
  if (typeof purchased !== 'boolean') throw httpError(400, 'purchased must be true or false')

  // Filtering on userId too means users can only tick items on their OWN lists.
  // "items.$" is MongoDB's positional operator: "the array element that matched".
  const list = await ShoppingList.findOneAndUpdate(
    { userId: req.userId, 'items._id': itemId },
    { $set: { 'items.$.purchased': purchased, 'items.$.purchasedAt': purchased ? new Date() : null } },
    { returnDocument: 'after' }, // return the list AFTER the update
  )
  if (!list) throw httpError(404, 'Item not found in your shopping list')

  res.json(list.items.id(itemId))
}))

// POST /api/shopping-list/items   body: { start, name, quantity?, unit?, category? }
router.post('/items', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)

  const name = String(req.body.name ?? '').trim()
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity)
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'other'
  if (!name) throw httpError(400, 'Item name is required')
  if (name.length > 80) throw httpError(400, 'Item name must be 80 characters or fewer')
  if (!(quantity > 0)) throw httpError(400, 'Quantity must be more than 0')

  const { unit, factor } = normalizeUnit(req.body.unit) // e.g. "kg" is stored as g

  const list = (await ShoppingList.findOne({ userId: req.userId, weekStart }))
    || new ShoppingList({ userId: req.userId, weekStart, items: [] })
  list.items.push({
    name,
    normalizedName: normalizeName(name),
    quantity: quantity * factor,
    unit,
    category,
    source: 'manual',
  })
  await list.save()

  res.status(201).json(list.items[list.items.length - 1])
}))

// DELETE /api/shopping-list/items/:itemId
// Only manual items can be deleted; auto items would just come back on the next regenerate.
router.delete('/items/:itemId', handle(async (req, res) => {
  const { itemId } = req.params
  checkItemId(itemId)

  const list = await ShoppingList.findOneAndUpdate(
    { userId: req.userId, items: { $elemMatch: { _id: itemId, source: 'manual' } } },
    { $pull: { items: { _id: itemId } } },
  )
  if (!list) throw httpError(404, 'Item not found, or it came from your meal plan')

  res.status(204).end()
}))

module.exports = router