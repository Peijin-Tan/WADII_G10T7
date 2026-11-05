// Pantry API, mounted in server/index.js as app.use('/pantry', pantryRouter)
//
//   GET    /pantry                  -> the logged-in user's pantry
//   GET    /pantry/suggestions      -> ranked recipes for what's in the pantry
//   POST   /pantry                  -> add an ingredient (adds to the quantity if it's already there)
//   PATCH  /pantry/:itemId          -> change name, quantity, unit, category or expiry date
//   DELETE /pantry/:itemId          -> remove an ingredient
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
// Reads the same 'pantries' collection as models/Pantry.js, but accepts older documents whose "user" is a string.
// strictQuery: false is needed: index.js turns strictQuery on for every model, and with an empty schema that makes
// Mongoose silently DROP "user" / "normalizedName" from every filter, so a query would return everyone's pantry.
const PantryLegacy = mongoose.models.PantryLegacy || mongoose.model('PantryLegacy', new mongoose.Schema({}, { strict: false, strictQuery: false, collection: 'pantries' }), 'pantries')
const requireAuth = require('../middleware/auth') // same path as Planner.js

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Ingredient names + units                                            */
/* ------------------------------------------------------------------ */
// normalizeIngredient: "Eggs", " egg " and "EGGS" all become "egg".
// ingredientMatches:   whole-word match, "chicken" matches "chicken breast" but "egg" doesn't match "eggplant".
// Both live in services/ingredientnames.js so the planner and shopping list use exactly the same rule.
const { normalizeIngredient, ingredientMatches } = require('../services/ingredientnames')
const { convertAmount, toPantryUnit, isSpoonUnit } = require('../services/units')
const UserPreference = require('../../models/UserPreference')

