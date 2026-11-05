function singular(word) {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.endsWith('oes')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function normalizeIngredient(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
}

const CHANGES_PRODUCT = new Set([
  'coconut', 'almond', 'oat', 'soy', 'peanut', 'sesame', 'cashew', 'rice', 'corn',
  'sour', 'condensed', 'evaporated', 'ice', 'spring', 'sweet', 'fish', 'oyster', 'hoisin', 'cream',
  'stock', 'broth', 'bouillon', 'cube', 'noodle', 'pasta', 'flour', 'vinegar', 'wine', 'paste', 'sauce',
  'powder', 'milk', 'butter', 'oil', 'cheese', 'juice', 'syrup', 'extract', 'essence', 'jam', 'seasoning',
  'chip', 'crisp', 'bread', 'cake',
])

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