// Pantry API, mounted in server/index.js as app.use('/pantry', pantryRouter)
//
//   GET    /pantry
//   GET    /pantry/suggestions
//   POST   /pantry
//   PATCH  /pantry/:itemId
//   DELETE /pantry/:itemId
//   Neighbour Pantry (sharing + borrowing): see pantrysharing.js
//
// Every write returns the whole updated pantry as { items }, so the frontend just replaces its copy.
//
// This file also exports helpers the planner uses (see the bottom of the file):
//   const { getPantryNames } = require('./pantry')

const express = require('express')
const mongoose = require('mongoose')
const axios = require('axios')
const Pantry = require('../../models/Pantry')
const PantryLegacy = mongoose.models.PantryLegacy || mongoose.model('PantryLegacy', new mongoose.Schema({}, { strict: false, strictQuery: false, collection: 'pantries' }), 'pantries')
const requireAuth = require('../middleware/auth')

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Ingredient names + units                                            */
/* ------------------------------------------------------------------ */
const { normalizeIngredient, ingredientMatches } = require('../services/ingredientnames')
const { convertAmount, toPantryUnit, isSpoonUnit } = require('../services/units')
const UserPreference = require('../../models/UserPreference')

/* ------------------------------------------------------------------ */
/* Saved dietary preferences -> Spoonacular filters                    */
/* ------------------------------------------------------------------ */
const DIET_TO_SPOONACULAR = {
  vegetarian: { diet: 'vegetarian' },
  vegan: { diet: 'vegan' },
  'gluten-free': { diet: 'gluten free' },
  pescatarian: { diet: 'pescetarian' },
  keto: { diet: 'ketogenic' },
  'dairy-free': { intolerance: 'dairy' },
}
const ALLERGEN_TO_SPOONACULAR = {
  peanuts: 'peanut',
  'tree nuts': 'tree nut',
  milk: 'dairy',
  eggs: 'egg',
  soy: 'soy',
  wheat: 'wheat',
  fish: 'seafood',
  shellfish: 'shellfish',
  sesame: 'sesame',
}

async function getSavedPreferences(userId) {
  const saved = await UserPreference.findOne({ userId }).lean()
  const diets = []
  const intolerances = []
  for (const label of saved?.dietaryPreferences || []) {
    const mapped = DIET_TO_SPOONACULAR[label.toLowerCase()]
    if (mapped?.diet) diets.push(mapped.diet)
    if (mapped?.intolerance) intolerances.push(mapped.intolerance)
  }
  for (const label of saved?.allergens || []) {
    const mapped = ALLERGEN_TO_SPOONACULAR[label.toLowerCase()]
    if (mapped) intolerances.push(mapped)
  }
  return { diets, intolerances }
}

/* ------------------------------------------------------------------ */
/* Ranking (the "transparent ranking" from Feature 4)                  */
/* ------------------------------------------------------------------ */

const WEIGHTS = {
  coverage: 0.5,
  missing: 0.3,
  time: 0.2,
}
const MAX_MISSING_CONSIDERED = 10
const MAX_TIME_CONSIDERED = 90

const clamp01 = (x) => Math.max(0, Math.min(1, x))

