/**
 * shoppingListBuilder.js
 * ---------------------------------------------------------------
 * Pure functions that turn a week's meals into shopping-list items.
 * "Pure" = no database, no Express. They take plain objects in and
 * return plain objects out, which is why they're easy to unit-test
 * (see tests/shoppingListBuilder.test.js).
 *
 * Pipeline used by POST /shoppinglist/generate:
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
const { normalizeIngredient, ingredientMatches } = require('./ingredientnames');
const { convertAmount, unitInfo, toPantryUnit } = require('./units');

// Ingredient names use the SAME rule as the pantry, so list items and
// pantry items match: "Eggs" -> "egg", "Cherry Tomatoes" -> "cherry tomato".
// This also merges plurals across recipes ("2 egg" + "3 eggs" = 5).
const normalizeName = normalizeIngredient;

// Lowercase + tidy spaces only. For units, aisles and statuses, where
// plurals and punctuation matter ("tbsp.", "Milk, Eggs").
function cleanText(text) {
  return String(text ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
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
  ['tsp', 1, 'tsp', 'tsps', 'teaspoon', 'teaspoons'],
  ['tbsp', 1, 'tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tbs'],
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
  const key = cleanText(unit).replace(/\.$/, ''); // "tbsp." -> "tbsp"
  return UNIT_LOOKUP[key] || { unit: key, factor: 1 };
}

// An amount in one unit, expressed in another: 2 tbsp -> 29.58 ml, 1 kg -> 1000 g.
// Uses the shared converter (services/units.js); units it doesn't know ("can", "pack")
// only match the exact same unit. Returns null if they can't be compared.
// With the ingredient name, cups and grams can be compared too (3 cups rice vs 1.5 kg rice in the pantry).
function amountIn(amount, fromUnit, toUnit, ingredientName) {
  const converted = convertAmount(amount, fromUnit, toUnit, ingredientName);
  if (converted !== null) return converted;
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  return from.unit === to.unit ? (amount * from.factor) / to.factor : null;
}

// Weights/volumes round to whole numbers, spoons and cups to 2 d.p.
// Everything else is something you buy whole (pieces, cloves, but also "jar", "can", "stalk",
// "bunch"...), so it rounds UP: half a jar of laksa paste is still one jar at the shop.
const MEASURED_UNITS = ['tsp', 'tbsp', 'cup'];
function roundQuantity(quantity, unit) {
  if (unit === 'g' || unit === 'ml') return Math.round(quantity);
  if (MEASURED_UNITS.includes(unit)) return Math.round(quantity * 100) / 100;
  // 1e-9 absorbs float error; Math.max turns Math.ceil's "-0" into a plain 0
  return Math.max(0, Math.ceil(quantity - 1e-9));
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

/* Recipes people create themselves (and most community recipes) have no aisle, so before this
   every one of their ingredients landed in "Other". This guesses the section from the ingredient's
   own name instead. Whole words only ("egg" doesn't match "eggplant"), and the ORDER matters:
   a section earlier in the list wins, so
     "coconut milk", "chicken stock", "fish sauce"  -> sauces (checked before dairy / meat)
     "rice vinegar", "chilli powder", "black pepper" -> spices (checked before grains / produce)
     "egg noodles"                                    -> noodles (checked before eggs)
   Names are singular here because normalizeName() already turns "eggs" into "egg". It also makes a few odd
   singulars ("leaves" -> "leave", "chillies" -> "chilly", "ikan bilis" -> "ikan bili"), so those are listed as-is. */
