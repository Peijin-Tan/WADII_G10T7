// Weekly meal planner API
// Mount in server.js / app.js:   app.use('/api/planner', require('./routes/planner/Planner'))
//
//   GET    /api/planner?start=YYYY-MM-DD        -> the logged-in user's plan for that week
//   GET    /api/planner/recipe-options?search=  -> recipes for the Add Meal / Swap modals
//   POST   /api/planner/entries                 -> add a meal to a day + slot
//   PATCH  /api/planner/entries/:entryId        -> change status (Cooked/Skipped), swap recipe, servings...
//   DELETE /api/planner/entries/:entryId        -> remove a meal from the plan
//
// Every write returns the whole updated week, so the frontend just replaces its copy.

const express = require('express')
const mongoose = require('mongoose')
const MealPlan = require('../../models/MealPlan')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')

const { normalizeWeekStart, isValidId, MEAL_SLOTS, ENTRY_STATUS } = MealPlan

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
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
    console.error(err)
    res.status(500).json({ message: 'Something went wrong with the meal planner' })
  }
}

// Every planner route needs a logged-in user.
// requireAuth (Kester's JWT middleware) checks the "Authorization: Bearer <token>" header
// and puts the user from the database on req.user. We copy their id to req.userId,
// so every query below only ever touches the logged-in user's own meal plans.
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

// TODO(James): replace with the real pantry lookup once the Pantry model is ready.
// Should return a Set of lower-case ingredient names the user has, e.g. new Set(['eggs', 'garlic'])
async function getPantryNames(userId) {
  return new Set()
}

/* ---------- Converting DB documents into the shape the Vue modals expect ---------- */

// Spoonacular stores nutrition as [{ name: 'Calories', amount: 360, unit: 'kcal' }, ...]
function nutrient(recipe, name) {
  const list = Array.isArray(recipe.nutrition) ? recipe.nutrition : []
  const found = list.find((n) => n && typeof n.name === 'string' && n.name.toLowerCase() === name)
  const amount = found ? Number(found.amount) : NaN
  return Number.isFinite(amount) ? Math.round(amount) : null
}

// Spoonacular summaries contain HTML tags, strip them and keep it short for the cards
function shortDescription(html) {
  const text = (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function formatQuantity(amount, unit) {
  const rounded = Math.round((amount || 0) * 100) / 100
  return [rounded || '', unit].filter(Boolean).join(' ')
}

// Written defensively: placeholder recipes in the DB may be missing fields,
// and one bad recipe shouldn't break the whole planner page.
function toRecipeCard(recipe, pantryNames) {
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((ing) => ing && ing.name)
    .map((ing) => ({
      name: String(ing.name),
      quantity: formatQuantity(Number(ing.amount), ing.unit),
      inPantry: pantryNames.has(String(ing.name).toLowerCase()),
    }))
  const inPantryCount = ingredients.filter((i) => i.inPantry).length

  return {
    id: String(recipe._id),
    title: recipe.title || 'Untitled recipe',
    image: recipe.image || null,
    description: shortDescription(recipe.summary),
    servings: recipe.servings || 1,
    prepMinutes: recipe.prepTime > 0 ? recipe.prepTime : recipe.totalTime || 0,
    tags: Array.isArray(recipe.dietaryCategories) ? recipe.dietaryCategories : [],
    nutrition: {
      calories: nutrient(recipe, 'calories'),
      protein: nutrient(recipe, 'protein'),
      carbs: nutrient(recipe, 'carbohydrates'),
      fat: nutrient(recipe, 'fat'),
      fiber: nutrient(recipe, 'fiber'),
    },
    ingredients,
    steps: (Array.isArray(recipe.instructions) ? recipe.instructions : [])
      .filter((s) => s && s.description)
      .sort((a, b) => (a.step || 0) - (b.step || 0))
      .map((s, i) => ({ title: `Step ${s.step || i + 1}`, text: s.description })),
    pantryMatch: ingredients.length ? Math.round((inPantryCount / ingredients.length) * 100) : 0,
  }
}

// Card for meals without a recipe (custom meal, or a recipe that has since been deleted)
function toPlaceholderCard({ title, description, tag, servings, macros = {} }) {
  return {
    id: null,
    custom: true,
    title,
    image: null,
    description,
    servings,
    prepMinutes: 0,
    tags: [tag],
    nutrition: {
      calories: macros.calories ?? null,
      protein: macros.protein ?? null,
      carbs: macros.carbs ?? null,
      fat: macros.fat ?? null,
      fiber: null,
    },
    ingredients: [],
    steps: [],
    pantryMatch: 0,
  }
}

function toEntryDTO(entry, pantryNames) {
  let recipe
  if (entry.customMeal && entry.customMeal.title) {
    recipe = toPlaceholderCard({
      title: entry.customMeal.title,
      description: 'Custom meal',
      tag: 'Custom',
      servings: entry.servings,
      macros: entry.customMeal,
    })
  } else if (entry.recipeId && !(entry.recipeId instanceof mongoose.Types.ObjectId)) {
    // recipeId was populated with the full Recipe document
    // (populate() leaves it as null if the recipe was deleted)
    recipe = toRecipeCard(entry.recipeId, pantryNames)
  } else {
    recipe = toPlaceholderCard({
      title: 'Recipe no longer available',
      description: 'This recipe was removed. Swap it for another meal.',
      tag: 'Unavailable',
      servings: entry.servings,
    })
  }

  return {
    id: String(entry._id),
    dayOfWeek: entry.dayOfWeek,
    mealSlot: entry.mealSlot,
    servings: entry.servings,
    status: entry.status,
    cookedAt: entry.cookedAt || null,
    recipe,
  }
}

// Load one week (with recipes filled in) and convert it for the frontend
async function loadWeek(userId, weekStart) {
  const [plan, pantryNames] = await Promise.all([
    MealPlan.findOne({ userId, weekStart }).populate('entries.recipeId').lean(),
    getPantryNames(userId),
  ])

  return {
    id: plan ? String(plan._id) : null,
    weekStart,
    entries: plan ? plan.entries.map((e) => toEntryDTO(e, pantryNames)) : [],
  }
}

// Find this user's plan for the week, or create an empty one
async function getOrCreatePlan(userId, weekStart) {
  const existing = await MealPlan.findOne({ userId, weekStart })
  if (existing) return existing
  try {
    return await MealPlan.create({ userId, weekStart, entries: [] })
  } catch (err) {
    // two requests created the same week at once -> the unique index rejected one, just use the other
    if (err.code === 11000) return MealPlan.findOne({ userId, weekStart })
    throw err
  }
}

// Finds the plan that contains this entry, making sure it belongs to the logged-in user
async function findUserEntry(userId, entryId) {
  if (!isValidId(entryId)) throw httpError(400, 'Invalid entry id')
  const plan = await MealPlan.findOne({ userId, 'entries._id': entryId })
  if (!plan) throw httpError(404, 'Meal not found in your plan')
  return { plan, entry: plan.entries.id(entryId) }
}

async function assertRecipeExists(recipeId) {
  if (!isValidId(String(recipeId || ''))) throw httpError(400, 'Invalid recipe id')
  const exists = await Recipe.exists({ _id: recipeId })
  if (!exists) throw httpError(404, 'Recipe not found')
}

function checkDay(dayOfWeek) {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw httpError(400, 'dayOfWeek must be 0 (Mon) to 6 (Sun)')
  }
}
function checkSlot(mealSlot) {
  if (!MEAL_SLOTS.includes(mealSlot)) throw httpError(400, `mealSlot must be one of ${MEAL_SLOTS.join(', ')}`)
}
function checkServings(servings) {
  if (!Number.isInteger(servings) || servings < 1 || servings > 12) {
    throw httpError(400, 'servings must be a whole number from 1 to 12')
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// GET /api/planner?start=2026-10-19
router.get('/', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.query.start)
  res.json(await loadWeek(req.userId, weekStart))
}))