function scoreRecipe(recipe) {
  const used = recipe.usedCount || 0
  const missed = recipe.missedCount || 0
  const total = used + missed

  const coverage = total === 0 ? 0 : used / total
  const missingScore = 1 - clamp01(missed / MAX_MISSING_CONSIDERED)
  const timeScore = recipe.readyInMinutes ? 1 - clamp01(recipe.readyInMinutes / MAX_TIME_CONSIDERED) : 0.5

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

const spoonacular = axios.create({ baseURL: 'https://api.spoonacular.com', timeout: 10000 })

const cache = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000

async function searchByPantry(ingredients, prefs = {}, number = 12) {
  const params = {
    includeIngredients: ingredients.join(','),
    fillIngredients: true,
    addRecipeInformation: true,
    sort: 'max-used-ingredients',
    ignorePantry: true,
    number,
  }
  if (prefs.diet) params.diet = prefs.diet
  if (prefs.intolerances?.length) params.intolerances = prefs.intolerances.join(',')
  if (prefs.maxReadyTime) params.maxReadyTime = prefs.maxReadyTime

  const key = JSON.stringify(params)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data

  const { data } = await spoonacular.get('/recipes/complexSearch', {
    params: { ...params, apiKey: process.env.SPOONACULAR_API_KEY },
  })

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

const { httpError, makeHandler } = require('../utils/http')
const handle = makeHandler({
  fallback: 'Something went wrong with your pantry',
  castError: { status: 404, message: 'Pantry item not found' },
  duplicate: 'You already have this ingredient',
})

router.use(requireAuth)
router.use((req, res, next) => {
  req.userId = String(req.user._id)
  next()
})

const EDITABLE = ['name', 'quantity', 'unit', 'category', 'expiryDate']

function pantryUserQuery(userId) {
  const value = String(userId || '')
  const values = [value]
  if (mongoose.isValidObjectId(value)) values.push(new mongoose.Types.ObjectId(value))

  return { user: { $in: values } }
}

async function loadPantry(userId) {
  const items = await PantryLegacy.find(pantryUserQuery(userId)).sort({ category: 1, name: 1 })
  const old = items.filter((item) => isSpoonUnit(item.get('unit')))
  for (const item of old) {
    const stored = toPantryUnit(Number(item.get('quantity')) || 0, item.get('unit'), item.get('name'))
    item.set({ quantity: stored.quantity, unit: stored.unit })
    await item.save()
  }
  return items
}

async function findUserItem(userId, itemId) {
  const item = await PantryLegacy.findOne({ _id: itemId, ...pantryUserQuery(userId) })
  if (!item) throw httpError(404, 'Pantry item not found')
  return item
}

async function getPantryNames(userId) {
  const items = await PantryLegacy.find({ ...pantryUserQuery(userId), quantity: { $gt: 0 } }).select('normalizedName').lean()
  return items.map((i) => i.normalizedName)
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// GET /pantry/suggestions
router.get('/suggestions', handle(async (req, res) => {
  const names = await getPantryNames(req.userId)
  if (names.length === 0) {
    return res.json({ recipes: [], pantryCount: 0, message: 'Add some pantry items to get suggestions.' })
  }

  const profile = await getSavedPreferences(req.userId)
  const picked = req.query.intolerances ? req.query.intolerances.split(',').map((s) => s.trim()).filter(Boolean) : []
  const prefs = {
    diet: req.query.diet || profile.diets.join(',') || undefined,
    intolerances: [...new Set([...profile.intolerances, ...picked])],
    maxReadyTime: req.query.maxReadyTime ? Number(req.query.maxReadyTime) : undefined,
  }

  try {
    const recipes = await searchByPantry(names, prefs)
    res.json({ recipes: rankRecipes(recipes), pantryCount: names.length, appliedPreferences: prefs })
  } catch (err) {
    if (err.response?.status === 402) throw httpError(503, 'Recipe service quota reached. Try again tomorrow.')
    if (err.response || err.code === 'ECONNABORTED') {
      console.error('Spoonacular suggestions failed:', err.message)
      throw httpError(502, 'Could not reach the recipe service. Please try again later.')
    }
    throw err
  }
}))

// GET /pantry
router.get('/', handle(async (req, res) => {
  res.json({ items: await loadPantry(req.userId) })
}))

router.use(require('./pantrysharing')({ PantryLegacy, pantryUserQuery, handle }))

// POST /pantry
router.post('/', handle(async (req, res) => {
  const { name } = req.body
  if (!name || !String(name).trim()) throw httpError(400, 'Ingredient name is required')
  const normalizedName = normalizeIngredient(name)
  const typedQuantity = Number(req.body.quantity ?? 1)
  if (!Number.isFinite(typedQuantity) || typedQuantity <= 0) throw httpError(400, 'Quantity must be more than 0')
  if (req.body.unit && !Pantry.UNITS.includes(req.body.unit)) throw httpError(400, `Unit must be one of: ${Pantry.UNITS.join(', ')}`)
  const { quantity, unit: typedUnit } = req.body.unit ? toPantryUnit(typedQuantity, req.body.unit, name) : { quantity: typedQuantity, unit: undefined }
  if (req.body.expiryDate && Number.isNaN(new Date(req.body.expiryDate).getTime())) {
    throw httpError(400, 'Use-by date must be a valid date')
  }

  const existing = await PantryLegacy.findOne({ ...pantryUserQuery(req.userId), normalizedName })

  if (existing) {
    const unit = typedUnit || existing.unit
    const added = convertAmount(quantity, unit, existing.unit, name)
    if (added === null) {
      throw httpError(409, `You already have ${existing.name} in ${existing.unit}. Add it in a matching unit, or edit the item instead.`)
    }
    existing.set('quantity', Math.round((existing.quantity + added) * 1000) / 1000)
    if (req.body.expiryDate) existing.set('expiryDate', req.body.expiryDate)
    await existing.save()
    return res.json({ items: await loadPantry(req.userId) })
  }

  const data = { user: req.userId, normalizedName }
  EDITABLE.forEach((f) => {
    if (req.body[f] !== undefined && req.body[f] !== '') data[f] = req.body[f]
  })
  data.name = String(name).trim()
  data.quantity = quantity
  if (typedUnit) data.unit = typedUnit
  await Pantry.create(data)

  res.status(201).json({ items: await loadPantry(req.userId) })
}))

function checkEdits(body) {
  const edits = {}
  EDITABLE.forEach((f) => {
    if (body[f] !== undefined) edits[f] = body[f]
  })
  if (edits.name !== undefined && !String(edits.name).trim()) throw httpError(400, 'Ingredient name is required')
  if (edits.name !== undefined) edits.name = String(edits.name).trim()
  if (edits.quantity !== undefined) {
    const quantity = edits.quantity === '' || edits.quantity === null ? NaN : Number(edits.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) throw httpError(400, 'Quantity must be 0 or more')
    edits.quantity = quantity
  }
  if (edits.unit !== undefined && !Pantry.UNITS.includes(edits.unit)) throw httpError(400, `Unit must be one of: ${Pantry.UNITS.join(', ')}`)
  if (edits.category !== undefined && !Pantry.CATEGORIES.includes(edits.category)) throw httpError(400, 'Choose a category from the list')
  if (edits.expiryDate === '') edits.expiryDate = null
  if (edits.expiryDate && Number.isNaN(new Date(edits.expiryDate).getTime())) {
    throw httpError(400, 'Use-by date must be a valid date')
  }
  return edits
}

// PATCH /pantry/:itemId
router.patch('/:itemId', handle(async (req, res) => {
  const item = await findUserItem(req.userId, req.params.itemId)
  const edits = checkEdits(req.body)
  if (edits.name !== undefined) {
    const clash = await PantryLegacy.findOne({ ...pantryUserQuery(req.userId), normalizedName: normalizeIngredient(edits.name), _id: { $ne: item._id } })
    if (clash) throw httpError(409, `${clash.name} is already in your pantry. Edit that item instead, or pick another name.`)
  }
  const unit = edits.unit ?? item.get('unit')
  if (isSpoonUnit(unit)) {
    const stored = toPantryUnit(edits.quantity ?? Number(item.get('quantity')) ?? 0, unit, edits.name ?? item.get('name'))
    edits.quantity = stored.quantity
    edits.unit = stored.unit
  }
  item.set(edits)
  if (req.body.name !== undefined) item.set('normalizedName', normalizeIngredient(req.body.name))
  await item.save()
  res.json({ items: await loadPantry(req.userId) })
}))

// DELETE /pantry/:itemId
router.delete('/:itemId', handle(async (req, res) => {
  const item = await findUserItem(req.userId, req.params.itemId)
  await item.deleteOne()
  res.json({ items: await loadPantry(req.userId) })
}))

module.exports = router

module.exports.getPantryNames = getPantryNames
module.exports.ingredientMatches = ingredientMatches
module.exports.normalizeIngredient = normalizeIngredient
module.exports.scoreRecipe = scoreRecipe
module.exports.rankRecipes = rankRecipes
module.exports.getSavedPreferences = getSavedPreferences
module.exports.checkEdits = checkEdits