const NAME_KEYWORDS = [
  ['frozen', ['frozen', 'ice cream']],
  ['produce', ['bell pepper', 'capsicum', 'sweet potato']], // before "pepper" (spice) and "potato"
  ['canned-sauces', [
    'sauce', 'stock', 'broth', 'coconut milk', 'coconut cream', 'paste', 'canned', 'ketchup', 'mayonnaise',
    'mayo', 'sambal', 'gochujang', 'miso', 'pesto', 'salsa', 'passata', 'tomato puree', 'baked bean',
    'kecap manis', 'mirin', 'cooking wine', 'shaoxing wine', 'luncheon meat', 'evaporated milk', 'condensed milk',
  ]],
  ['spices-condiments', [
    'salt', 'pepper', 'peppercorn', 'sugar', 'oil', 'vinegar', 'spice', 'powder', 'cumin', 'turmeric', 'paprika',
    'cinnamon', 'star anise', 'bay leaf', 'oregano', 'msg', 'stock cube', 'bouillon', 'honey', 'jam', 'mustard',
    'sesame seed', 'cornstarch', 'corn starch', 'cornflour', 'baking soda', 'yeast', 'vanilla', 'cocoa', 'syrup',
    'peanut butter', 'bay leave',
  ]],
  ['grains-noodles', [
    'rice', 'noodle', 'pasta', 'spaghetti', 'macaroni', 'penne', 'fusilli', 'vermicelli', 'bee hoon', 'beehoon',
    'kway teow', 'mee', 'udon', 'ramen', 'soba', 'bread', 'bun', 'tortilla', 'wrap', 'flour', 'oat', 'quinoa',
    'couscous', 'cereal', 'cracker', 'barley', 'breadcrumb', 'panko',
  ]],
  ['meat-seafood', [
    'chicken', 'beef', 'pork', 'lamb', 'mutton', 'duck', 'turkey', 'bacon', 'ham', 'sausage', 'mince', 'minced meat',
    'steak', 'fish', 'salmon', 'tuna', 'cod', 'snapper', 'seabass', 'sea bass', 'prawn', 'shrimp', 'squid', 'crab',
    'clam', 'mussel', 'scallop', 'oyster', 'anchovy', 'ikan bili', 'fishball', 'fish ball',
  ]],
  ['dairy-eggs', ['egg', 'milk', 'butter', 'cheese', 'yogurt', 'yoghurt', 'cream', 'ghee', 'tofu', 'beancurd']],
  ['produce', [
    'garlic', 'onion', 'shallot', 'ginger', 'galangal', 'lemongrass', 'chilli', 'chili', 'tomato', 'potato', 'carrot',
    'cabbage', 'lettuce', 'spinach', 'kailan', 'kai lan', 'bok choy', 'pak choy', 'choy sum', 'kangkong', 'broccoli',
    'cauliflower', 'cucumber', 'eggplant', 'brinjal', 'mushroom', 'bean sprout', 'beansprout', 'long bean',
    'french bean', 'green bean', 'pea', 'corn', 'pumpkin', 'zucchini', 'celery', 'leek', 'radish', 'okra', 'yam',
    'coriander', 'cilantro', 'parsley', 'basil', 'mint', 'thyme', 'rosemary', 'dill', 'scallion', 'spring onion',
    'pandan', 'curry leaf', 'curry leave', 'lime leaf', 'lime leave', 'chilly', 'chive', 'lime', 'lemon', 'apple', 'banana', 'orange', 'mango', 'pineapple',
    'avocado', 'berry', 'strawberry', 'blueberry', 'grape', 'pear', 'kiwi', 'papaya', 'watermelon', 'coconut',
    'herb', 'vegetable', 'fruit', 'salad', 'leaf', 'leave', // any other leaves (laksa, kaffir lime) are fresh herbs
  ]],
];

function categoryFromName(name) {
  const padded = ` ${normalizeName(name)} `;
  for (const [category, words] of NAME_KEYWORDS) {
    if (words.some((w) => padded.includes(` ${w} `))) return category;
  }
  return null;
}

// 1. a valid category on the ingredient  2. Spoonacular's aisle  3. a guess from the name  4. "other"
function categorize(ingredient) {
  if (CATEGORIES.includes(ingredient.category)) return ingredient.category;
  const aisle = cleanText(ingredient.aisle);
  for (const [category, words] of AISLE_KEYWORDS) {
    if (words.some((w) => aisle.includes(w))) return category;
  }
  return categoryFromName(ingredient.name) || 'other';
}

