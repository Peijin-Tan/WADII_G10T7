// services/spoonacular.js
// All Spoonacular calls for the pantry feature live here, so the API key
// and request details are in one place and never reach the browser.
//
// We use /recipes/complexSearch because one call can:
//   - search by the user's pantry ingredients (includeIngredients)
//   - filter by diet and allergens (diet, intolerances)
//   - return used/missing ingredient counts (fillIngredients=true)
//   - return readyInMinutes (addRecipeInformation=true)
// Docs: https://spoonacular.com/food-api/docs#Search-Recipes-Complex
//
// The free plan has a daily points quota, so results are cached in memory
// for a short time. Check your quota on the Spoonacular dashboard.

const axios = require('axios');

const client = axios.create({
  baseURL: 'https://api.spoonacular.com',
  timeout: 10000,
  params: { apiKey: process.env.SPOONACULAR_API_KEY },
});

// --- tiny in-memory cache (resets when the server restarts) ---
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  cache.delete(key);
  return null;
}

/**
 * @param {string[]} ingredients  normalized pantry names
 * @param {object}   prefs        { diet: 'vegetarian', intolerances: ['peanut'] }
 * @param {number}   number       how many recipes to fetch (keep small: quota)
 */
async function searchByPantry(ingredients, prefs = {}, number = 12) {
  const params = {
    includeIngredients: ingredients.join(','),
    fillIngredients: true,
    addRecipeInformation: true,
    sort: 'max-used-ingredients',
    ignorePantry: true, // don't count water/salt/flour as "missing"
    number,
  };
  if (prefs.diet) params.diet = prefs.diet;
  if (prefs.intolerances?.length) params.intolerances = prefs.intolerances.join(',');
  if (prefs.maxReadyTime) params.maxReadyTime = prefs.maxReadyTime;

  const key = JSON.stringify(params);
  const cached = getCached(key);
  if (cached) return cached;

  const { data } = await client.get('/recipes/complexSearch', { params });

  // Reshape to only what our app needs, so the frontend doesn't depend
  // on Spoonacular's response format.
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
      aisle: i.aisle, // useful for grouping in the shopping list
    })),
  }));

  cache.set(key, { at: Date.now(), data: recipes });
  return recipes;
}

/* =================================================================
   Planner: search Spoonacular, and save a chosen recipe into MongoDB
   =================================================================
   The planner, shopping list and pantry all read a recipe's ingredients
   from our own Recipe collection (entries store a recipeId). So when the
   user adds a Spoonacular recipe to their plan, we fetch its full details
   once and save it as a Recipe document (source: 'spoonacular'). After
   that it behaves exactly like any other recipe, and costs no more quota. */

const Recipe = require('../../models/Recipe');

// The key is read at call time (not at the top), so it works even if dotenv loads after this file
function spoonacularGet(path, params) {
  return client.get(path, { params: { ...params, apiKey: process.env.SPOONACULAR_API_KEY } });
}

const minutesOrZero = (n) => (Number(n) > 0 ? Math.round(Number(n)) : 0);

// One Spoonacular ingredient -> { name, amount, unit, aisle } for our Recipe schema.
// Uses METRIC amounts (g, ml) because they suit Singapore shoppers and convert in the
// shopping list; "2 large eggs" has no unit, so it's stored as "piece".
function toIngredient(i, scale = 1) {
  const metric = i.measures && i.measures.metric;
  const amount = Number(metric ? metric.amount : i.amount) * scale;
  const unit = String((metric ? metric.unitShort : i.unit) || '').trim().toLowerCase() || 'piece';
  return {
    name: String(i.nameClean || i.name || '').trim(),
    amount: Math.round(amount * 100) / 100,
    unit,
    aisle: i.aisle || '', // e.g. "Milk, Eggs, Other Dairy", used for shopping-list sections
  };
}

// A Spoonacular recipe (from /information or complexSearch) -> a plain object in our Recipe schema's shape
function toRecipeDoc(r) {
  const servings = Number(r.servings) > 0 ? Number(r.servings) : 1;
  const totalTime = minutesOrZero(r.readyInMinutes);

  // Full details have extendedIngredients (amounts for the whole recipe).
  // Search results may only have nutrition.ingredients, which are PER SERVING, so scale those up.
  let ingredients = [];
  if (Array.isArray(r.extendedIngredients) && r.extendedIngredients.length) {
    ingredients = r.extendedIngredients.map((i) => toIngredient(i));
  } else if (r.nutrition && Array.isArray(r.nutrition.ingredients)) {
    ingredients = r.nutrition.ingredients.map((i) => toIngredient(i, servings));
  }

  const steps = (r.analyzedInstructions && r.analyzedInstructions[0] && r.analyzedInstructions[0].steps) || [];

  return {
    externalId: r.id,
    title: r.title,
    // image and summary are required by the Recipe model; Spoonacular almost always has both
    image: r.image || `https://img.spoonacular.com/recipes/${r.id}-556x370.jpg`,
    summary: r.summary || r.title,
    cuisine: r.cuisines || [],
    dietaryCategories: r.diets || [],
    servings,
    prepTime: minutesOrZero(r.preparationMinutes) || totalTime, // Spoonacular often only gives readyInMinutes
    cookingTime: minutesOrZero(r.cookingMinutes),
    totalTime,
    ingredients: ingredients.filter((i) => i.name && Number.isFinite(i.amount) && i.amount >= 0),
    instructions: steps
      .filter((s) => s && s.step)
      .map((s, index) => ({ step: s.number || index + 1, description: s.step })),
    // per-serving values, e.g. { name: 'Calories', amount: 520, unit: 'kcal' }
    nutrition: ((r.nutrition && r.nutrition.nutrients) || [])
      .filter((n) => n && n.name)
      .map((n) => ({ name: n.name, amount: n.amount, unit: n.unit })),
    source: 'spoonacular',
    sourceUrl: r.sourceUrl || '',
  };
}

// Search Spoonacular by name for the Add Meal modal. Returns recipe docs (not saved yet).
// Cached for 30 minutes so typing the same search again doesn't use more of the daily quota.
async function searchRecipes(query, number = 8) {
  const params = {
    query,
    number,
    addRecipeInformation: true, // servings, readyInMinutes, diets, summary, image
    addRecipeInstructions: true, // steps, for the "View recipe" modal
    addRecipeNutrition: true, // calories / protein for the cards
  };
  const key = JSON.stringify(['search', params]);
  const cached = getCached(key);
  if (cached) return cached;

  const { data } = await spoonacularGet('/recipes/complexSearch', params);
  const recipes = (data.results || []).map(toRecipeDoc);
  cache.set(key, { at: Date.now(), data: recipes });
  return recipes;
}

// Make sure a Spoonacular recipe is saved in our Recipe collection, and return it.
// If someone already added it before, the saved copy is reused (no API call).
async function importRecipe(spoonacularId) {
  const existing = await Recipe.findOne({ externalId: spoonacularId });
  if (existing) return existing;

  const { data } = await spoonacularGet(`/recipes/${spoonacularId}/information`, { includeNutrition: true });
  return Recipe.create(toRecipeDoc(data)); // runs the Recipe model's validation
}

module.exports = { searchByPantry, searchRecipes, importRecipe, toRecipeDoc };