// GET /api/planner/recipe-options?search=chicken&limit=50
router.get('/recipe-options', handle(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100)
  const search = String(req.query.search || '').trim()

  const filter = {}
  if (search) {
    // escape regex special characters so a search like "c++" doesn't crash
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.title = { $regex: safe, $options: 'i' }
  }

  const [recipes, pantryNames] = await Promise.all([
    Recipe.find(filter).sort({ title: 1 }).limit(limit).lean(),
    getPantryNames(req.userId),
  ])
  res.json(recipes.map((r) => toRecipeCard(r, pantryNames)))
}))

// POST /api/planner/entries
// body: { start, dayOfWeek, mealSlot, servings, recipeId }                 <- recipe from the list
//   or: { start, dayOfWeek, mealSlot, servings, customMeal: { title, calories, protein, carbs, fat } }
router.post('/entries', handle(async (req, res) => {
  const { start, dayOfWeek, mealSlot, servings, recipeId, customMeal } = req.body
  const weekStart = parseWeekStart(start)
  checkDay(dayOfWeek)
  checkSlot(mealSlot)
  checkServings(servings)

  const entry = { dayOfWeek, mealSlot, servings }
  if (customMeal && customMeal.title && String(customMeal.title).trim()) {
    entry.customMeal = {
      title: String(customMeal.title).trim(),
      calories: customMeal.calories,
      protein: customMeal.protein,
      carbs: customMeal.carbs,
      fat: customMeal.fat,
    }
  } else {
    await assertRecipeExists(recipeId)
    entry.recipeId = recipeId
  }

  const plan = await getOrCreatePlan(req.userId, weekStart)
  plan.entries.push(entry)
  await plan.save() // runs schema validation + the cookedAt hook

  res.status(201).json(await loadWeek(req.userId, weekStart))
}))

// PATCH /api/planner/entries/:entryId
// body can contain any of: { status, recipeId, servings, dayOfWeek, mealSlot }
router.patch('/entries/:entryId', handle(async (req, res) => {
  const { plan, entry } = await findUserEntry(req.userId, req.params.entryId)
  const { status, recipeId, servings, dayOfWeek, mealSlot } = req.body

  if (status !== undefined) {
    if (!ENTRY_STATUS.includes(status)) throw httpError(400, `status must be one of ${ENTRY_STATUS.join(', ')}`)
    entry.status = status // the pre-validate hook sets/clears cookedAt
  }
  if (recipeId !== undefined) {
    // swapping a meal: point at the new recipe and drop any custom meal data
    await assertRecipeExists(recipeId)
    entry.recipeId = recipeId
    entry.customMeal = undefined
    entry.status = 'Planned' // a new meal hasn't been cooked yet
  }
  if (servings !== undefined) {
    checkServings(servings)
    entry.servings = servings
  }
  if (dayOfWeek !== undefined) {
    checkDay(dayOfWeek)
    entry.dayOfWeek = dayOfWeek
  }
  if (mealSlot !== undefined) {
    checkSlot(mealSlot)
    entry.mealSlot = mealSlot
  }

  await plan.save()
  res.json(await loadWeek(req.userId, plan.weekStart))
}))

// DELETE /api/planner/entries/:entryId
router.delete('/entries/:entryId', handle(async (req, res) => {
  const { plan } = await findUserEntry(req.userId, req.params.entryId)
  plan.entries.pull(req.params.entryId)
  await plan.save()
  res.json(await loadWeek(req.userId, plan.weekStart))
}))

module.exports = router