/* ---------------------------------------------------------------
   Which meals count?
   Skipped meals are never cooked, so they need nothing.
   Planned AND Cooked meals both count: if Cooked meals were left out,
   items the user already ticked off would vanish from the list when
   they regenerate it mid-week.
---------------------------------------------------------------- */
function countsTowardList(status) {
  return cleanText(status) !== 'skipped';
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
  // 1. Scale and merge. ONE line per ingredient name. Each line keeps a list of amounts:
  //    - units that convert are merged into one amount: 1 tsp + 1 tbsp salt -> 4 tsp,
  //      1 cup + 200 ml milk -> 440 ml (the smaller unit is kept, so numbers stay whole)
  //    - units that can't convert stay side by side on the same line:
  //      ginger "1 piece + 1 inch", garlic "4 cloves + 10 g"
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

      if (!needs.has(normalizedName)) {
        needs.set(normalizedName, {
          name: displayName(ing.name),
          normalizedName,
          category: categorize(ing),
          amounts: [], // [{ unit, needed }]
          usedIn: [],
        });
      }
      const need = needs.get(normalizedName);
      addAmount(need.amounts, amount * factor * ratio, unit, ing.name);

      // Remember which recipes use this item (once per recipe), for the tags in the UI.
      const alreadyListed = need.usedIn.some((u) => String(u.recipeId) === String(meal.recipeId));
      if (meal.recipeId && !alreadyListed) {
        need.usedIn.push({ recipeId: meal.recipeId, title: meal.title });
      }
    }
  }

  // 2. The pantry as rows we can take from. `left` goes down as rows cover needs,
  //    so one "1 kg chicken" can't cover 800 g of breast AND 800 g of thigh.
  const stock = pantry
    .filter((p) => p.name && Number(p.quantity) > 0)
    .map((p) => ({ name: normalizeName(p.name), unit: p.unit, left: Number(p.quantity) }));

  // 3. Work out how much of each amount the pantry covers, using the SAME rules as cooking
  //    in Planner.js (deductFromPantry), so the two features always agree:
  //    - names: exact name first, then a whole-word match ("chicken" covers "chicken breast")
  //    - units: converted within weight / volume / count ("500 ml milk" covers "1 cup milk")
  //    Exact names go first across ALL needs, so a whole-word match never takes stock an exact one needed.
  const needList = [...needs.values()];
  needList.forEach((need) => need.amounts.forEach((amt) => { amt.covered = 0; }));

  // `name` = the recipe's ingredient name, so cups of rice can be compared with rice stored in g
  const takeFromPantry = (amt, rows, name) => {
    for (const row of rows) {
      const stillNeeded = amt.needed - amt.covered;
      if (stillNeeded <= 1e-9) return;
      const available = amountIn(row.left, row.unit, amt.unit, name); // the row's stock, in this amount's unit
      if (!(available > 0)) continue; // empty, or units that can't be compared (pieces vs g)
      const take = Math.min(stillNeeded, available);
      amt.covered += take;
      row.left -= amountIn(take, amt.unit, row.unit, name);
    }
  };
  for (const need of needList) {
    const rows = stock.filter((row) => row.name === need.normalizedName);
    need.amounts.forEach((amt) => takeFromPantry(amt, rows, need.normalizedName));
  }
  for (const need of needList) {
    const rows = stock.filter((row) => row.name !== need.normalizedName && ingredientMatches(row.name, need.normalizedName));
    need.amounts.forEach((amt) => takeFromPantry(amt, rows, need.normalizedName));
  }

  // 4. Subtract what the pantry covers, then round.
  //    quantity / unit / pantryQuantity = the main amount; any others go in alsoNeed.
  //    Amounts still to buy come first, so quantity > 0 always means "something to buy".
  const items = needList.map((need) => {
    const amounts = need.amounts.map((amt) => {
      let toBuy = amt.needed - amt.covered;
      if (toBuy < 1e-6) toBuy = 0; // float leftovers from unit conversion, e.g. 0.0000001 cups
      return { quantity: roundQuantity(toBuy, amt.unit), unit: amt.unit, pantryQuantity: Math.round(amt.covered * 100) / 100 };
    });
    // Main amount: one still to buy, preferring a unit the pantry can store (ginger "1 piece" over "1 inch"),
    // since shopping mode starts the basket from it
    const rank = (a) => (a.quantity > 0 ? 0 : 2) + (PANTRY_UNIT[a.unit] ? 0 : 1);
    const ordered = [...amounts].sort((x, y) => rank(x) - rank(y));
    const [main, ...rest] = ordered;
    return {
      name: need.name,
      normalizedName: need.normalizedName,
      unit: main.unit,
      category: need.category,
      usedIn: need.usedIn,
      source: 'auto',
      quantity: main.quantity,
      pantryQuantity: main.pantryQuantity,
      alsoNeed: rest,
      purchased: false,
    };
  });

  return sortItems(items);
}

