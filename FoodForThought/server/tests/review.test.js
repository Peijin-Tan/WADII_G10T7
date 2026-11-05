const test = require('node:test')
const assert = require('node:assert/strict')

const { buildShoppingItems, roundQuantity } = require('../src/services/shoppinglistbuilder')
const { checkEdits } = require('../src/router/pantry')

test('things bought whole round up: half a jar of paste is one jar', () => {
  assert.equal(roundQuantity(0.5, 'jar'), 1)
  assert.equal(roundQuantity(1.2, 'stalk'), 2)
  assert.equal(roundQuantity(2, 'can'), 2)
  assert.equal(roundQuantity(1.25, 'tsp'), 1.25)
  assert.equal(roundQuantity(199.6, 'g'), 200)
})

test('a 4-serving recipe planned for 2 asks for 1 jar, not 0.5', () => {
  const items = buildShoppingItems([{
    status: 'Planned', recipeId: 'laksa', title: 'Laksa', recipeServings: 4, plannedServings: 2,
    ingredients: [{ name: 'laksa paste', quantity: 1, unit: 'jar' }],
  }])
  assert.equal(items[0].quantity, 1)
  assert.equal(items[0].unit, 'jar')
})

test('pantry edit: an emptied quantity box is rejected instead of saving null', () => {
  assert.throws(() => checkEdits({ quantity: '' }), /Quantity must be 0 or more/)
  assert.throws(() => checkEdits({ quantity: null }), /Quantity must be 0 or more/)
  assert.throws(() => checkEdits({ quantity: -2 }), /Quantity must be 0 or more/)
  assert.deepEqual(checkEdits({ quantity: '3' }), { quantity: 3 })
  assert.deepEqual(checkEdits({ quantity: 0 }), { quantity: 0 })
})

test('pantry edit: blank name and bad dates get clear messages, empty date clears it', () => {
  assert.throws(() => checkEdits({ name: '   ' }), /name is required/)
  assert.throws(() => checkEdits({ expiryDate: 'not-a-date' }), /valid date/)
  assert.deepEqual(checkEdits({ expiryDate: '' }), { expiryDate: null })
})
