// Unit tests for how the meal planner, shopping list and pantry work together.
// Run from the server folder with:   npm test
// Uses Node's built-in test runner (node:test), so there's nothing extra to install,
// and no database: the shopping-list builder is a pure function, and the one
// database call (saved preferences) is replaced with a fake for the test.

const test = require('node:test')
const assert = require('node:assert/strict')

const { buildShoppingItems, pantryAmount } = require('../src/services/shoppinglistbuilder')
const { convertAmount } = require('../src/services/units')
const { ingredientMatches } = require('../src/services/ingredientnames')
const { pantryBeforeCooking } = require('../src/router/shoppinglist')
const UserPreference = require('../models/UserPreference')
const { getSavedPreferences } = require('../src/router/pantry')

// A planned meal in the shape buildShoppingItems expects
function meal(status, ingredients, { title = 'Omelette', recipeServings = 1, plannedServings = 1 } = {}) {
  return { status, recipeId: `${title}-${status}`, title, recipeServings, plannedServings, ingredients }
}
const omelette = (status) => meal(status, [{ name: 'eggs', quantity: 2, unit: 'large' }])
const toBuy = (items, name) => items.find((i) => i.name.toLowerCase() === name).quantity

/* ---------- Bug 1: cooked meals counted twice ---------- */

test('cooking a meal does not add its ingredients back onto the shopping list', () => {
  // 4 eggs at home, two 2-egg omelettes planned -> nothing to buy
  const before = buildShoppingItems([omelette('Planned'), omelette('Planned')], [{ name: 'egg', quantity: 4, unit: 'pcs' }])
  assert.equal(toBuy(before, 'eggs'), 0)

  // Cook one: the planner takes 2 eggs out of the pantry and remembers it on the entry
  const plan = {
    entries: [
      { status: 'Cooked', pantryDeductions: [{ name: 'egg', quantity: 2, unit: 'pcs' }] },
      { status: 'Planned', pantryDeductions: [] },
    ],
  }
  const pantryNow = [{ name: 'egg', quantity: 2, unit: 'pcs' }]
  const after = buildShoppingItems([omelette('Cooked'), omelette('Planned')], pantryBeforeCooking(pantryNow, plan))
  assert.equal(toBuy(after, 'eggs'), 0) // was 2 before the fix
})

test('skipped and planned meals do not give anything back to the pantry', () => {
  const plan = { entries: [{ status: 'Skipped', pantryDeductions: [] }, { status: 'Planned' }] }
  assert.deepEqual(pantryBeforeCooking([{ name: 'egg', quantity: 1, unit: 'pcs' }], plan), [{ name: 'egg', quantity: 1, unit: 'pcs' }])
  assert.deepEqual(pantryBeforeCooking([], null), []) // no meal plan for that week
})

/* ---------- Bug 2: planner and shopping list matched names differently ---------- */

test('pantry "chicken" covers a recipe\'s "chicken breast", like it does when cooking', () => {
  assert.equal(ingredientMatches('chicken', 'chicken breast'), true)
  const items = buildShoppingItems(
    [meal('Planned', [{ name: 'chicken breast', quantity: 300, unit: 'g' }])],
    [{ name: 'chicken', quantity: 1, unit: 'kg' }],
  )
  assert.equal(toBuy(items, 'chicken breast'), 0)
})

test('whole-word matching: pantry "egg" does not cover "eggplant"', () => {
  const items = buildShoppingItems(
    [meal('Planned', [{ name: 'eggplant', quantity: 1, unit: '' }])],
    [{ name: 'egg', quantity: 6, unit: 'pcs' }],
  )
  assert.equal(toBuy(items, 'eggplant'), 1)
})

test('one pantry row is not used up twice by two different recipes', () => {
  // 1 kg chicken can cover 800 g breast OR 800 g thigh, not both
  const items = buildShoppingItems(
    [
      meal('Planned', [{ name: 'chicken breast', quantity: 800, unit: 'g' }], { title: 'A' }),
      meal('Planned', [{ name: 'chicken thigh', quantity: 800, unit: 'g' }], { title: 'B' }),
    ],
    [{ name: 'chicken', quantity: 1, unit: 'kg' }],
  )
  const total = toBuy(items, 'chicken breast') + toBuy(items, 'chicken thigh')
  assert.equal(total, 600) // 1600 g needed - 1000 g in pantry
})

test('an exact pantry match is used before a partial one', () => {
  // "chicken breast" in the pantry should go to the breast recipe, not be taken by the plain "chicken" one
  const items = buildShoppingItems(
    [
      meal('Planned', [{ name: 'chicken', quantity: 500, unit: 'g' }], { title: 'A' }),
      meal('Planned', [{ name: 'chicken breast', quantity: 500, unit: 'g' }], { title: 'B' }),
    ],
    [{ name: 'chicken breast', quantity: 500, unit: 'g' }],
  )
  assert.equal(toBuy(items, 'chicken breast'), 0)
  assert.equal(toBuy(items, 'chicken'), 500)
})

/* ---------- Bug 6: different units ---------- */

test('pantry milk in ml covers a recipe that uses cups', () => {
  const items = buildShoppingItems(
    [meal('Planned', [{ name: 'milk', quantity: 1, unit: 'cup' }])],
    [{ name: 'milk', quantity: 500, unit: 'ml' }],
  )
  assert.equal(toBuy(items, 'milk'), 0) // 1 cup = 240 ml
})

test('weight and volume are never mixed up', () => {
  assert.equal(convertAmount(2, 'cups', 'g'), null)
  const items = buildShoppingItems(
    [meal('Planned', [{ name: 'rice', quantity: 2, unit: 'cups' }])],
    [{ name: 'rice', quantity: 1, unit: 'kg' }],
  )
  assert.equal(toBuy(items, 'rice'), 2) // can't tell how many cups 1 kg is, so still buy it
})

test('bought tablespoons can be added to a pantry item stored in ml', () => {
  assert.deepEqual(pantryAmount({ quantity: 2, unit: 'tbsp' }, 'ml'), { quantity: 29.58, unit: 'ml' })
  assert.deepEqual(pantryAmount({ quantity: 300, unit: 'g' }, 'kg'), { quantity: 0.3, unit: 'kg' })
  assert.ok(pantryAmount({ quantity: 200, unit: 'g' }, 'cup').skip)
})

/* ---------- Bug 4: adding to an item you already have ---------- */

test('adding 500 g to "1 kg rice" adds 0.5 kg, not 500 kg', () => {
  assert.equal(convertAmount(500, 'g', 'kg'), 0.5)
  assert.equal(convertAmount(3, 'pcs', 'pcs'), 3)
})

/* ---------- Bug 3: saved dietary preferences ---------- */

test('saved preferences are translated into Spoonacular diets and intolerances', async (t) => {
  // Fake the database call: this user saved these on the Dietary Preferences page
  t.mock.method(UserPreference, 'findOne', () => ({
    lean: async () => ({
      dietaryPreferences: ['Pescatarian', 'Dairy-Free', 'Keto'],
      allergens: ['Peanuts', 'Tree Nuts', 'Fish'],
    }),
  }))
  const prefs = await getSavedPreferences('someUserId')
  assert.deepEqual(prefs.diets, ['pescetarian', 'ketogenic'])
  assert.deepEqual(prefs.intolerances, ['dairy', 'peanut', 'tree nut', 'seafood'])
})

test('a user with no saved preferences gets no filters', async (t) => {
  t.mock.method(UserPreference, 'findOne', () => ({ lean: async () => null }))
  assert.deepEqual(await getSavedPreferences('someUserId'), { diets: [], intolerances: [] })
})
