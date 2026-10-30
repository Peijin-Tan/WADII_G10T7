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
const Pantry = require('../../models/Pantry')
// James's pantry helper: names the user has (quantity > 0)
const { getPantryNames } = require('./pantry')
// Shared naming rules, also used by the shopping list: "Eggs" -> "egg", and "egg" != "eggplant"
const { ingredientMatches, normalizeIngredient } = require('../services/ingredientnames')
// Spoonacular search (Add Meal modal) and saving a chosen Spoonacular recipe into our Recipe collection
const { searchRecipes, importRecipe } = require('../services/spoonacular')

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

/* ---------- Pantry integration ---------- */
// getPantryNames(userId) comes from pantry.js: an array of normalized names the user has (quantity > 0).

// True if the user has this recipe ingredient in their pantry
function isInPantry(pantryNames, ingredientName) {
  return pantryNames.some((p) => ingredientMatches(p, ingredientName))
}

// convertAmount(2, 'tbsp', 'ml') -> 29.58, or null if the units can't be compared (cups vs g).
// Shared with the pantry and shopping list (services/units.js) so all three convert the same way.
const { convertAmount } = require('../services/units')

const round2 = (n) => Math.round(n * 100) / 100

// Best pantry row for a recipe ingredient: an exact name first, otherwise a whole-word match
function findPantryItem(items, ingredientName) {
  const wanted = normalizeIngredient(ingredientName)
  return items.find((i) => i.normalizedName === wanted) ||
    items.find((i) => ingredientMatches(i.normalizedName, ingredientName))
}

