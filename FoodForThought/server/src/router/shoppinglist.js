/**
 * Shopping list routes
 * ---------------------------------------------------------------
 * Mount in your server file next to the planner, e.g.
 *   app.use('/api/shopping-list', require('./routes/ShoppingList'));
 *
 *   GET    /shopping-list?start=YYYY-MM-DD     the list for that week
 *   POST   /shopping-list/generate  { start }  build / refresh it from the meal plan
 *   PATCH  /shopping-list/items/:itemId  { purchased }   tick / untick
 *   POST   /shopping-list/items  { start, name, quantity, unit, category }  add a manual item
 *   DELETE /shopping-list/items/:itemId        remove a manual item
 */
const express = require('express');
const mongoose = require('mongoose');
const ShoppingList = require('../models/ShoppingList');
const MealPlan = require('../models/MealPlan');
const {
  CATEGORIES,
  normalizeName,
  normalizeUnit,
  buildShoppingItems,
  reconcileItems,
  parseWeekStart,
} = require('../services/shoppingListBuilder');

const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

const userIdOf = (req) => req.userId;

/* ===============================================================
   ADAPTERS: the only part that depends on your teammates' schemas.
   Check these field names against MealPlan.js, Recipe.js and the
   pantry model, and change them here if they differ.
=============================================================== */

// Turn a MealPlan document into the plain "meals" array the builder expects.
// ASSUMES: plan.entries[] with { recipeId (ref Recipe), servings, status },
//          Recipe with { title, servings, ingredients: [{ name, quantity|amount, unit, category?, aisle? }] }
function mealsFromPlan(plan) {
  if (!plan) return [];
  return (plan.entries || [])
    .map((entry) => {
      const recipe = entry.recipeId; // populated below with .populate('entries.recipeId')
      // Custom meals (no recipe) have no ingredients, so they add nothing.
      if (!recipe || !Array.isArray(recipe.ingredients)) return null;
      return {
        status: entry.status,
        recipeId: recipe._id,
        title: recipe.title,
        recipeServings: recipe.servings,
        plannedServings: entry.servings,
        ingredients: recipe.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity ?? ing.amount, // Spoonacular calls it "amount"
          unit: ing.unit,
          category: ing.category,
          aisle: ing.aisle,
        })),
      };
    })
    .filter(Boolean);
}

// TODO (James's pantry): return [{ name, quantity, unit }] for this user.
// Until the pantry model exists, nothing is subtracted.
async function getPantry(/* userId */) {
  return [];
}

/* ===============================================================
   Helpers
=============================================================== */

// Wraps an async route so any thrown error becomes a 500 response
// instead of crashing the request (Express 4 doesn't do this for you).
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error('[shopping-list]', err);
    if (err.code === 11000) return res.status(409).json({ message: 'List was just created, please retry.' });
    if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
    res.status(500).json({ message: 'Something went wrong with the shopping list.' });
  }
};

function weekFrom(value, res) {
  const weekStart = parseWeekStart(value);
  if (!weekStart) res.status(400).json({ message: 'start must be a date in YYYY-MM-DD format.' });
  return weekStart;
}

/* ===============================================================
   Routes
=============================================================== */

// GET /shopping-list?start=YYYY-MM-DD
router.get('/', handle(async (req, res) => {
  const weekStart = weekFrom(req.query.start, res);
  if (!weekStart) return;

  const list = await ShoppingList.findOne({ userId: userIdOf(req), weekStart }).lean();
  // No list yet -> send an empty one so the frontend always gets the same shape.
  res.json(list || { weekStart, items: [], generatedAt: null });
}));

// POST /shopping-list/generate  { start }
router.post('/generate', handle(async (req, res) => {
  const userId = userIdOf(req);
  const weekStart = weekFrom(req.body.start, res);
  if (!weekStart) return;

  const plan = await MealPlan.findOne({ userId, weekStart }).populate('entries.recipeId');
  const freshItems = buildShoppingItems(mealsFromPlan(plan), await getPantry(userId));

  let list = await ShoppingList.findOne({ userId, weekStart });
  if (list) {
    // Keep manual items and ticks from the old list.
    list.items = reconcileItems(list.items.map((i) => i.toObject()), freshItems);
  } else {
    list = new ShoppingList({ userId, weekStart, items: freshItems });
  }
  list.mealPlanId = plan ? plan._id : null;
  list.generatedAt = new Date();
  await list.save();

  res.json(list);
}));

// PATCH /shopping-list/items/:itemId  { purchased: true|false }
router.patch('/items/:itemId', handle(async (req, res) => {
  const { itemId } = req.params;
  const { purchased } = req.body;
  if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ message: 'Invalid item id.' });
  if (typeof purchased !== 'boolean') return res.status(400).json({ message: 'purchased must be true or false.' });

  // Filtering on userId too means users can only tick items on THEIR OWN lists.
  // "items.$" is MongoDB's positional operator: "the array element that matched".
  const list = await ShoppingList.findOneAndUpdate(
    { userId: userIdOf(req), 'items._id': itemId },
    { $set: { 'items.$.purchased': purchased, 'items.$.purchasedAt': purchased ? new Date() : null } },
    { returnDocument: 'after' }, // return the list AFTER the update (replaces the deprecated "new: true")
  );
  if (!list) return res.status(404).json({ message: 'Item not found.' });

  res.json(list.items.id(itemId));
}));

// POST /shopping-list/items  { start, name, quantity?, unit?, category? }
router.post('/items', handle(async (req, res) => {
  const userId = userIdOf(req);
  const weekStart = weekFrom(req.body.start, res);
  if (!weekStart) return;

  const name = String(req.body.name ?? '').trim();
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'other';
  if (!name) return res.status(400).json({ message: 'Item name is required.' });
  if (!(quantity > 0)) return res.status(400).json({ message: 'Quantity must be more than 0.' });

  const { unit, factor } = normalizeUnit(req.body.unit); // "kg" -> stored as g

  const list = (await ShoppingList.findOne({ userId, weekStart })) || new ShoppingList({ userId, weekStart, items: [] });
  list.items.push({
    name,
    normalizedName: normalizeName(name),
    quantity: quantity * factor,
    unit,
    category,
    source: 'manual',
  });
  await list.save();

  res.status(201).json(list.items[list.items.length - 1]);
}));

// DELETE /shopping-list/items/:itemId   (manual items only; auto items
// would just come back on the next regenerate)
router.delete('/items/:itemId', handle(async (req, res) => {
  const { itemId } = req.params;
  if (!mongoose.isValidObjectId(itemId)) return res.status(400).json({ message: 'Invalid item id.' });

  const list = await ShoppingList.findOneAndUpdate(
    { userId: userIdOf(req), items: { $elemMatch: { _id: itemId, source: 'manual' } } },
    { $pull: { items: { _id: itemId } } },
  );
  if (!list) return res.status(404).json({ message: 'Item not found, or it came from your meal plan.' });

  res.status(204).end();
}));

module.exports = router;