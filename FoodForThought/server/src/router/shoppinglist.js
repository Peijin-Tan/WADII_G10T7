// Weekly shopping list API
// Mounted in server/index.js as app.use('/shoppinglist', shoppinglistRouter)
//
//   GET    /shoppinglist
//   POST   /shoppinglist/generate
//   PATCH  /shoppinglist/items/:itemId
//   PATCH  /shoppinglist/items/:itemId/basket
//   POST   /shoppinglist/items
//   DELETE /shoppinglist/items/:itemId
//   POST   /shoppinglist/add-to-pantry
//
// Same structure, auth and error handling as router/Planner.js.

const express = require('express')
const ShoppingList = require('../../models/ShoppingList')
const MealPlan = require('../../models/MealPlan')
const Pantry = require('../../models/Pantry')
const requireAuth = require('../middleware/auth')
const {
  CATEGORIES,
  normalizeName,
  normalizeUnit,
  buildShoppingItems,
  reconcileItems,
  canGoInPantry,
  defaultBasket,
} = require('../services/shoppinglistbuilder')
const { getPantry, addBoughtItemsToPantry } = require('../services/pantrysync')

const { normalizeWeekStart, isValidId } = MealPlan

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Helpers (same as Planner.js)                                        */
/* ------------------------------------------------------------------ */

const { httpError, makeHandler } = require('../utils/http')
const handle = makeHandler({
  fallback: 'Something went wrong with the shopping list',
  duplicate: 'Your list was just updated, please try again',
})

router.use(requireAuth)
router.use((req, res, next) => {
  req.userId = String(req.user._id)
  next()
})

function parseWeekStart(start) {
  const weekStart = normalizeWeekStart(start)
  if (!weekStart) throw httpError(400, 'start must be a Monday in YYYY-MM-DD format')
  return weekStart
}

function checkItemId(itemId) {
  if (!isValidId(itemId)) throw httpError(400, 'Invalid item id')
}

async function findUserItem(userId, itemId) {
  const list = await ShoppingList.findOne({ userId, 'items._id': itemId })
  if (!list) throw httpError(404, 'Item not found in your shopping list')
  return { list, item: list.items.id(itemId) }
}

function checkBasket(body = {}) {
  const name = String(body.name ?? '').trim()
  if (!name) throw httpError(400, 'Give the item a name')
  if (name.length > 60) throw httpError(400, 'Name must be 60 characters or fewer')

  const quantity = Number(body.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(400, 'Amount must be more than 0')

  if (!Pantry.UNITS.includes(body.unit)) throw httpError(400, `Unit must be one of ${Pantry.UNITS.join(', ')}`)
  const category = Pantry.CATEGORIES.includes(body.category) ? body.category : 'other'

  let expiryDate = null
  if (body.expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.expiryDate)) throw httpError(400, 'Use-by date must be a valid date')
    expiryDate = new Date(`${body.expiryDate}T00:00:00+08:00`)
    if (Number.isNaN(expiryDate.getTime())) throw httpError(400, 'Use-by date must be a valid date')
  }

  return { name, quantity: Math.round(quantity * 1000) / 1000, unit: body.unit, category, expiryDate, addToPantry: body.addToPantry !== false }
}

function readyForPantry(item) {
  if (!item.purchased || item.addedToPantry) return false
  if (item.basket) return item.basket.addToPantry !== false
  return item.quantity > 0 && canGoInPantry(item)
}

/* ---------- Converting the meal plan into what the list builder expects ---------- */

function mealsFromPlan(plan) {
  if (!plan) return []
  return plan.entries
    .filter((entry) => entry.recipeId && Array.isArray(entry.recipeId.ingredients))
    .map((entry) => {
      const recipe = entry.recipeId
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
            quantity: ing.amount,
            unit: ing.unit,
            category: ing.category,
            aisle: ing.aisle,
          })),
      }
    })
}

