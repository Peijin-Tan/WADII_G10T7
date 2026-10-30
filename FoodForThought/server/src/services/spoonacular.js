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

module.exports = { searchByPantry };