/* ------------------------------------------------------------------ */
/* Saved dietary preferences -> Spoonacular filters                    */
/* ------------------------------------------------------------------ */
// The Dietary Preferences page saves labels like "Pescatarian" or "Tree Nuts",
// but Spoonacular only understands its own words, so translate them here.
// Docs: https://spoonacular.com/food-api/docs#Diets and #Intolerances
const DIET_TO_SPOONACULAR = {
  vegetarian: { diet: 'vegetarian' },
  vegan: { diet: 'vegan' },
  'gluten-free': { diet: 'gluten free' },
  pescatarian: { diet: 'pescetarian' }, // Spoonacular spells it with an "e"
  keto: { diet: 'ketogenic' },
  'dairy-free': { intolerance: 'dairy' }, // Spoonacular treats dairy-free as an intolerance, not a diet
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

// Returns { diets: ['vegetarian'], intolerances: ['peanut', 'dairy'] } for the logged-in user
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

// Shared error helpers (utils/http.js). A bad item id is a CastError -> 404.
const { httpError, makeHandler } = require('../utils/http')
const handle = makeHandler({
  fallback: 'Something went wrong with your pantry',
  castError: { status: 404, message: 'Pantry item not found' },
  duplicate: 'You already have this ingredient',
})

// Every pantry route needs a logged-in user (same as the planner).
// requireAuth puts the user on req.user; we copy their id to req.userId.
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

// The user's whole pantry, sorted for the page.
// Rows saved before the pantry stopped storing spoon / cup measures ("3 cup jasmine rice")
// are converted to g or ml the first time the pantry is loaded, so old data gets fixed too.
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

// Finds one item, making sure it belongs to the logged-in user
async function findUserItem(userId, itemId) {
  const item = await PantryLegacy.findOne({ _id: itemId, ...pantryUserQuery(userId) })
  if (!item) throw httpError(404, 'Pantry item not found')
  return item
}

// Normalized names of everything the user has (quantity above 0). Also used by the planner.
async function getPantryNames(userId) {
  const items = await PantryLegacy.find({ ...pantryUserQuery(userId), quantity: { $gt: 0 } }).select('normalizedName').lean()
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

  // Saved preferences come from Pei Jin's UserPreference collection (the Dietary Preferences page).
  // - diet: a diet picked in the modal replaces the saved ones ("My profile" sends no diet, so the saved ones apply)
  // - intolerances: the saved allergens ALWAYS apply, plus any extra ones picked in the modal,
  //   so someone with a peanut allergy never sees peanut recipes just because they clicked "dairy"
  const profile = await getSavedPreferences(req.userId)
  const picked = req.query.intolerances ? req.query.intolerances.split(',').map((s) => s.trim()).filter(Boolean) : []
  const prefs = {
    diet: req.query.diet || profile.diets.join(',') || undefined, // comma = recipe must fit ALL of them
    intolerances: [...new Set([...profile.intolerances, ...picked])],
    maxReadyTime: req.query.maxReadyTime ? Number(req.query.maxReadyTime) : undefined,
  }

  try {
    const recipes = await searchByPantry(names, prefs)
    res.json({ recipes: rankRecipes(recipes), pantryCount: names.length, appliedPreferences: prefs })
  } catch (err) {
    // Spoonacular sends 402 when the daily quota is used up
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

// Neighbour Pantry routes (/pantry/neighbours..., /pantry/friends..., /pantry/requests...)
// live in pantrysharing.js. Mounted here, before the /:itemId routes below.
router.use(require('./pantrysharing')({ PantryLegacy, pantryUserQuery, handle }))

// POST /pantry
// body: { name, quantity, unit, category, expiryDate? }
router.post('/', handle(async (req, res) => {
  const { name } = req.body
  if (!name || !String(name).trim()) throw httpError(400, 'Ingredient name is required')
  const normalizedName = normalizeIngredient(name)
  const typedQuantity = Number(req.body.quantity ?? 1)
  if (!Number.isFinite(typedQuantity) || typedQuantity <= 0) throw httpError(400, 'Quantity must be more than 0')
  if (req.body.unit && !Pantry.UNITS.includes(req.body.unit)) throw httpError(400, `Unit must be one of: ${Pantry.UNITS.join(', ')}`)
  // tsp / tbsp / cup are stored as g or ml: "2 cup rice" is saved as 370 g, "2 tbsp soy sauce" as 30 ml
  const { quantity, unit: typedUnit } = req.body.unit ? toPantryUnit(typedQuantity, req.body.unit, name) : { quantity: typedQuantity, unit: undefined }
  if (req.body.expiryDate && Number.isNaN(new Date(req.body.expiryDate).getTime())) {
    throw httpError(400, 'Use-by date must be a valid date')
  }

  const existing = await PantryLegacy.findOne({ ...pantryUserQuery(req.userId), normalizedName })

  if (existing) {
    // Already in the pantry -> add to the quantity instead of making a duplicate.
    // Convert to the unit the pantry already uses first, so 500 g added to "1 kg rice" gives 1.5 kg (not 501 kg).
    const unit = typedUnit || existing.unit
    const added = convertAmount(quantity, unit, existing.unit, name)
    if (added === null) {
      throw httpError(409, `You already have ${existing.name} in ${existing.unit}. Add it in a matching unit, or edit the item instead.`)
    }
    // .set() (not existing.quantity = ...): PantryLegacy has an empty schema, so plain assignment isn't saved
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
  await Pantry.create(data) // runs schema validation

  res.status(201).json({ items: await loadPantry(req.userId) })
}))

// Checks the fields the edit form sends, so an emptied box can't save "null pcs".
// Returns the cleaned values to copy onto the item.
function checkEdits(body) {
  const edits = {}
  EDITABLE.forEach((f) => {
    if (body[f] !== undefined) edits[f] = body[f]
  })
  if (edits.name !== undefined && !String(edits.name).trim()) throw httpError(400, 'Ingredient name is required')
  if (edits.name !== undefined) edits.name = String(edits.name).trim() // "  Eggs  " -> "Eggs"
  if (edits.quantity !== undefined) {
    const quantity = edits.quantity === '' || edits.quantity === null ? NaN : Number(edits.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) throw httpError(400, 'Quantity must be 0 or more')
    edits.quantity = quantity
  }
  // Saved through PantryLegacy (no schema), so check these here instead of relying on models/Pantry.js
  if (edits.unit !== undefined && !Pantry.UNITS.includes(edits.unit)) throw httpError(400, `Unit must be one of: ${Pantry.UNITS.join(', ')}`)
  if (edits.category !== undefined && !Pantry.CATEGORIES.includes(edits.category)) throw httpError(400, 'Choose a category from the list')
  if (edits.expiryDate === '') edits.expiryDate = null // empty date box = no use-by date
  if (edits.expiryDate && Number.isNaN(new Date(edits.expiryDate).getTime())) {
    throw httpError(400, 'Use-by date must be a valid date')
  }
  return edits
}

// PATCH /pantry/:itemId
// body can contain any of: { name, quantity, unit, category, expiryDate }
router.patch('/:itemId', handle(async (req, res) => {
  const item = await findUserItem(req.userId, req.params.itemId)
  const edits = checkEdits(req.body)
  if (edits.name !== undefined) {
    // renaming onto another item ("Garlic" -> "Milk" when Milk exists): say which one, instead of a vague 409
    const clash = await PantryLegacy.findOne({ ...pantryUserQuery(req.userId), normalizedName: normalizeIngredient(edits.name), _id: { $ne: item._id } })
    if (clash) throw httpError(409, `${clash.name} is already in your pantry. Edit that item instead, or pick another name.`)
  }
  // Switched to a spoon / cup measure: store it as g or ml instead (1 cup rice -> 185 g)
  const unit = edits.unit ?? item.get('unit')
  if (isSpoonUnit(unit)) {
    const stored = toPantryUnit(edits.quantity ?? Number(item.get('quantity')) ?? 0, unit, edits.name ?? item.get('name'))
    edits.quantity = stored.quantity
    edits.unit = stored.unit
  }
  // .set() (not Object.assign): PantryLegacy has an empty schema, so plain assignment isn't saved
  item.set(edits)
  if (req.body.name !== undefined) item.set('normalizedName', normalizeIngredient(req.body.name))
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
module.exports.getSavedPreferences = getSavedPreferences
module.exports.checkEdits = checkEdits
