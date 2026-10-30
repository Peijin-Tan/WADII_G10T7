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

// True if a pantry name and a recipe ingredient name are the same thing.
// Matches WHOLE WORDS: every word of the shorter name must be in the longer one.
//   "chicken" vs "chicken breast"  -> true
// so both agree on whether the pantry covers an ingredient.
function ingredientMatches(pantryName, recipeName) {
  const a = normalizeIngredient(pantryName).split(' ').filter(Boolean)
  const b = normalizeIngredient(recipeName).split(' ').filter(Boolean)
  if (!a.length || !b.length) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerSet = new Set(longer)
  return shorter.every((w) => longerSet.has(w))
}

module.exports = { normalizeIngredient, ingredientMatches }
