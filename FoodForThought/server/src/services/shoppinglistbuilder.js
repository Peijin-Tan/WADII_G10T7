/**
 * shoppingListBuilder.js
 * ---------------------------------------------------------------
 * Pure functions that turn a week's meals into shopping-list items.
 * "Pure" = no database, no Express. They take plain objects in and
 * return plain objects out, which is why they're easy to unit-test
 * (see tests/shoppingListBuilder.test.js).
 *
 * Pipeline used by POST /shopping-list/generate:
 *   meals ──► scale by servings ──► merge duplicates ──► subtract pantry
 *         ──► round ──► sort by shopping order ──► reconcile with old list
 */

// Allowed item categories (must match the enum in models/ShoppingList.js).
const CATEGORIES = [
  'produce',
  'meat-seafood',
  'dairy-eggs',
  'grains-noodles',
  'canned-sauces',
  'spices-condiments',
  'frozen',
  'other',
];

// The order a shopper should walk the shop in: shelf-stable goods first,
// chilled and frozen goods last so they stay cold on the way home.
const SHOPPING_ORDER = [
  'canned-sauces',
  'grains-noodles',
  'spices-condiments',
  'other',
  'produce',
  'dairy-eggs',
  'meat-seafood',
  'frozen',
];

/* ---------------------------------------------------------------
   Names
---------------------------------------------------------------- */

