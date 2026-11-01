// pantry.js
// Pantry options used by the Pantry page, the shopping list and shopping mode.
// MUST match the enums in server/models/Pantry.js (UNITS and CATEGORIES).

export const PANTRY_UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup']

export const PANTRY_CATEGORIES = [
  { value: 'produce', label: 'Produce', icon: 'nutrition' },
  { value: 'meat', label: 'Meat', icon: 'kebab_dining' },
  { value: 'seafood', label: 'Seafood', icon: 'set_meal' },
  { value: 'dairy', label: 'Dairy & Eggs', icon: 'egg' },
  { value: 'grains', label: 'Grains & Bread', icon: 'grain' },
  { value: 'canned', label: 'Canned', icon: 'inventory_2' },
  { value: 'spices', label: 'Spices', icon: 'spa' },
  { value: 'condiments', label: 'Sauces & Condiments', icon: 'water_drop' },
  { value: 'frozen', label: 'Frozen', icon: 'ac_unit' },
  { value: 'other', label: 'Other', icon: 'category' },
]

// Shopping-list unit -> the pantry unit it is stored as.
// MUST match PANTRY_UNIT in server/src/services/shoppinglistbuilder.js.
// Items in other units ("1 bottle dish soap") stay on the list only.
export const LIST_TO_PANTRY_UNIT = { g: 'g', ml: 'ml', piece: 'pcs', clove: 'pcs', tsp: 'tsp', tbsp: 'tbsp', cup: 'cup' }

// "2 pieces", "1 clove", "300 g"
export function formatQty(qty, unit) {
  if (unit === 'piece' || unit === 'pcs') return qty === 1 ? '1 piece' : `${qty} pieces`
  if (unit === 'clove') return qty === 1 ? '1 clove' : `${qty} cloves`
  return `${qty} ${unit}`
}