// Meal marked Cooked: subtract its ingredients (scaled to the planned servings) from the pantry.
// Returns what was taken, so it can be saved on the entry and given back exactly if the user undoes it.
async function deductFromPantry(userId, entry) {
  const result = { deducted: [], skipped: [] }
  if (!entry.recipeId) return result // custom meals have no ingredients

  const recipe = await Recipe.findById(entry.recipeId).select('servings ingredients').lean()
  const ingredients = (recipe && Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((ing) => ing && ing.name && Number(ing.amount) > 0)
  if (!ingredients.length) return result

  const scale = entry.servings / (recipe.servings || entry.servings) // e.g. 4-serving recipe planned for 2 -> 0.5
  const items = await Pantry.find({ user: userId, quantity: { $gt: 0 } })
  const changed = new Set()

  for (const ing of ingredients) {
    const item = findPantryItem(items, ing.name)
    if (!item || item.quantity <= 0) {
      result.skipped.push({ name: ing.name, reason: 'not in pantry' })
      continue
    }
    const needed = convertAmount(Number(ing.amount) * scale, ing.unit, item.unit)
    if (needed === null) {
      result.skipped.push({ name: ing.name, reason: `can't convert ${ing.unit || 'pieces'} to ${item.unit}` })
      continue
    }
    const taken = round2(Math.min(item.quantity, needed)) // never below 0
    if (taken <= 0) continue
    item.quantity = round2(item.quantity - taken)
    changed.add(item)
    result.deducted.push({ pantryItemId: item._id, name: item.name, quantity: taken, unit: item.unit })
  }

  await Promise.all([...changed].map((item) => item.save()))
  return result
}

// Cooked meal undone (back to In Progress / Skipped, or swapped): give back exactly what was taken
async function restoreToPantry(userId, entry) {
  const result = { restored: [] }
  for (const d of entry.pantryDeductions || []) {
    // the row may have been deleted and re-added since, so fall back to matching by name
    let item = await Pantry.findOne({ _id: d.pantryItemId, user: userId })
    if (!item) item = await Pantry.findOne({ user: userId, normalizedName: normalizeIngredient(d.name) })

    if (item && item.unit === d.unit) {
      item.quantity = round2(item.quantity + d.quantity)
      await item.save()
    } else if (!item) {
      await Pantry.create({ user: userId, name: d.name, quantity: d.quantity, unit: d.unit })
    } else {
      continue // the user changed this item's unit since; don't guess a conversion
    }
    result.restored.push({ name: d.name, quantity: d.quantity, unit: d.unit })
  }
  entry.pantryDeductions = []
  return result
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

// Turns a Spoonacular failure into a message the user can act on
function spoonacularError(err) {
  const status = err.response && err.response.status
  if (status === 402) return httpError(503, 'Spoonacular\'s daily recipe limit has been reached. Try again tomorrow, or pick one of your saved recipes.')
  if (status === 404) return httpError(404, 'That recipe is no longer available on Spoonacular.')
  if (status === 401) return httpError(502, 'Spoonacular is not set up on the server (check SPOONACULAR_API_KEY).')
  return httpError(502, 'Could not reach Spoonacular. Please try again.')
}

// GET /planner/recipe-search?search=chicken
// Used by the Add Meal modal while the user types.
// Returns { saved: [...], online: [...], warning }:
//   saved  = matching recipes already in our database (created by users, or added from Spoonacular before)
//   online = new matches from Spoonacular, not saved yet (id "spoonacular-<id>"); saved when added to the plan
//   warning = set if Spoonacular couldn't be searched (e.g. quota), so the modal can still show saved results
router.get('/recipe-search', handle(async (req, res) => {
  const search = String(req.query.search || '').trim()
  if (search.length < 2) throw httpError(400, 'Type at least 2 letters to search')
  const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // so a search like "c++" doesn't crash

  const [savedRecipes, pantryNames] = await Promise.all([
    Recipe.find({ title: { $regex: safe, $options: 'i' } }).sort({ title: 1 }).limit(10).lean(),
    getPantryNames(req.userId),
  ])

  let online = []
  let warning = null
  try {
    const found = await searchRecipes(search)
    // A Spoonacular recipe someone already added is in our database: show that saved copy instead
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
        id: `spoonacular-${r.externalId}`, // not in our database yet, so no MongoDB id
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
// body: { start, dayOfWeek, mealSlot, servings, recipeId }        <- a recipe already in our database
//   or: { start, dayOfWeek, mealSlot, servings, spoonacularId }   <- a Spoonacular search result (saved first)
// (old plans may still contain customMeal entries; they still display, but the modal no longer creates them)
router.post('/entries', handle(async (req, res) => {
  const { start, dayOfWeek, mealSlot, servings, recipeId, spoonacularId, customMeal } = req.body
  const weekStart = parseWeekStart(start)
  // check everything first, so a bad request never uses Spoonacular quota
  checkDay(dayOfWeek)
  checkSlot(mealSlot)
  checkServings(servings)

  const entry = { dayOfWeek, mealSlot, servings }
  if (spoonacularId !== undefined) {
    if (!Number.isSafeInteger(spoonacularId) || spoonacularId < 1) throw httpError(400, 'Invalid Spoonacular recipe id')
    let recipe
    try {
      recipe = await importRecipe(spoonacularId) // saves it as a Recipe (or reuses the saved copy)
    } catch (err) {
      if (err.response) throw spoonacularError(err) // the Spoonacular request failed
      throw err // e.g. a validation error, handled by handle()
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
  await plan.save() // runs schema validation + the cookedAt hook

  res.status(201).json(await loadWeek(req.userId, weekStart))
}))

// PATCH /api/planner/entries/:entryId
// body can contain any of: { status, recipeId, servings, dayOfWeek, mealSlot }
router.patch('/entries/:entryId', handle(async (req, res) => {
  const { plan, entry } = await findUserEntry(req.userId, req.params.entryId)
  const { status, recipeId, servings, dayOfWeek, mealSlot } = req.body
  const wasCooked = entry.status === 'Cooked'

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
  // Moving the meal to another day and/or meal time
  if (dayOfWeek !== undefined || mealSlot !== undefined) {
    if (dayOfWeek !== undefined) checkDay(dayOfWeek)
    if (mealSlot !== undefined) checkSlot(mealSlot)

    const oldDay = entry.dayOfWeek
    const oldSlot = entry.mealSlot
    const newDay = dayOfWeek !== undefined ? dayOfWeek : oldDay
    const newSlot = mealSlot !== undefined ? mealSlot : oldSlot

    // If another meal already sits in the target slot (e.g. moving lunch -> dinner when dinner exists),
    // swap the two meals instead of putting two meals in one slot. Snacks can stack, so they never swap.
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

  // Pantry: only act when the meal moves INTO or OUT OF Cooked, so ingredients are never taken twice
  await plan.validate() // reject bad input before touching the pantry
  const isCooked = entry.status === 'Cooked'
  let pantryUpdate = null
  if (!wasCooked && isCooked) {
    pantryUpdate = await deductFromPantry(req.userId, entry)
    entry.pantryDeductions = pantryUpdate.deducted // remembered so an undo gives back exactly this
  } else if (wasCooked && !isCooked) {
    pantryUpdate = await restoreToPantry(req.userId, entry)
  }

  // one save() updates both meals together, so a swap can never be half-done
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