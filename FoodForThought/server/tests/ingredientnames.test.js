// Tests for how pantry names are matched to recipe ingredients (services/ingredientnames.js).
// The planner (pantry match %, cooking deductions) and the shopping list all use this one rule.
// Run from the server folder with:   npm test

const test = require('node:test')
const assert = require('node:assert/strict')

const { ingredientMatches } = require('../src/services/ingredientnames')
const { buildShoppingItems } = require('../src/services/shoppinglistbuilder')

const matches = (pantry, recipe) => ingredientMatches(pantry, recipe)

test('the same thing described differently still matches', () => {
  assert.equal(matches('chicken', 'chicken breast'), true)
  assert.equal(matches('chicken', 'boneless skinless chicken thigh'), true)
  assert.equal(matches('milk', 'fresh milk'), true)
  assert.equal(matches('milk', 'whole milk'), true)
  assert.equal(matches('rice', 'cooked jasmine rice'), true)
  assert.equal(matches('soy sauce', 'light soy sauce'), true)
  assert.equal(matches('garlic', 'garlic cloves'), true)
  assert.equal(matches('Eggs', 'large egg'), true)
  assert.equal(matches('oil', 'olive oil'), true)
})

test('a different product made with the same word does NOT match', () => {
  assert.equal(matches('milk', 'coconut milk'), false)
  assert.equal(matches('milk', 'almond milk'), false)
  assert.equal(matches('milk', 'condensed milk'), false)
  assert.equal(matches('butter', 'peanut butter'), false)
  assert.equal(matches('chicken', 'chicken stock'), false)
  assert.equal(matches('chicken', 'chicken broth'), false)
  assert.equal(matches('rice', 'rice noodles'), false)
  assert.equal(matches('rice', 'rice vinegar'), false)
  assert.equal(matches('flour', 'rice flour'), false)
  assert.equal(matches('egg', 'egg noodles'), false)
  assert.equal(matches('tomato', 'tomato paste'), false)
  assert.equal(matches('garlic', 'garlic powder'), false)
  assert.equal(matches('cream', 'sour cream'), false)
  assert.equal(matches('cheese', 'cream cheese'), false)
  assert.equal(matches('onion', 'spring onions'), false)
  assert.equal(matches('oil', 'sesame oil'), false)
  assert.equal(matches('lemon', 'lemon juice'), false)
})

test('it works both ways round: coconut milk in the pantry does not cover "milk"', () => {
  assert.equal(matches('coconut milk', 'milk'), false)
  assert.equal(matches('chicken stock', 'chicken'), false)
  assert.equal(matches('coconut milk', 'coconut milk'), true)
})

test('different words never match ("egg" is not "eggplant", "salt" is not "unsalted")', () => {
  assert.equal(matches('egg', 'eggplant'), false)
  assert.equal(matches('salt', 'unsalted butter'), false)
})

test('shopping list: pantry milk no longer counts towards coconut milk', () => {
  const laksa = {
    status: 'Planned', recipeId: 'laksa', title: 'Laksa', recipeServings: 2, plannedServings: 2,
    ingredients: [{ name: 'coconut milk', quantity: 400, unit: 'ml' }],
  }
  const [line] = buildShoppingItems([laksa], [{ name: 'Milk', quantity: 1, unit: 'l' }])
  assert.equal(line.quantity, 400) // still to buy
  assert.equal(line.pantryQuantity, 0)
})