// How a unit compares in size within its group (1 tsp = 4.93 ml), for picking the smaller unit.
// Units the converter doesn't know count as size 1.
function unitSize(unit) {
  const info = unitInfo(unit);
  return info ? info.factor : 1;
}

// Adds `amount` (in `unit`) to a list of amounts. Merges into an amount in a unit it can
// convert to, switching that amount to the smaller of the two units; otherwise adds a new one.
//   [{ 1 tbsp }] + 1 tsp  -> [{ 4 tsp }]      (1 tbsp = 3 tsp)
//   [{ 1 cup rice }] + 200 g rice -> [{ 385 g }]   (weight and volume, for ingredients we know)
//   [{ 1 piece }] + 1 inch -> [{ 1 piece }, { 1 inch }]
function addAmount(amounts, amount, unit, name) {
  const match = amounts.find((amt) => amountIn(1, unit, amt.unit, name) !== null);
  if (!match) {
    amounts.push({ unit, needed: amount });
    return;
  }
  // Weight wins over volume (rice is bought by the kg, not the cup); otherwise the smaller unit
  const group = (u) => unitInfo(u)?.group;
  const prefer = group(unit) !== group(match.unit)
    ? group(unit) === 'weight'
    : unitSize(unit) < unitSize(match.unit);
  if (prefer) {
    match.needed = amountIn(match.needed, match.unit, unit, name);
    match.unit = unit;
  }
  match.needed += amountIn(amount, unit, match.unit, name);
}

// Every amount on a line: the main one plus alsoNeed, as [{ quantity, unit }]
function amountsOf(item) {
  return [{ quantity: item.quantity, unit: item.unit }, ...(item.alsoNeed || [])];
}

// A ticked line stays ticked only if every amount the plan now needs was on the old line
// in the same unit and at least as much (otherwise it's unticked so the user buys the rest).
function boughtEnough(oldItem, freshItem) {
  const had = amountsOf(oldItem);
  return amountsOf(freshItem)
    .filter((a) => a.quantity > 0)
    .every((a) => had.some((h) => normalizeUnit(h.unit).unit === normalizeUnit(a.unit).unit && Number(h.quantity) >= a.quantity));
}

/* ---------------------------------------------------------------
   reconcileItems(oldItems, freshItems)

   Called when a list is regenerated. Rules:
   - Manual items (typed in by the user) are always kept.
   - An auto item that existed before keeps its _id (stable for the UI)
     and stays ticked, unless the plan now needs MORE of it than
     was bought, in which case it is unticked so the user buys the rest.
   - Auto items no longer needed by any meal disappear.
   - "Added to pantry" stays with a ticked item, so it can't be added twice.
---------------------------------------------------------------- */
function reconcileItems(oldItems, freshItems) {
  // One auto line per ingredient name, so lines are matched by name. Recomputed from the
  // name (not the stored normalizedName), so lists saved before the naming rule changed still match.
  const keyOf = (i) => normalizeName(i.name);
  const isManual = (i) => i.source === 'manual';

  // Lists made before amounts were combined can have two lines for one name
  // (ginger "1 piece" and ginger "1 inch"): prefer the ticked one.
  const previous = new Map();
  for (const old of oldItems.filter((i) => !isManual(i))) {
    const key = keyOf(old);
    if (!previous.has(key) || (old.purchased && !previous.get(key).purchased)) previous.set(key, old);
  }

  const merged = freshItems.map((item) => {
    const old = previous.get(keyOf(item));
    if (!old) return item;
    const keepTicked = Boolean(old.purchased) && boughtEnough(old, item);
    return {
      ...item,
      _id: old._id,
      purchased: keepTicked,
      purchasedAt: keepTicked ? old.purchasedAt : null,
      addedToPantry: keepTicked && Boolean(old.addedToPantry),
      basket: keepTicked ? old.basket : undefined, // what the user filled in while shopping
    };
  });

  return sortItems([...merged, ...oldItems.filter(isManual)]);
}

