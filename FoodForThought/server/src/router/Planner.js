// Weekly meal planner API, mounted in server/index.js as app.use('/planner', plannerRouter)
//
//   GET    /planner
//   GET    /planner/recipe-options
//   GET    /planner/recipe-search
//   POST   /planner/entries
//   PATCH  /planner/entries/:entryId
//   DELETE /planner/entries/:entryId
//
// Every write returns the whole updated week, so the frontend just replaces its copy.

const express = require('express')
const mongoose = require('mongoose')
const MealPlan = require('../../models/MealPlan')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')
const Pantry = require('../../models/Pantry')
const { getPantryNames } = require('./pantry')
const { ingredientMatches, normalizeIngredient } = require('../services/ingredientnames')
const { searchRecipes, importRecipe } = require('../services/spoonacular')

const { normalizeWeekStart, isValidId, MEAL_SLOTS, ENTRY_STATUS } = MealPlan

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const { httpError, makeHandler } = require('../utils/http')
const handle = makeHandler({ fallback: 'Something went wrong with the meal planner' })

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

/* ---------- Pantry integration ---------- */

function isInPantry(pantryNames, ingredientName) {
  return pantryNames.some((p) => ingredientMatches(p, ingredientName))
}

const { convertAmount } = require('../services/units')

const round2 = (n) => Math.round(n * 100) / 100

function findPantryItem(items, ingredientName) {
  const wanted = normalizeIngredient(ingredientName)
  return items.find((i) => i.normalizedName === wanted) ||
    items.find((i) => ingredientMatches(i.normalizedName, ingredientName))
}

