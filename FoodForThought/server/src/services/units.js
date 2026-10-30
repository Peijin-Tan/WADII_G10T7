// units.js
// ONE shared rule for comparing amounts in different units, used by the planner
// (cooking deducts from the pantry), the pantry (adding to an item you already have)
// and the shopping list (subtracting what the pantry covers). Before this file each
// feature had its own rule, so e.g. "1 cup milk" was deducted from "500 ml milk"
// when cooking, but the shopping list still said "buy 1 cup".
//
//   convertAmount(2, 'tbsp', 'ml')  -> 29.58
//   convertAmount(500, 'g', 'kg')   -> 0.5
//   convertAmount(2, 'cups', 'g')   -> null   (volume can't become weight)

// Recipe units (from Spoonacular or users) -> the units the pantry allows (Pantry.UNITS)
const UNIT_ALIASES = {
  g: 'g', gram: 'g', grams: 'g', gm: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  // anything counted one by one ("2 eggs", "3 cloves garlic") is treated as pieces
  '': 'pcs', pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs', whole: 'pcs',
  small: 'pcs', medium: 'pcs', large: 'pcs', clove: 'pcs', cloves: 'pcs', slice: 'pcs', slices: 'pcs',
}

// How each pantry unit converts to a base unit within its group (weight in g, volume in ml, count)
const UNIT_BASE = {
  g: ['weight', 1], kg: ['weight', 1000],
  ml: ['volume', 1], l: ['volume', 1000], tsp: ['volume', 4.93], tbsp: ['volume', 14.79], cup: ['volume', 240],
  pcs: ['count', 1],
}

// 'Tablespoons.' -> { group: 'volume', factor: 14.79 }, or null for units we don't know ("can", "pinch")
function unitInfo(unit) {
  const key = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '')
  const base = UNIT_BASE[UNIT_ALIASES[key]]
  return base ? { group: base[0], factor: base[1] } : null
}

// Converts an amount from one unit into another.
// Returns null when they can't be compared (e.g. "2 cups" of rice vs a pantry stored in g).
function convertAmount(amount, fromUnit, toUnit) {
  const from = unitInfo(fromUnit)
  const to = unitInfo(toUnit)
  if (!from || !to || from.group !== to.group) return null
  return (amount * from.factor) / to.factor
}

module.exports = { unitInfo, convertAmount }
