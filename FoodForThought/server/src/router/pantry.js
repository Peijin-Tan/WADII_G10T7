// Pantry API
// Mount in server.js / app.js, the same way as the planner:
//   app.use('/pantry', require('./routes/pantry/pantry'))
//
//   GET    /pantry                  -> the logged-in user's pantry
//   GET    /pantry/suggestions      -> ranked recipes for what's in the pantry
//   POST   /pantry                  -> add an ingredient (adds to the quantity if it's already there)
//   PATCH  /pantry/:itemId          -> change name, quantity, unit, category or expiry date
//   DELETE /pantry/:itemId          -> remove an ingredient
//
// Every write returns the whole updated pantry as { items }, so the frontend just replaces its copy.
//
// This file also exports helpers the planner uses (see the bottom of the file):
//   const { getPantryNames, ingredientMatches } = require('../pantry/pantry')

const express = require('express')
const axios = require('axios')
const Pantry = require('../../models/Pantry')
const requireAuth = require('../middleware/auth') // same path as Planner.js

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Ingredient names                                                    */
/* ------------------------------------------------------------------ */
// Turns user-typed names into one consistent form, so "Eggs", " egg " and "EGGS" are the same thing.

// very small plural -> singular rule set, for one word
function singular(word) {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y' // berries -> berry
  if (word.endsWith('oes')) return word.slice(0, -2) // tomatoes -> tomato
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1) // eggs -> egg
  return word
}

function normalizeIngredient(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // drop punctuation and numbers
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
}

// True if a pantry name and a recipe ingredient name are the same thing.
// Matches WHOLE WORDS: every word of the shorter name must be in the longer one.
//   "chicken" vs "chicken breast"  -> true
//   "egg"     vs "eggplant"        -> false
//   "salt"    vs "unsalted butter" -> false
function ingredientMatches(pantryName, recipeName) {
  const a = normalizeIngredient(pantryName).split(' ').filter(Boolean)
  const b = normalizeIngredient(recipeName).split(' ').filter(Boolean)
  if (!a.length || !b.length) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerSet = new Set(longer)
  return shorter.every((w) => longerSet.has(w))
}

/* ------------------------------------------------------------------ */
/* Ranking (the "transparent ranking" from Feature 4)                  */
/* ------------------------------------------------------------------ */
// Each recipe gets a 0-100 score AND a breakdown of how it was built, so the page can show
// "Why this score?". Diet and allergens are a hard filter (Spoonacular never returns recipes
// that break them), so they are not part of the score.

const WEIGHTS = {
  coverage: 0.5, // share of the recipe's ingredients you already have
  missing: 0.3, // fewer missing ingredients = better
  time: 0.2, // quicker recipes = better (busy households)
}
const MAX_MISSING_CONSIDERED = 10 // 10+ missing ingredients scores 0 for this part
const MAX_TIME_CONSIDERED = 90 // 90+ minutes scores 0 for this part

const clamp01 = (x) => Math.max(0, Math.min(1, x))

function scoreRecipe(recipe) {
  const used = recipe.usedCount || 0
  const missed = recipe.missedCount || 0
  const total = used + missed

  const coverage = total === 0 ? 0 : used / total
  const missingScore = 1 - clamp01(missed / MAX_MISSING_CONSIDERED)
  const timeScore = recipe.readyInMinutes ? 1 - clamp01(recipe.readyInMinutes / MAX_TIME_CONSIDERED) : 0.5 // unknown -> neutral

  const score = WEIGHTS.coverage * coverage + WEIGHTS.missing * missingScore + WEIGHTS.time * timeScore

  return {
    score: Math.round(score * 100),
    breakdown: {
      coveragePercent: Math.round(coverage * 100),
      missingCount: missed,
      readyInMinutes: recipe.readyInMinutes ?? null,
      points: {
        coverage: Math.round(WEIGHTS.coverage * coverage * 100),
        missing: Math.round(WEIGHTS.missing * missingScore * 100),
        time: Math.round(WEIGHTS.time * timeScore * 100),
      },
    },
  }
}

// Highest score first; ties go to fewer missing, then faster
function rankRecipes(recipes) {
  return recipes
    .map((r) => ({ ...r, ...scoreRecipe(r) }))
    .sort((a, b) =>
      b.score - a.score ||
      a.missedCount - b.missedCount ||
      (a.readyInMinutes ?? 999) - (b.readyInMinutes ?? 999))
}

/* ------------------------------------------------------------------ */
/* Spoonacular                                                         */
/* ------------------------------------------------------------------ */
// One /recipes/complexSearch call searches by pantry ingredients, filters by diet and allergens,
// and returns used/missing ingredient counts + readyInMinutes.
// Docs: https://spoonacular.com/food-api/docs#Search-Recipes-Complex
// Results are cached for 30 minutes because the free plan has a daily quota.

const spoonacular = axios.create({ baseURL: 'https://api.spoonacular.com', timeout: 10000 })

const cache = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000

async function searchByPantry(ingredients, prefs = {}, number = 12) {
  const params = {
    includeIngredients: ingredients.join(','),
    fillIngredients: true,
    addRecipeInformation: true,
    sort: 'max-used-ingredients',
    ignorePantry: true, // don't count water/salt/flour as "missing"
    number,
  }
  if (prefs.diet) params.diet = prefs.diet
  if (prefs.intolerances?.length) params.intolerances = prefs.intolerances.join(',')
  if (prefs.maxReadyTime) params.maxReadyTime = prefs.maxReadyTime

  const key = JSON.stringify(params)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data

  // API key is read here (not at the top) so it works even if dotenv loads after this file
  const { data } = await spoonacular.get('/recipes/complexSearch', {
    params: { ...params, apiKey: process.env.SPOONACULAR_API_KEY },
  })

  // Keep only what the app needs, so the frontend doesn't depend on Spoonacular's format
  const recipes = (data.results || []).map((r) => ({
    spoonacularId: r.id,
    title: r.title,
    image: r.image,
    readyInMinutes: r.readyInMinutes,
    servings: r.servings,
    diets: r.diets || [],
    usedCount: r.usedIngredientCount ?? 0,
    missedCount: r.missedIngredientCount ?? 0,
    usedIngredients: (r.usedIngredients || []).map((i) => i.name),
    missedIngredients: (r.missedIngredients || []).map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      aisle: i.aisle,
    })),
  }))

  cache.set(key, { at: Date.now(), data: recipes })
  return recipes
}