async function deductFromPantry(userId, entry) {
  const result = { deducted: [], skipped: [] }
  if (!entry.recipeId) return result

  const recipe = await Recipe.findById(entry.recipeId).select('servings ingredients').lean()
  const ingredients = (recipe && Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((ing) => ing && ing.name && Number(ing.amount) > 0)
  if (!ingredients.length) return result

  const scale = entry.servings / (recipe.servings || entry.servings)
  const items = await Pantry.find({ user: userId, quantity: { $gt: 0 } })
  const changed = new Set()

  for (const ing of ingredients) {
    const item = findPantryItem(items, ing.name)
    if (!item || item.quantity <= 0) {
      result.skipped.push({ name: ing.name, reason: 'not in pantry' })
      continue
    }
    const needed = convertAmount(Number(ing.amount) * scale, ing.unit, item.unit, ing.name)
    if (needed === null) {
      result.skipped.push({ name: ing.name, reason: `can't convert ${ing.unit || 'pieces'} to ${item.unit}` })
      continue
    }
    const taken = round2(Math.min(item.quantity, needed))
    if (taken <= 0) continue
    item.quantity = round2(item.quantity - taken)
    changed.add(item)
    result.deducted.push({ pantryItemId: item._id, name: item.name, quantity: taken, unit: item.unit })
  }

  await Promise.all([...changed].map((item) => item.save()))
  return result
}

async function restoreToPantry(userId, entry) {
  const result = { restored: [] }
  for (const d of entry.pantryDeductions || []) {
    let item = await Pantry.findOne({ _id: d.pantryItemId, user: userId })
    if (!item) item = await Pantry.findOne({ user: userId, normalizedName: normalizeIngredient(d.name) })

    const back = item ? convertAmount(d.quantity, d.unit, item.unit, d.name) : null
    if (item && back !== null) {
      item.quantity = round2(item.quantity + back)
      await item.save()
    } else if (!item) {
      await Pantry.create({ user: userId, name: d.name, quantity: d.quantity, unit: d.unit })
    } else {
      continue
    }
    result.restored.push({ name: d.name, quantity: d.quantity, unit: d.unit })
  }
  entry.pantryDeductions = []
  return result
}

/* ---------- Converting DB documents into the shape the Vue modals expect ---------- */

function nutrient(recipe, name) {
  const list = Array.isArray(recipe.nutrition) ? recipe.nutrition : []
  const found = list.find((n) => n && typeof n.name === 'string' && n.name.toLowerCase() === name)
  const amount = found ? Number(found.amount) : NaN
  return Number.isFinite(amount) ? Math.round(amount) : null
}

function shortDescription(html) {
  const text = (html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function formatQuantity(amount, unit) {
  const rounded = Math.round((amount || 0) * 100) / 100
  return [rounded || '', unit].filter(Boolean).join(' ')
}

function toRecipeCard(recipe, pantryNames) {
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((ing) => ing && ing.name)
    .map((ing) => ({
      name: String(ing.name),
      quantity: formatQuantity(Number(ing.amount), ing.unit),
      amount: Number(ing.amount) > 0 ? Number(ing.amount) : null,
      unit: ing.unit || '',
      inPantry: isInPantry(pantryNames, ing.name),
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

async function getOrCreatePlan(userId, weekStart) {
  const existing = await MealPlan.findOne({ userId, weekStart })
  if (existing) return existing
  try {
    return await MealPlan.create({ userId, weekStart, entries: [] })
  } catch (err) {
    if (err.code === 11000) return MealPlan.findOne({ userId, weekStart })
    throw err
  }
}

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

// GET /api/planner
router.get('/', handle(async (req, res) => {
  const weekStart = parseWeekStart(req.query.start)
  res.json(await loadWeek(req.userId, weekStart))
}))

// GET /api/planner/recipe-options
router.get('/recipe-options', handle(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100)
  const search = String(req.query.search || '').trim()

  const filter = {}
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.title = { $regex: safe, $options: 'i' }
  }

  const [recipes, pantryNames] = await Promise.all([
    Recipe.find(filter).sort({ title: 1 }).limit(limit).lean(),
    getPantryNames(req.userId),
  ])
  res.json(recipes.map((r) => toRecipeCard(r, pantryNames)))
}))

function spoonacularError(err) {
  const status = err.response && err.response.status
  if (status === 402) return httpError(503, 'Spoonacular\'s daily recipe limit has been reached. Try again tomorrow, or pick one of your saved recipes.')
  if (status === 404) return httpError(404, 'That recipe is no longer available on Spoonacular.')
  if (status === 401) return httpError(502, 'Spoonacular is not set up on the server (check SPOONACULAR_API_KEY).')
  return httpError(502, 'Could not reach Spoonacular. Please try again.')
}

// GET /planner/recipe-search
router.get('/recipe-search', handle(async (req, res) => {
  const search = String(req.query.search || '').trim()
  if (search.length < 2) throw httpError(400, 'Type at least 2 letters to search')
  const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const [savedRecipes, pantryNames] = await Promise.all([
    Recipe.find({ title: { $regex: safe, $options: 'i' } }).sort({ title: 1 }).limit(10).lean(),
    getPantryNames(req.userId),
  ])

  let online = []
  let warning = null
  try {
    const found = await searchRecipes(search)
    const alreadySaved = await Recipe.find({ externalId: { $in: found.map((r) => r.externalId) } }).lean()
    const savedIds = new Set(savedRecipes.map((r) => String(r._id)))
    alreadySaved.forEach((r) => {
      if (!savedIds.has(String(r._id))) savedRecipes.push(r)
    })
    const savedExternalIds = new Set(alreadySaved.map((r) => r.externalId))
    online = found
      .filter((r) => !savedExternalIds.has(r.externalId))
      .map((r) => ({
        ...toRecipeCard(r, pantryNames),
        id: `spoonacular-${r.externalId}`,
        externalId: r.externalId,
        source: 'spoonacular',
      }))
  } catch (err) {
    console.error('Spoonacular search failed:', err.message)
    warning = spoonacularError(err).message
  }

  res.json({
    saved: savedRecipes.map((r) => ({ ...toRecipeCard(r, pantryNames), source: r.source || 'user' })),
    online,
    warning,
  })
}))

// POST /api/planner/entries
router.post('/entries', handle(async (req, res) => {
  const { start, dayOfWeek, mealSlot, servings, recipeId, spoonacularId, customMeal } = req.body
  const weekStart = parseWeekStart(start)
  checkDay(dayOfWeek)
  checkSlot(mealSlot)
  checkServings(servings)

  const entry = { dayOfWeek, mealSlot, servings }
  if (spoonacularId !== undefined) {
    if (!Number.isSafeInteger(spoonacularId) || spoonacularId < 1) throw httpError(400, 'Invalid Spoonacular recipe id')
    let recipe
    try {
      recipe = await importRecipe(spoonacularId)
    } catch (err) {
      if (err.response) throw spoonacularError(err)
      throw err
    }
    entry.recipeId = recipe._id
  } else if (customMeal && customMeal.title && String(customMeal.title).trim()) {
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
  await plan.save()

  res.status(201).json(await loadWeek(req.userId, weekStart))
}))

// PATCH /api/planner/entries/:entryId
router.patch('/entries/:entryId', handle(async (req, res) => {
  const { plan, entry } = await findUserEntry(req.userId, req.params.entryId)
  const { status, recipeId, servings, dayOfWeek, mealSlot } = req.body
  const wasCooked = entry.status === 'Cooked'

  if (status !== undefined) {
    if (!ENTRY_STATUS.includes(status)) throw httpError(400, `status must be one of ${ENTRY_STATUS.join(', ')}`)
    entry.status = status
  }
  if (recipeId !== undefined) {
    await assertRecipeExists(recipeId)
    entry.recipeId = recipeId
    entry.customMeal = undefined
    entry.status = 'Planned'
  }
  if (servings !== undefined) {
    checkServings(servings)
    entry.servings = servings
  }
  if (dayOfWeek !== undefined || mealSlot !== undefined) {
    if (dayOfWeek !== undefined) checkDay(dayOfWeek)
    if (mealSlot !== undefined) checkSlot(mealSlot)

    const oldDay = entry.dayOfWeek
    const oldSlot = entry.mealSlot
    const newDay = dayOfWeek !== undefined ? dayOfWeek : oldDay
    const newSlot = mealSlot !== undefined ? mealSlot : oldSlot

    if (newSlot !== 'snack') {
      const occupant = plan.entries.find((e) =>
        !e._id.equals(entry._id) && e.dayOfWeek === newDay && e.mealSlot === newSlot)
      if (occupant) {
        occupant.dayOfWeek = oldDay
        occupant.mealSlot = oldSlot
      }
    }

    entry.dayOfWeek = newDay
    entry.mealSlot = newSlot
  }

  await plan.validate()
  const isCooked = entry.status === 'Cooked'
  let pantryUpdate = null
  if (!wasCooked && isCooked) {
    pantryUpdate = await deductFromPantry(req.userId, entry)
    entry.pantryDeductions = pantryUpdate.deducted
  } else if (wasCooked && !isCooked) {
    pantryUpdate = await restoreToPantry(req.userId, entry)
  }

  await plan.save()
  res.json({ ...(await loadWeek(req.userId, plan.weekStart)), pantryUpdate })
}))

// DELETE /api/planner/entries/:entryId
router.delete('/entries/:entryId', handle(async (req, res) => {
  const { plan } = await findUserEntry(req.userId, req.params.entryId)
  plan.entries.pull(req.params.entryId)
  await plan.save()
  res.json(await loadWeek(req.userId, plan.weekStart))
}))

module.exports = router