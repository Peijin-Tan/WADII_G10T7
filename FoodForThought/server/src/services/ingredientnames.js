// ingredientNames.js
// ONE shared rule for turning an ingredient name into its matching form,
// used by both the pantry and the shopping list so their names always line up:
//   "Eggs", " egg ", "EGGS"  -> "egg"
//   "Cherry Tomatoes"        -> "cherry tomato"
//
// models/Pantry.js and router/pantry.js both use this file, so there is only one copy.

// very small plural -> singular rule set, applied to one word
function singular(word) {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y' // berries -> berry
  if (word.endsWith('oes')) return word.slice(0, -2) // tomatoes -> tomato
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1) // eggs -> egg
  return word
}

function normalizeIngredient(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // drop punctuation and numbers
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
}

// Words that turn an ingredient into a DIFFERENT product when they're added to its name.
// "milk" + "coconut" is coconut milk, not milk; "chicken" + "stock" is stock, not chicken.
// Words not listed here just describe the same thing ("fresh", "chicken BREAST", "JASMINE rice"),
// so those still match. Words are singular, because names are normalized first.
const CHANGES_PRODUCT = new Set([
  // ... + milk / cream / butter / oil / flour made from something else
  'coconut', 'almond', 'oat', 'soy', 'peanut', 'sesame', 'cashew', 'rice', 'corn',
  // a different kind of the same word
  'sour', 'condensed', 'evaporated', 'ice', 'spring', 'sweet', 'fish', 'oyster', 'hoisin', 'cream',
  // products made FROM the ingredient
  'stock', 'broth', 'bouillon', 'cube', 'noodle', 'pasta', 'flour', 'vinegar', 'wine', 'paste', 'sauce',
  'powder', 'milk', 'butter', 'oil', 'cheese', 'juice', 'syrup', 'extract', 'essence', 'jam', 'seasoning',
  'chip', 'crisp', 'bread', 'cake',
])

// True if a pantry name and a recipe ingredient name are the same thing.
// 1. Whole words only: every word of the shorter name must be in the longer one.
// 2. The longer name's extra words must only DESCRIBE it, not make it another product.
//   "chicken"  vs "chicken breast"   -> true   (breast is a cut of chicken)
//   "milk"     vs "fresh milk"       -> true
//   "rice"     vs "jasmine rice"     -> true
//   "milk"     vs "coconut milk"     -> false  (coconut milk is a different product)
//   "butter"   vs "peanut butter"    -> false
//   "chicken"  vs "chicken stock"    -> false
//   "egg"      vs "eggplant"         -> false  (not the same word)
// Works both ways round, so pantry "coconut milk" doesn't cover a recipe's "milk" either.
// Used by the planner (pantry match %, cooking deductions) AND the shopping list,
// so both agree on whether the pantry covers an ingredient.
function ingredientMatches(pantryName, recipeName) {
  const a = normalizeIngredient(pantryName).split(' ').filter(Boolean)
  const b = normalizeIngredient(recipeName).split(' ').filter(Boolean)
  if (!a.length || !b.length) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const shorterSet = new Set(shorter)
  const longerSet = new Set(longer)
  if (!shorter.every((w) => longerSet.has(w))) return false
  const extra = longer.filter((w) => !shorterSet.has(w))
  return !extra.some((w) => CHANGES_PRODUCT.has(w))
}

module.exports = { normalizeIngredient, ingredientMatches }