// "  Spring  Onion " -> "spring onion", so "Garlic" and "garlic" merge.
// Known limitation: plurals are NOT merged ("egg" vs "eggs").
function normalizeName(name) {
  return String(name ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// "chicken thigh" -> "Chicken thigh" (for display only).
function displayName(name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/* ---------------------------------------------------------------
   Units
   Each row: [canonical unit, multiply by, ...spellings we accept]
   kg is stored as g (x1000) and l as ml (x1000) so they can merge.
   Spoonacular often uses "large"/"medium" as the unit for eggs and
   onions, so those count as "piece".
---------------------------------------------------------------- */
const UNIT_ALIASES = [
  ['g', 1, 'g', 'gram', 'grams', 'gm'],
  ['g', 1000, 'kg', 'kilogram', 'kilograms'],
  ['ml', 1, 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  ['ml', 1000, 'l', 'liter', 'liters', 'litre', 'litres'],
  ['tsp', 1, 'tsp', 'teaspoon', 'teaspoons'],
  ['tbsp', 1, 'tbsp', 'tablespoon', 'tablespoons', 'tbs'],
  ['cup', 1, 'cup', 'cups'],
  ['clove', 1, 'clove', 'cloves'],
  ['piece', 1, '', 'piece', 'pieces', 'pc', 'pcs', 'whole', 'small', 'medium', 'large'],
];

// Build a lookup table once: { kg: { unit: 'g', factor: 1000 }, ... }
const UNIT_LOOKUP = {};
for (const [unit, factor, ...spellings] of UNIT_ALIASES) {
  for (const spelling of spellings) UNIT_LOOKUP[spelling] = { unit, factor };
}

// Unknown units (e.g. "can", "pack") pass through unchanged.
function normalizeUnit(unit) {
  const key = normalizeName(unit).replace(/\.$/, ''); // "tbsp." -> "tbsp"
  return UNIT_LOOKUP[key] || { unit: key, factor: 1 };
}

// You can't buy 0.5 of an egg, so countable units round UP.
// Weights/volumes round to whole numbers, anything else to 2 d.p.
function roundQuantity(quantity, unit) {
  if (unit === 'piece' || unit === 'clove') return Math.ceil(quantity - 1e-9); // 1e-9 absorbs float error
  if (unit === 'g' || unit === 'ml') return Math.round(quantity);
  return Math.round(quantity * 100) / 100;
}

/* ---------------------------------------------------------------
   Categories
   Use the ingredient's own category if it's valid; otherwise guess
   from Spoonacular's "aisle" text (e.g. "Milk, Eggs, Other Dairy").
   Order matters: "frozen" is checked first so "Frozen vegetables"
   doesn't land in produce.
---------------------------------------------------------------- */
const AISLE_KEYWORDS = [
  ['frozen', ['frozen']],
  ['meat-seafood', ['meat', 'seafood', 'fish', 'poultry']],
  ['dairy-eggs', ['milk', 'dairy', 'egg', 'cheese', 'yogurt']],
  ['produce', ['produce', 'vegetable', 'fruit', 'herb']],
  ['grains-noodles', ['pasta', 'rice', 'grain', 'noodle', 'bread', 'bakery', 'baking', 'cereal']],
  ['canned-sauces', ['canned', 'jarred', 'sauce', 'broth', 'stock']],
  ['spices-condiments', ['spice', 'seasoning', 'oil', 'vinegar', 'condiment', 'honey', 'jam']],
];

function categorize(ingredient) {
  if (CATEGORIES.includes(ingredient.category)) return ingredient.category;
  const aisle = normalizeName(ingredient.aisle);
  for (const [category, words] of AISLE_KEYWORDS) {
    if (words.some((w) => aisle.includes(w))) return category;
  }
  return 'other';
}

/* ---------------------------------------------------------------
   Which meals count?
   Skipped meals are never cooked, so they need nothing.
   Planned AND Cooked meals both count: if Cooked meals were left out,
   items the user already ticked off would vanish from the list when
   they regenerate it mid-week.
---------------------------------------------------------------- */
function countsTowardList(status) {
  return normalizeName(status) !== 'skipped';
}

function sortItems(items) {
  const rank = (c) => {
    const i = SHOPPING_ORDER.indexOf(c);
    return i === -1 ? SHOPPING_ORDER.length : i;
  };
  return [...items].sort(
    (a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name),
  );
}

/* ---------------------------------------------------------------
   buildShoppingItems(meals, pantry)

   meals:  [{ status, recipeId, title, recipeServings, plannedServings,
              ingredients: [{ name, quantity, unit, category?, aisle? }] }]
   pantry: [{ name, quantity, unit }]

   Returns items shaped like the ShoppingList item schema:
     quantity       = amount still to BUY (0 = pantry covers it all)
     pantryQuantity = amount the pantry already covers
---------------------------------------------------------------- */
function buildShoppingItems(meals, pantry = []) {
  // 1. Scale and merge. Key = name + unit, so "200 g rice" and
  //    "1 cup rice" stay as separate lines (known limitation).
  const needs = new Map();

  for (const meal of meals) {
    if (!countsTowardList(meal.status)) continue;

    const recipeServings = Number(meal.recipeServings) > 0 ? Number(meal.recipeServings) : 1;
    const plannedServings = Number(meal.plannedServings) > 0 ? Number(meal.plannedServings) : recipeServings;
    const ratio = plannedServings / recipeServings; // 4-serving recipe planned for 2 -> 0.5

    for (const ing of meal.ingredients || []) {
      const amount = Number(ing.quantity);
      // Skip "salt to taste" style lines that have no real amount.
      if (!ing.name || !(amount > 0)) continue;

      const { unit, factor } = normalizeUnit(ing.unit);
      const normalizedName = normalizeName(ing.name);
      const key = `${normalizedName}|${unit}`;

      if (!needs.has(key)) {
        needs.set(key, {
          key,
          name: displayName(ing.name),
          normalizedName,
          unit,
          category: categorize(ing),
          needed: 0,
          usedIn: [],
        });
      }
      const need = needs.get(key);
      need.needed += amount * factor * ratio;

      // Remember which recipes use this item (once per recipe), for the tags in the UI.
      const alreadyListed = need.usedIn.some((u) => String(u.recipeId) === String(meal.recipeId));
      if (meal.recipeId && !alreadyListed) {
        need.usedIn.push({ recipeId: meal.recipeId, title: meal.title });
      }
    }
  }

  // 2. Total up the pantry with the same name+unit keys.
  const stock = new Map();
  for (const p of pantry) {
    const amount = Number(p.quantity);
    if (!p.name || !(amount > 0)) continue;
    const { unit, factor } = normalizeUnit(p.unit);
    const key = `${normalizeName(p.name)}|${unit}`;
    stock.set(key, (stock.get(key) || 0) + amount * factor);
  }

  // 3. Subtract what the pantry covers, then round.
  const items = [...needs.values()].map((need) => {
    const covered = Math.min(need.needed, stock.get(need.key) || 0);
    return {
      name: need.name,
      normalizedName: need.normalizedName,
      unit: need.unit,
      category: need.category,
      usedIn: need.usedIn,
      source: 'auto',
      quantity: roundQuantity(need.needed - covered, need.unit),
      pantryQuantity: Math.round(covered * 100) / 100,
      purchased: false,
    };
  });

  return sortItems(items);
}

/* ---------------------------------------------------------------
   reconcileItems(oldItems, freshItems)

   Called when a list is regenerated. Rules:
   - Manual items (typed in by the user) are always kept.
   - An auto item that existed before keeps its _id (stable for the UI)
     and stays ticked, unless the plan now needs MORE of it than
     was bought, in which case it is unticked so the user buys the rest.
   - Auto items no longer needed by any meal disappear.
---------------------------------------------------------------- */
function reconcileItems(oldItems, freshItems) {
  const keyOf = (i) => `${i.normalizedName || normalizeName(i.name)}|${normalizeUnit(i.unit).unit}`;
  const isManual = (i) => i.source === 'manual';

  const previous = new Map(oldItems.filter((i) => !isManual(i)).map((i) => [keyOf(i), i]));

  const merged = freshItems.map((item) => {
    const old = previous.get(keyOf(item));
    if (!old) return item;
    const keepTicked = Boolean(old.purchased) && item.quantity <= old.quantity;
    return {
      ...item,
      _id: old._id,
      purchased: keepTicked,
      purchasedAt: keepTicked ? old.purchasedAt : null,
    };
  });

  return sortItems([...merged, ...oldItems.filter(isManual)]);
}

module.exports = {
  CATEGORIES,
  SHOPPING_ORDER,
  normalizeName,
  normalizeUnit,
  roundQuantity,
  categorize,
  countsTowardList,
  sortItems,
  buildShoppingItems,
  reconcileItems,
};