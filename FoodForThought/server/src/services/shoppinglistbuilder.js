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

const { normalizeIngredient, ingredientMatches } = require('./ingredientnames');
const { convertAmount, unitInfo, toPantryUnit } = require('./units');

const normalizeName = normalizeIngredient;

function cleanText(text) {
  return String(text ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function displayName(name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

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

const UNIT_LOOKUP = {};
for (const [unit, factor, ...spellings] of UNIT_ALIASES) {
  for (const spelling of spellings) UNIT_LOOKUP[spelling] = { unit, factor };
}

function normalizeUnit(unit) {
  const key = cleanText(unit).replace(/\.$/, '');
  return UNIT_LOOKUP[key] || { unit: key, factor: 1 };
}

function amountIn(amount, fromUnit, toUnit, ingredientName) {
  const converted = convertAmount(amount, fromUnit, toUnit, ingredientName);
  if (converted !== null) return converted;
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  return from.unit === to.unit ? (amount * from.factor) / to.factor : null;
}

const MEASURED_UNITS = ['tsp', 'tbsp', 'cup'];
function roundQuantity(quantity, unit) {
  if (unit === 'g' || unit === 'ml') return Math.round(quantity);
  if (MEASURED_UNITS.includes(unit)) return Math.round(quantity * 100) / 100;
  return Math.max(0, Math.ceil(quantity - 1e-9));
}

const AISLE_KEYWORDS = [
  ['frozen', ['frozen']],
  ['meat-seafood', ['meat', 'seafood', 'fish', 'poultry']],
  ['dairy-eggs', ['milk', 'dairy', 'egg', 'cheese', 'yogurt']],
  ['produce', ['produce', 'vegetable', 'fruit', 'herb']],
  ['grains-noodles', ['pasta', 'rice', 'grain', 'noodle', 'bread', 'bakery', 'baking', 'cereal']],
  ['canned-sauces', ['canned', 'jarred', 'sauce', 'broth', 'stock']],
  ['spices-condiments', ['spice', 'seasoning', 'oil', 'vinegar', 'condiment', 'honey', 'jam']],
];

const NAME_KEYWORDS = [
  ['frozen', ['frozen', 'ice cream']],
  ['produce', ['bell pepper', 'capsicum', 'sweet potato']],
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
    'herb', 'vegetable', 'fruit', 'salad', 'leaf', 'leave',
  ]],
];

function categoryFromName(name) {
  const padded = ` ${normalizeName(name)} `;
  for (const [category, words] of NAME_KEYWORDS) {
    if (words.some((w) => padded.includes(` ${w} `))) return category;
  }
  return null;
}

function categorize(ingredient) {
  if (CATEGORIES.includes(ingredient.category)) return ingredient.category;
  const aisle = cleanText(ingredient.aisle);
  for (const [category, words] of AISLE_KEYWORDS) {
    if (words.some((w) => aisle.includes(w))) return category;
  }
  return categoryFromName(ingredient.name) || 'other';
}

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

function buildShoppingItems(meals, pantry = []) {
  const needs = new Map();

  for (const meal of meals) {
    if (!countsTowardList(meal.status)) continue;

    const recipeServings = Number(meal.recipeServings) > 0 ? Number(meal.recipeServings) : 1;
    const plannedServings = Number(meal.plannedServings) > 0 ? Number(meal.plannedServings) : recipeServings;
    const ratio = plannedServings / recipeServings;

    for (const ing of meal.ingredients || []) {
      const amount = Number(ing.quantity);
      if (!ing.name || !(amount > 0)) continue;

      const { unit, factor } = normalizeUnit(ing.unit);
      const normalizedName = normalizeName(ing.name);

      if (!needs.has(normalizedName)) {
        needs.set(normalizedName, {
          name: displayName(ing.name),
          normalizedName,
          category: categorize(ing),
          amounts: [],
          usedIn: [],
        });
      }
      const need = needs.get(normalizedName);
      addAmount(need.amounts, amount * factor * ratio, unit, ing.name);

      const alreadyListed = need.usedIn.some((u) => String(u.recipeId) === String(meal.recipeId));
      if (meal.recipeId && !alreadyListed) {
        need.usedIn.push({ recipeId: meal.recipeId, title: meal.title });
      }
    }
  }

  const stock = pantry
    .filter((p) => p.name && Number(p.quantity) > 0)
    .map((p) => ({ name: normalizeName(p.name), unit: p.unit, left: Number(p.quantity) }));

  const needList = [...needs.values()];
  needList.forEach((need) => need.amounts.forEach((amt) => { amt.covered = 0; }));

  const takeFromPantry = (amt, rows, name) => {
    for (const row of rows) {
      const stillNeeded = amt.needed - amt.covered;
      if (stillNeeded <= 1e-9) return;
      const available = amountIn(row.left, row.unit, amt.unit, name);
      if (!(available > 0)) continue;
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

  const items = needList.map((need) => {
    const amounts = need.amounts.map((amt) => {
      let toBuy = amt.needed - amt.covered;
      if (toBuy < 1e-6) toBuy = 0;
      return { quantity: roundQuantity(toBuy, amt.unit), unit: amt.unit, pantryQuantity: Math.round(amt.covered * 100) / 100 };
    });
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

function unitSize(unit) {
  const info = unitInfo(unit);
  return info ? info.factor : 1;
}

function addAmount(amounts, amount, unit, name) {
  const match = amounts.find((amt) => amountIn(1, unit, amt.unit, name) !== null);
  if (!match) {
    amounts.push({ unit, needed: amount });
    return;
  }
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

function amountsOf(item) {
  return [{ quantity: item.quantity, unit: item.unit }, ...(item.alsoNeed || [])];
}

function boughtEnough(oldItem, freshItem) {
  const had = amountsOf(oldItem);
  return amountsOf(freshItem)
    .filter((a) => a.quantity > 0)
    .every((a) => had.some((h) => normalizeUnit(h.unit).unit === normalizeUnit(a.unit).unit && Number(h.quantity) >= a.quantity));
}

function reconcileItems(oldItems, freshItems) {
  const keyOf = (i) => normalizeName(i.name);
  const isManual = (i) => i.source === 'manual';

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
      basket: keepTicked ? old.basket : undefined,
    };
  });

  return sortItems([...merged, ...oldItems.filter(isManual)]);
}

const PANTRY_UNIT = { g: 'g', ml: 'ml', piece: 'pcs', clove: 'pcs', tsp: 'tsp', tbsp: 'tbsp', cup: 'cup' };

const PANTRY_CATEGORY = {
  produce: 'produce',
  'dairy-eggs': 'dairy',
  'grains-noodles': 'grains',
  'canned-sauces': 'canned',
  'spices-condiments': 'condiments',
  frozen: 'frozen',
  other: 'other',
};
const SEAFOOD_WORDS = ['fish', 'prawn', 'shrimp', 'salmon', 'tuna', 'squid', 'crab', 'clam', 'mussel', 'scallop', 'cod', 'anchovy'];

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

function defaultBasket(item) {
  const pantryUnit = PANTRY_UNIT[item.unit];
  const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
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

function pantryAmount(item, existingUnit) {
  const pantryUnit = PANTRY_UNIT[item.unit];
  if (!pantryUnit) return { skip: `the pantry can't store "${item.unit}"` };
  if (!existingUnit) return toPantryUnit(item.quantity, pantryUnit, item.name);

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