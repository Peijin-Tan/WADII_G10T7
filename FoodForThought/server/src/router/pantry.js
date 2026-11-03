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
const mongoose = require('mongoose')
const Pantry = require('../../models/Pantry')
const User = require('../../models/User')
const PantryShare = require('../../models/PantryShare')
const PantryRequest = require('../../models/PantryRequest')
const requireAuth = require('../middleware/auth') // same path as Planner.js

const router = express.Router()

/* ------------------------------------------------------------------ */
/* Ingredient names + units                                            */
/* ------------------------------------------------------------------ */
// normalizeIngredient: "Eggs", " egg " and "EGGS" all become "egg".
// ingredientMatches:   whole-word match, "chicken" matches "chicken breast" but "egg" doesn't match "eggplant".
// Both live in services/ingredientnames.js so the planner and shopping list use exactly the same rule.
const { normalizeIngredient, ingredientMatches } = require('../services/ingredientnames')
const { convertAmount } = require('../services/units')
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
    throw err
  }
}))

// GET /pantry
router.get('/', handle(async (req, res) => {
  res.json({ items: await loadPantry(req.userId) })
}))

// GET /pantry/requests
router.get('/requests', handle(async (req, res) => {
  const incoming = await PantryRequest.find({ owner: req.userId, status: { $in: ['pending', 'approved', 'completed'] } })
    .populate('requester', '_id name email')
    .sort({ createdAt: -1 })
    .lean()

  const outgoing = await PantryRequest.find({ requester: req.userId, status: { $in: ['pending', 'approved', 'completed'] } })
    .populate('owner', '_id name email')
    .sort({ createdAt: -1 })
    .lean()

  res.json({ requests: incoming, incomingRequests: incoming, outgoingRequests: outgoing, outgoing })
}))

// PATCH /pantry/requests/:requestId
router.patch('/requests/:requestId', handle(async (req, res) => {
  const { status } = req.body || {}
  if (!['approved', 'rejected', 'cancelled', 'completed'].includes(status)) {
    throw httpError(400, 'Status must be approved, rejected, cancelled, or completed.')
  }

  const request = await PantryRequest.findById(req.params.requestId)
  if (!request) throw httpError(404, 'Request not found')

  const userIsOwner = String(request.owner) === req.userId
  const userIsRequester = String(request.requester) === req.userId

  if (!userIsOwner && !userIsRequester) {
    throw httpError(403, 'You do not have access to this request.')
  }

  if (status === 'approved') {
    if (!userIsOwner) throw httpError(403, 'Only the owner can approve a request.')
    if (request.status !== 'pending') throw httpError(409, 'This request has already been resolved.')

    request.status = 'approved'
    request.approvedAt = new Date()
    await request.save()

    return res.json({ message: 'Request approved. Collection can now be confirmed.', request })
  }

  if (status === 'rejected') {
    if (!userIsOwner) throw httpError(403, 'Only the owner can reject a request.')
    if (request.status !== 'pending') throw httpError(409, 'This request has already been resolved.')

    request.status = 'rejected'
    await request.save()
    return res.json({ message: 'Request rejected.', request })
  }

  if (status === 'cancelled') {
    if (!userIsRequester) throw httpError(403, 'Only the requester can cancel a request.')
    if (!['pending', 'approved'].includes(request.status)) throw httpError(409, 'This request cannot be cancelled.')

    request.status = 'cancelled'
    request.cancelledAt = new Date()
    await request.save()
    return res.json({ message: 'Request cancelled.', request })
  }

  if (status === 'completed') {
    if (!['approved', 'pending'].includes(request.status)) {
      throw httpError(409, 'Only approved requests can be completed.')
    }

    if (request.status === 'pending') {
      request.status = 'approved'
      request.approvedAt = new Date()
      await request.save()
    }

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const approvedRequest = await PantryRequest.findOne({ _id: request._id, status: 'approved' }).session(session)
        if (!approvedRequest) {
          throw httpError(409, 'This request is no longer approved for collection.')
        }

        for (const item of approvedRequest.items || []) {
          const requestedQty = Number(item.quantity || 1)
          if (!item?.itemId || !Number.isFinite(requestedQty) || requestedQty <= 0) continue

          const ownerItem = await Pantry.findOne({ _id: item.itemId, user: approvedRequest.owner }).session(session)
          if (!ownerItem) throw httpError(404, `${item.name} is no longer in the owner pantry.`)
          if (ownerItem.quantity < requestedQty) throw httpError(409, `Not enough ${item.name} left to complete this exchange.`)

          ownerItem.quantity = Number((ownerItem.quantity - requestedQty).toFixed(3))
          if (ownerItem.quantity <= 0) ownerItem.quantity = 0
          await ownerItem.save({ session })

          const normalized = normalizeIngredient(item.name)
          let recipientItem = await Pantry.findOne({ user: approvedRequest.requester, normalizedName: normalized }).session(session)
          if (recipientItem) {
            recipientItem.quantity = Number((recipientItem.quantity + requestedQty).toFixed(3))
            if (item.unit) recipientItem.unit = item.unit
            await recipientItem.save({ session })
          } else {
            recipientItem = new Pantry({
              user: approvedRequest.requester,
              name: item.name,
              normalizedName: normalized,
              quantity: requestedQty,
              unit: item.unit || 'pcs',
              category: 'other',
            })
            await recipientItem.save({ session })
          }
        }

        approvedRequest.status = 'completed'
        approvedRequest.collected = true
        approvedRequest.completedAt = new Date()
        approvedRequest.repaymentOutstanding = approvedRequest.requestType === 'borrow'
        await approvedRequest.save({ session })
      })
    } finally {
      await session.endSession()
    }

    return res.json({ message: 'Exchange completed and inventory transferred.', request: await PantryRequest.findById(req.params.requestId).lean() })
  }
}))

