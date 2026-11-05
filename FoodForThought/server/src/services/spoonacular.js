const axios = require('axios');

const client = axios.create({
  baseURL: 'https://api.spoonacular.com',
  timeout: 10000,
  params: { apiKey: process.env.SPOONACULAR_API_KEY },
});

const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  cache.delete(key);
  return null;
}

async function searchByPantry(ingredients, prefs = {}, number = 12) {
  const params = {
    includeIngredients: ingredients.join(','),
    fillIngredients: true,
    addRecipeInformation: true,
    sort: 'max-used-ingredients',
    ignorePantry: true,
    number,
  };
  if (prefs.diet) params.diet = prefs.diet;
  if (prefs.intolerances?.length) params.intolerances = prefs.intolerances.join(',');
  if (prefs.maxReadyTime) params.maxReadyTime = prefs.maxReadyTime;

  const key = JSON.stringify(params);
  const cached = getCached(key);
  if (cached) return cached;

  const { data } = await client.get('/recipes/complexSearch', { params });

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
  }));

  cache.set(key, { at: Date.now(), data: recipes });
  return recipes;
}

const Recipe = require('../../models/Recipe');

function spoonacularGet(path, params) {
  return client.get(path, { params: { ...params, apiKey: process.env.SPOONACULAR_API_KEY } });
}

const minutesOrZero = (n) => (Number(n) > 0 ? Math.round(Number(n)) : 0);

function toIngredient(i, scale = 1) {
  const metric = i.measures && i.measures.metric;
  const amount = Number(metric ? metric.amount : i.amount) * scale;
  const unit = String((metric ? metric.unitShort : i.unit) || '').trim().toLowerCase() || 'piece';
  return {
    name: String(i.nameClean || i.name || '').trim(),
    amount: Math.round(amount * 100) / 100,
    unit,
    aisle: i.aisle || '',
  };
}

function toRecipeDoc(r) {
  const servings = Number(r.servings) > 0 ? Number(r.servings) : 1;
  const totalTime = minutesOrZero(r.readyInMinutes);

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
    image: r.image || `https://img.spoonacular.com/recipes/${r.id}-556x370.jpg`,
    summary: r.summary || r.title,
    cuisine: r.cuisines || [],
    dietaryCategories: r.diets || [],
    servings,
    prepTime: minutesOrZero(r.preparationMinutes) || totalTime,
    cookingTime: minutesOrZero(r.cookingMinutes),
    totalTime,
    ingredients: ingredients.filter((i) => i.name && Number.isFinite(i.amount) && i.amount >= 0),
    instructions: steps
      .filter((s) => s && s.step)
      .map((s, index) => ({ step: s.number || index + 1, description: s.step })),
    nutrition: ((r.nutrition && r.nutrition.nutrients) || [])
      .filter((n) => n && n.name)
      .map((n) => ({ name: n.name, amount: n.amount, unit: n.unit })),
    source: 'spoonacular',
    sourceUrl: r.sourceUrl || '',
  };
}

async function searchRecipes(query, number = 8) {
  const params = {
    query,
    number,
    addRecipeInformation: true,
    addRecipeInstructions: true,
    addRecipeNutrition: true,
  };
  const key = JSON.stringify(['search', params]);
  const cached = getCached(key);
  if (cached) return cached;

  const { data } = await spoonacularGet('/recipes/complexSearch', params);
  const recipes = (data.results || []).map(toRecipeDoc);
  cache.set(key, { at: Date.now(), data: recipes });
  return recipes;
}

async function importRecipe(spoonacularId) {
  const existing = await Recipe.findOne({ externalId: spoonacularId });
  if (existing) return existing;

  const { data } = await spoonacularGet(`/recipes/${spoonacularId}/information`, { includeNutrition: true });
  return Recipe.create(toRecipeDoc(data));
}

module.exports = { searchByPantry, searchRecipes, importRecipe, toRecipeDoc };
