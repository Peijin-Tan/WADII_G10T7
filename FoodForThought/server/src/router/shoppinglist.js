// Weekly shopping list API
// Mount in server.js / app.js, next to the planner:
//   app.use('/shoppinglist', require('./routes/shoppingList/ShoppingList'))
// (the frontend calls http://localhost:8000/shoppinglist, the same way it calls /planner)
//
//   GET    /shoppinglist?start=YYYY-MM-DD       -> the logged-in user's list for that week
//   POST   /shoppinglist/generate  { start }    -> build / refresh it from that week's meal plan
//   PATCH  /shoppinglist/items/:itemId  { purchased }   -> tick / untick an item (= into / out of the basket)
//   PATCH  /shoppinglist/items/:itemId/basket  { name, quantity, unit, category, expiryDate, addToPantry }
//                                                       -> shopping mode: what was actually bought
//   POST   /shoppinglist/items  { start, name, quantity, unit, category }  -> add a manual item
//   DELETE /shoppinglist/items/:itemId          -> remove a manual item
//   POST   /shoppinglist/add-to-pantry  { start }    -> move ticked items into the pantry
//
// Same structure, auth and error handling as routes/planner/Planner.js.

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

// The list (as a document we can save) and the item in it, only if it's on this user's list
async function findUserItem(userId, itemId) {
  const list = await ShoppingList.findOne({ userId, 'items._id': itemId })
  if (!list) throw httpError(404, 'Item not found in your shopping list')
  return { list, item: list.items.id(itemId) }
}

// Checks shopping-mode details sent by the page, with messages a shopper can act on.
// Returns a clean object for item.basket.
function checkBasket(body = {}) {
  const name = String(body.name ?? '').trim()
  if (!name) throw httpError(400, 'Give the item a name')
  if (name.length > 60) throw httpError(400, 'Name must be 60 characters or fewer') // same limit as the pantry

  const quantity = Number(body.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(400, 'Amount must be more than 0')

  if (!Pantry.UNITS.includes(body.unit)) throw httpError(400, `Unit must be one of ${Pantry.UNITS.join(', ')}`)
  const category = Pantry.CATEGORIES.includes(body.category) ? body.category : 'other'

  let expiryDate = null
  if (body.expiryDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.expiryDate)) throw httpError(400, 'Use-by date must be a valid date')
    expiryDate = new Date(`${body.expiryDate}T00:00:00+08:00`) // a calendar day in Singapore
    if (Number.isNaN(expiryDate.getTime())) throw httpError(400, 'Use-by date must be a valid date')
  }

  return { name, quantity: Math.round(quantity * 1000) / 1000, unit: body.unit, category, expiryDate, addToPantry: body.addToPantry !== false }
}

// Items "Add to pantry" will move: in the basket, not added yet, and switched on for the pantry.
// Ticked items without basket details (from older lists) go in if the pantry has a unit for them.
function readyForPantry(item) {
  if (!item.purchased || item.addedToPantry) return false
  if (item.basket) return item.basket.addToPantry !== false
  return item.quantity > 0 && canGoInPantry(item)
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

// A Cooked meal has already taken its ingredients out of the pantry (Planner.js deductFromPantry
// saves what it took on entry.pantryDeductions). The list still counts Cooked meals, so ticked items
// don't vanish mid-week. Without this, the same eggs would be counted twice: once as "needed" by the
// cooked meal and again as "missing" from the pantry, and the list would ask you to buy them again.
// So we add what cooking took back on top of the current pantry, i.e. the pantry as it was before cooking.
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

// GET /shoppinglist?start=2026-10-19
router.get('/', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.query.start)
  const list = await ShoppingList.findOne({ userId: req.userId, weekStart }).lean()
  // No list yet -> send an empty one so the frontend always gets the same shape
  res.json(list || { weekStart, items: [], generatedAt: null })
}))

// POST /shoppinglist/generate   body: { start }
router.post('/generate', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)

  const [plan, pantry, existing] = await Promise.all([
    MealPlan.findOne({ userId: req.userId, weekStart }).populate('entries.recipeId').lean(),
    getPantry(req.userId),
    ShoppingList.findOne({ userId: req.userId, weekStart }),
  ])

  const freshItems = buildShoppingItems(mealsFromPlan(plan), pantryBeforeCooking(pantry, plan))

  const list = existing || new ShoppingList({ userId: req.userId, weekStart, items: [] })
  // Keeps manual items, and keeps ticks on items that are still needed
  list.items = reconcileItems(list.items.map((i) => i.toObject()), freshItems)
  list.mealPlanId = plan ? plan._id : null
  list.generatedAt = new Date()
  await list.save()

  res.json(list)
}))

// PATCH /shoppinglist/items/:itemId   body: { purchased: true | false }
router.patch('/items/:itemId', handle(async (req, res) => {
  const { itemId } = req.params
  const { purchased } = req.body
  checkItemId(itemId)
  if (typeof purchased !== 'boolean') throw httpError(400, 'purchased must be true or false')

  // Filtering on userId means users can only tick items on their OWN lists
  const { list, item } = await findUserItem(req.userId, itemId)
  // Items already moved to the pantry can't be unticked (the pantry would then be wrong)
  if (!purchased && item.addedToPantry) {
    throw httpError(400, 'This item is already in your pantry. Change it on the Pantry page instead.')
  }

  item.purchased = purchased
  item.purchasedAt = purchased ? new Date() : null
  // Ticked = in the basket: start its pantry details from the list (shopping mode lets the user edit them).
  // Unticked = back to "to buy": forget the details.
  if (purchased && !item.basket) item.basket = defaultBasket(item)
  if (!purchased) item.basket = undefined
  await list.save()

  res.json(item)
}))

// PATCH /shoppinglist/items/:itemId/basket   body: { name, quantity, unit, category, expiryDate, addToPantry }
// Shopping mode: save what was actually bought (e.g. "Jasmine rice, 2 kg bag, use by 30 Nov").
// Saved straight away, so nothing is lost if the phone sleeps or the page reloads in the supermarket.
router.patch('/items/:itemId/basket', handle(async (req, res) => {
  const { itemId } = req.params
  checkItemId(itemId)
  const { list, item } = await findUserItem(req.userId, itemId)
  if (!item.purchased) throw httpError(400, 'Put the item in your basket first')
  if (item.addedToPantry) throw httpError(400, 'This item is already in your pantry. Change it on the Pantry page instead.')

  item.basket = checkBasket(req.body)
  await list.save() // the schema also checks unit and category against the pantry's lists

  res.json(item)
}))

// POST /shoppinglist/items   body: { start, name, quantity?, unit?, category? }
router.post('/items', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)

  const name = String(req.body.name ?? '').trim()
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity)
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'other'
  if (!name) throw httpError(400, 'Item name is required')
  if (name.length > 60) throw httpError(400, 'Item name must be 60 characters or fewer') // same limit as the pantry
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

// DELETE /shoppinglist/items/:itemId
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

// POST /shoppinglist/add-to-pantry   body: { start }
// Moves every ticked item that isn't in the pantry yet into the pantry.
// Responds with the updated list, how many were added, and any that were skipped (with a reason).
router.post('/add-to-pantry', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.body.start)
  const list = await ShoppingList.findOne({ userId: req.userId, weekStart })
  if (!list) throw httpError(404, 'There is no shopping list for this week')

  // In the basket, not added yet, and meant for the pantry (so "1 bottle dish soap" is left alone)
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
// For unit tests (tests/integration.test.js)
module.exports.pantryBeforeCooking = pantryBeforeCooking
module.exports.checkBasket = checkBasket
module.exports.readyForPantry = readyForPantry