// GET /pantry/neighbours
router.get('/neighbours', handle(async (req, res) => {
  const users = await User.find({ _id: { $ne: req.userId }, role: { $ne: 'admin' } })
    .select('_id name email')
    .sort({ name: 1 })
    .lean()

  const shares = await PantryShare.find({
    $or: [
      { owner: req.userId },
      { friend: req.userId },
    ],
    status: { $in: ['active', 'pending'] },
  }).populate('owner friend', '_id name email').lean()

  const friends = []
  const friendsMap = new Map()
  const pendingIncoming = []
  const pendingOutgoing = []

  for (const share of shares) {
    const ownerId = String(share.owner?._id || share.owner)
    const friendId = String(share.friend?._id || share.friend)
    const isOwner = ownerId === req.userId
    const userId = isOwner ? friendId : ownerId

    if (userId === req.userId) continue

    if (share.status === 'pending') {
      if (isOwner) {
        pendingOutgoing.push({ _id: userId, name: share.friend?.name || 'Friend', email: share.friend?.email || '' })
      } else {
        pendingIncoming.push({ _id: userId, name: share.owner?.name || 'Friend', email: share.owner?.email || '' })
      }
      continue
    }

    const existing = friendsMap.get(userId) || {
      _id: userId,
      name: null,
      email: null,
      canView: share.canView,
      canBuy: share.canBuy,
      canBorrow: share.canBorrow,
      canTakeover: share.canTakeover,
      status: share.status,
    }

    if (isOwner) {
      existing.name = share.friend?.name || existing.name
      existing.email = share.friend?.email || existing.email
    } else {
      existing.name = share.owner?.name || existing.name
      existing.email = share.owner?.email || existing.email
    }

    existing.canView = existing.canView || share.canView
    existing.canBuy = existing.canBuy || share.canBuy
    existing.canBorrow = existing.canBorrow || share.canBorrow
    existing.canTakeover = existing.canTakeover || share.canTakeover

    friendsMap.set(userId, existing)
  }

  for (const friend of friendsMap.values()) {
    friends.push(friend)
  }

  const friendIds = new Set(friends.map((friend) => String(friend._id)))
  const pendingIds = new Set([...pendingIncoming.map((friend) => String(friend._id)), ...pendingOutgoing.map((friend) => String(friend._id))])
  const availableUsers = users.filter((user) => !friendIds.has(String(user._id)) && !pendingIds.has(String(user._id)))

  res.json({ friends, availableUsers, pendingIncoming, pendingOutgoing, friendRequests: pendingIncoming })
}))