function pantryBeforeCooking(pantry, plan) {
  const taken = (plan ? plan.entries : [])
    .filter((entry) => entry.status === 'Cooked')
    .flatMap((entry) => entry.pantryDeductions || [])
    .map((d) => ({ name: d.name, quantity: d.quantity, unit: d.unit }))
  return [...pantry, ...taken]
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// GET /shoppinglist
router.get('/', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.query.start)
  const list = await ShoppingList.findOne({ userId: req.userId, weekStart }).lean()
  res.json(list || { weekStart, items: [], generatedAt: null })
}))

// POST /shoppinglist/generate
router.post('/generate', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)

  const [plan, pantry, existing] = await Promise.all([
    MealPlan.findOne({ userId: req.userId, weekStart }).populate('entries.recipeId').lean(),
    getPantry(req.userId),
    ShoppingList.findOne({ userId: req.userId, weekStart }),
  ])

  const freshItems = buildShoppingItems(mealsFromPlan(plan), pantryBeforeCooking(pantry, plan))

  const list = existing || new ShoppingList({ userId: req.userId, weekStart, items: [] })
  list.items = reconcileItems(list.items.map((i) => i.toObject()), freshItems)
  list.mealPlanId = plan ? plan._id : null
  list.generatedAt = new Date()
  await list.save()

  res.json(list)
}))

// PATCH /shoppinglist/items/:itemId
router.patch('/items/:itemId', handle(async (req, res) => {
  const { itemId } = req.params
  const { purchased } = req.body
  checkItemId(itemId)
  if (typeof purchased !== 'boolean') throw httpError(400, 'purchased must be true or false')

  const { list, item } = await findUserItem(req.userId, itemId)
  if (!purchased && item.addedToPantry) {
    throw httpError(400, 'This item is already in your pantry. Change it on the Pantry page instead.')
  }

  item.purchased = purchased
  item.purchasedAt = purchased ? new Date() : null
  if (purchased && !item.basket) item.basket = defaultBasket(item)
  if (!purchased) item.basket = undefined
  await list.save()

  res.json(item)
}))

// PATCH /shoppinglist/items/:itemId/basket
router.patch('/items/:itemId/basket', handle(async (req, res) => {
  const { itemId } = req.params
  checkItemId(itemId)
  const { list, item } = await findUserItem(req.userId, itemId)
  if (!item.purchased) throw httpError(400, 'Put the item in your basket first')
  if (item.addedToPantry) throw httpError(400, 'This item is already in your pantry. Change it on the Pantry page instead.')

  item.basket = checkBasket(req.body)
  await list.save()

  res.json(item)
}))

// POST /shoppinglist/items
router.post('/items', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)

  const name = String(req.body.name ?? '').trim()
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity)
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'other'
  if (!name) throw httpError(400, 'Item name is required')
  if (name.length > 60) throw httpError(400, 'Item name must be 60 characters or fewer')
  if (!(quantity > 0)) throw httpError(400, 'Quantity must be more than 0')

  const { unit, factor } = normalizeUnit(req.body.unit)

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

// DELETE /shoppinglist/items/:itemId
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

// POST /shoppinglist/add-to-pantry
router.post('/add-to-pantry', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)
  const list = await ShoppingList.findOne({ userId: req.userId, weekStart })
  if (!list) throw httpError(404, 'There is no shopping list for this week')

  const toAdd = list.items.filter(readyForPantry)
  if (toAdd.length === 0) throw httpError(400, 'Put the items you bought in your basket first')

  const { added, skipped } = await addBoughtItemsToPantry(req.userId, toAdd)
  added.forEach((item) => {
    item.addedToPantry = true
  })
  await list.save()

  res.json({ list, added: added.length, skipped })
}))

module.exports = router
module.exports.pantryBeforeCooking = pantryBeforeCooking
module.exports.checkBasket = checkBasket
module.exports.readyForPantry = readyForPantry
