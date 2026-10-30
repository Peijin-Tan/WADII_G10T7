// ingredientNames.js
// ONE shared rule for turning an ingredient name into its matching form,
// used by both the pantry and the shopping list so their names always line up:
//   "Eggs", " egg ", "EGGS"  -> "egg"
//   "Cherry Tomatoes"        -> "cherry tomato"
//
// This is the same code as normalizeIngredient() in models/Pantry.js and
// routes/pantry/pantry.js. Those two copies can be replaced with:
//   const { normalizeIngredient } = require('../../services/ingredientNames')

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

module.exports = { normalizeIngredient }