/* ---------------------------------------------------------------
   Pantry conversion (for "Add bought items to pantry")
   The pantry stores g, kg, ml, l and pcs (tsp / tbsp / cup are turned into g or ml by
   toPantryUnit in units.js) and uses its own category names, so list items are translated here.
---------------------------------------------------------------- */
const PANTRY_UNIT = { g: 'g', ml: 'ml', piece: 'pcs', clove: 'pcs', tsp: 'tsp', tbsp: 'tbsp', cup: 'cup' };

const PANTRY_CATEGORY = {
  produce: 'produce',
  'dairy-eggs': 'dairy',
  'grains-noodles': 'grains',
  'canned-sauces': 'canned',
  'spices-condiments': 'condiments',
  frozen: 'frozen',
  other: 'other',
  // 'meat-seafood' is split into meat / seafood below
};
const SEAFOOD_WORDS = ['fish', 'prawn', 'shrimp', 'salmon', 'tuna', 'squid', 'crab', 'clam', 'mussel', 'scallop', 'cod', 'anchovy'];

// True if the pantry has a unit for this item (e.g. not "bottle" or "pack").
// Used by both the server and the page to decide what the pantry button counts.
function canGoInPantry(item) {
  return Boolean(PANTRY_UNIT[item.unit]);
}

function pantryCategory(item) {
  if (item.category === 'meat-seafood') {
    const words = normalizeName(item.name).split(' ');
    return words.some((w) => SEAFOOD_WORDS.includes(w)) ? 'seafood' : 'meat';
  }
  return PANTRY_CATEGORY[item.category] || 'other';
}

/* defaultBasket(item)
   Shopping mode: when an item goes into the basket, its pantry details start
   pre-filled from the list, so the user only edits what's different
   (a 2 kg bag instead of 600 g, a use-by date...).
   Items the pantry can't store ("1 bottle dish soap") start with addToPantry off. */
function defaultBasket(item) {
  const pantryUnit = PANTRY_UNIT[item.unit];
  const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  // "3 cup jasmine rice" goes in the basket as "554 g", the way the pantry keeps it
  const stored = pantryUnit ? toPantryUnit(quantity, pantryUnit, item.name) : { quantity, unit: 'pcs' };
  return {
    name: String(item.name || '').trim().slice(0, 60),
    quantity: Math.round(stored.quantity * 100) / 100,
    unit: stored.unit,
    category: pantryCategory(item),
    expiryDate: null,
    addToPantry: Boolean(pantryUnit),
  };
}

/* pantryAmount(item, existingUnit)
   How much to add to the pantry, in the pantry's units.
   existingUnit = unit of the pantry row for this ingredient, or null if
   the user doesn't have it yet.
   Returns { quantity, unit } or { skip: 'reason' }.

   Examples:
     300 g chicken, pantry has it in kg  -> { quantity: 0.3, unit: 'kg' }
     2 piece egg,   pantry has none      -> { quantity: 2,   unit: 'pcs' }
     3 cup rice,    pantry has none      -> { quantity: 554, unit: 'g' }   (no cups in the pantry)
     3 cup rice,    pantry has it in kg  -> { quantity: 0.554, unit: 'kg' }
     1 bottle soap                       -> { skip: ... } (pantry has no "bottle")
     2 cup spinach, pantry has it in g   -> { skip: ... } (no reliable weight per cup) */
function pantryAmount(item, existingUnit) {
  const pantryUnit = PANTRY_UNIT[item.unit];
  if (!pantryUnit) return { skip: `the pantry can't store "${item.unit}"` };
  if (!existingUnit) return toPantryUnit(item.quantity, pantryUnit, item.name);

  // Same converter as cooking and list-building: 300 g -> 0.3 kg, 2 tbsp -> 29.58 ml, 1 cup rice -> 185 g
  const converted = amountIn(item.quantity, item.unit, existingUnit, item.name);
  if (converted === null) return { skip: `your pantry stores it in ${existingUnit}` };

  return { quantity: Math.round(converted * 1000) / 1000, unit: existingUnit };
}

module.exports = {
  CATEGORIES,
  SHOPPING_ORDER,
  normalizeName,
  normalizeUnit,
  roundQuantity,
  categorize,
  categoryFromName,
  countsTowardList,
  sortItems,
  buildShoppingItems,
  reconcileItems,
  canGoInPantry,
  pantryCategory,
  pantryAmount,
  defaultBasket,
  amountsOf,
};