/* ------------------------------------------------------------------ */
/* Route helpers (same pattern as Planner.js)                          */
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
    if (err.name === 'ValidationError') {
      // show the first field's message, e.g. "Quantity cannot be negative"
      const first = Object.values(err.errors)[0]
      return res.status(400).json({ message: first ? first.message : err.message })
    }
    if (err.name === 'CastError') return res.status(404).json({ message: 'Pantry item not found' })
    if (err.code === 11000) return res.status(409).json({ message: 'You already have this ingredient' })
    console.error(err)
    res.status(500).json({ message: 'Something went wrong with your pantry' })
  }
}

// Every pantry route needs a logged-in user (same as the planner).
// requireAuth puts the user on req.user; we copy their id to req.userId.
router.use(requireAuth)
router.use((req, res, next) => {
  req.userId = String(req.user._id)
  next()
})

const EDITABLE = ['name', 'quantity', 'unit', 'category', 'expiryDate']

// The user's whole pantry, sorted for the page
function loadPantry(userId) {
  return Pantry.find({ user: userId }).sort({ category: 1, name: 1 })
}

// Finds one item, making sure it belongs to the logged-in user
async function findUserItem(userId, itemId) {
  const item = await Pantry.findOne({ _id: itemId, user: userId })
  if (!item) throw httpError(404, 'Pantry item not found')
  return item
}

// Normalized names of everything the user has (quantity above 0). Also used by the planner.
async function getPantryNames(userId) {
  const items = await Pantry.find({ user: userId, quantity: { $gt: 0 } }).select('normalizedName').lean()
  return items.map((i) => i.normalizedName)
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// GET /pantry/suggestions?diet=vegetarian&intolerances=peanut,dairy&maxReadyTime=30
// (keep this above the /:itemId routes)
router.get('/suggestions', handle(async (req, res) => {
  const names = await getPantryNames(req.userId)
  if (names.length === 0) {
    return res.json({ recipes: [], pantryCount: 0, message: 'Add some pantry items to get suggestions.' })
  }

  const profile = req.user.preferences || {} // TODO: confirm field names with Pei Jin
  const prefs = {
    diet: req.query.diet || profile.diet,
    intolerances: req.query.intolerances ? req.query.intolerances.split(',') : profile.allergens || [],
    maxReadyTime: req.query.maxReadyTime ? Number(req.query.maxReadyTime) : undefined,
  }

  try {
    const recipes = await searchByPantry(names, prefs)
    res.json({ recipes: rankRecipes(recipes), pantryCount: names.length, appliedPreferences: prefs })
  } catch (err) {
    // Spoonacular sends 402 when the daily quota is used up
    if (err.response?.status === 402) throw httpError(503, 'Recipe service quota reached. Try again tomorrow.')
    throw err
  }
}))

// GET /pantry
router.get('/', handle(async (req, res) => {
  res.json({ items: await loadPantry(req.userId) })
}))

// POST /pantry
// body: { name, quantity, unit, category, expiryDate? }
router.post('/', handle(async (req, res) => {
  const { name } = req.body
  if (!name || !String(name).trim()) throw httpError(400, 'Ingredient name is required')
  const normalizedName = normalizeIngredient(name)

  const existing = await Pantry.findOne({ user: req.userId, normalizedName })

  if (existing) {
    // Already in the pantry -> add to the quantity instead of making a duplicate
    // TODO: if units differ (e.g. g vs kg) convert before adding
    existing.quantity += Number(req.body.quantity ?? 1)
    if (req.body.expiryDate) existing.expiryDate = req.body.expiryDate
    await existing.save()
    return res.json({ items: await loadPantry(req.userId) })
  }

  const data = { user: req.userId, normalizedName }
  EDITABLE.forEach((f) => {
    if (req.body[f] !== undefined && req.body[f] !== '') data[f] = req.body[f]
  })
  await Pantry.create(data) // runs schema validation

  res.status(201).json({ items: await loadPantry(req.userId) })
}))

// PATCH /pantry/:itemId
// body can contain any of: { name, quantity, unit, category, expiryDate }
router.patch('/:itemId', handle(async (req, res) => {
  const item = await findUserItem(req.userId, req.params.itemId)
  EDITABLE.forEach((f) => {
    if (req.body[f] !== undefined) item[f] = req.body[f]
  })
  if (req.body.name !== undefined) item.normalizedName = normalizeIngredient(req.body.name)
  await item.save() // runs validation
  res.json({ items: await loadPantry(req.userId) })
}))

// DELETE /pantry/:itemId
router.delete('/:itemId', handle(async (req, res) => {
  const item = await findUserItem(req.userId, req.params.itemId)
  await item.deleteOne()
  res.json({ items: await loadPantry(req.userId) })
}))

module.exports = router

// Helpers for the planner and for unit tests
module.exports.getPantryNames = getPantryNames
module.exports.ingredientMatches = ingredientMatches
module.exports.normalizeIngredient = normalizeIngredient
module.exports.scoreRecipe = scoreRecipe
module.exports.rankRecipes = rankRecipes