// POST /pantry/friends/:friendId
router.post('/friends/:friendId', handle(async (req, res) => {
  const friendId = req.params.friendId
  if (!friendId || friendId === req.userId) {
    throw httpError(400, 'Choose another user to share your pantry with.')
  }

  const friend = await User.findById(friendId).select('_id name email')
  if (!friend) throw httpError(404, 'Neighbour not found')

  const existing = await PantryShare.findOne({
    $or: [
      { owner: req.userId, friend: friendId },
      { owner: friendId, friend: req.userId },
    ],
  })

  if (existing) {
    if (existing.status === 'active') {
      throw httpError(409, 'You are already connected with this user.')
    }
    if (existing.status === 'pending' && String(existing.friend) === String(req.userId)) {
      existing.status = 'active'
      existing.canView = true
      existing.canBorrow = true
      existing.canBuy = true
      existing.requestedBy = req.userId
      await existing.save()
      return res.status(200).json({ message: `${friend.name} is now on your neighbour list.` })
    }
    if (existing.status === 'pending' && String(existing.owner) === String(req.userId)) {
      throw httpError(409, 'You already sent a friend request to this user.')
    }
  }

  await PantryShare.findOneAndUpdate(
    { owner: req.userId, friend: friendId },
    {
      $set: {
        owner: req.userId,
        friend: friendId,
        requestedBy: req.userId,
        status: 'pending',
        canView: true,
        canBuy: true,
        canBorrow: true,
        canTakeover: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  res.status(201).json({
    message: `Friend request sent to ${friend.name}.`,
  })
}))

// PATCH /pantry/friends/:friendId
router.patch('/friends/:friendId', handle(async (req, res) => {
  const { decision } = req.body || {}
  if (!['accept', 'reject'].includes(decision)) {
    throw httpError(400, 'Decision must be accept or reject.')
  }

  const share = await PantryShare.findOne({ owner: req.params.friendId, friend: req.userId, status: 'pending' })
  if (!share) throw httpError(404, 'No pending friend request found.')

  if (decision === 'accept') {
    share.status = 'active'
    share.canView = true
    share.canBuy = true
    share.canBorrow = true
    share.canTakeover = false
    await share.save()
    return res.json({ message: 'Friend request accepted.' })
  }

  share.status = 'rejected'
  await share.save()
  return res.json({ message: 'Friend request rejected.' })
}))

// GET /pantry/neighbours/:friendId
router.get('/neighbours/:friendId', handle(async (req, res) => {
  const friendId = req.params.friendId
  const share = await PantryShare.findOne({
    status: 'active',
    $or: [
      { owner: req.userId, friend: friendId },
      { owner: friendId, friend: req.userId },
    ],
  }).lean()

  if (!share || !share.canView) {
    throw httpError(403, 'This neighbour has not shared their pantry with you.')
  }

  const friend = await User.findById(friendId).select('_id name email').lean()
  if (!friend) throw httpError(404, 'Neighbour not found')

  const items = await Pantry.find({ user: friendId }).sort({ category: 1, name: 1 }).lean()

  res.json({
    friend,
    access: {
      canView: share.canView,
      canBuy: share.canBuy,
      canBorrow: share.canBorrow,
      canTakeover: share.canTakeover,
    },
    items,
  })
}))

// POST /pantry/requests
router.post('/requests', handle(async (req, res) => {
  const { friendId, requestType, message, items } = req.body || {}

  if (!friendId || !requestType) {
    throw httpError(400, 'Neighbour and request type are required.')
  }

  if (friendId === req.userId) {
    throw httpError(400, 'You cannot request ingredients from yourself.')
  }

  if (!['borrow', 'takeover'].includes(requestType)) {
    throw httpError(400, 'Request type must be borrow or takeover.')
  }

  const selectedItems = Array.isArray(items) ? items : []
  if (selectedItems.length === 0) {
    throw httpError(400, 'Please select at least one item to request.')
  }

  const share = await PantryShare.findOne({
    status: 'active',
    $or: [
      { owner: req.userId, friend: friendId },
      { owner: friendId, friend: req.userId },
    ],
  })

  if (!share) {
    throw httpError(403, 'You need an active neighbour connection before making a pantry request.')
  }

  if (requestType === 'borrow' && !share.canBorrow) {
    throw httpError(403, 'This neighbour has disabled borrow requests.')
  }

  if (requestType === 'takeover' && !share.canTakeover) {
    throw httpError(403, 'This neighbour has disabled takeover requests.')
  }

  const payloadItems = []
  for (const item of selectedItems) {
    const itemId = item.itemId || item._id || item.id
    const name = String(item.name || '').trim()
    const quantity = Number(item.quantity || 1)
    if (!itemId || !name) continue
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError(400, `Quantity for ${name || 'item'} must be greater than zero.`)
    }

    const pantryItem = await Pantry.findOne({ user: friendId, _id: itemId })
    if (!pantryItem) throw httpError(404, `${name} is no longer available in this pantry.`)
    if (pantryItem.quantity < quantity) {
      throw httpError(409, `Only ${pantryItem.quantity} ${pantryItem.unit} of ${name} is currently available.`)
    }

    payloadItems.push({
      itemId: String(itemId),
      name,
      quantity,
      unit: item.unit || pantryItem.unit || 'pcs',
    })
  }

  if (payloadItems.length === 0) {
    throw httpError(400, 'Please select valid pantry items to request.')
  }

  const request = await PantryRequest.create({
    requester: req.userId,
    owner: friendId,
    requestType,
    items: payloadItems,
    message: String(message || '').trim().slice(0, 500),
    status: 'pending',
  })

  res.status(201).json({
    message: `Your ${requestType} request has been sent.`,
    request,
  })
}))

// POST /pantry
// body: { name, quantity, unit, category, expiryDate? }
router.post('/', handle(async (req, res) => {
  const { name } = req.body
  if (!name || !String(name).trim()) throw httpError(400, 'Ingredient name is required')
  const normalizedName = normalizeIngredient(name)
  const quantity = Number(req.body.quantity ?? 1)
  if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(400, 'Quantity must be more than 0')

  const existing = await Pantry.findOne({ user: req.userId, normalizedName })

  if (existing) {
    // Already in the pantry -> add to the quantity instead of making a duplicate.
    // Convert to the unit the pantry already uses first, so 500 g added to "1 kg rice" gives 1.5 kg (not 501 kg).
    const unit = req.body.unit || existing.unit
    const added = convertAmount(quantity, unit, existing.unit)
    if (added === null) {
      throw httpError(409, `You already have ${existing.name} in ${existing.unit}. Add it in a matching unit, or edit the item instead.`)
    }
    existing.quantity = Math.round((existing.quantity + added) * 1000) / 1000
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
module.exports.getSavedPreferences = getSavedPreferences
