const test = require('node:test')
const assert = require('node:assert/strict')
const { categorize, buildShoppingItems } = require('../src/services/shoppinglistbuilder')

// Recipes people create have no "aisle", so the section must come from the ingredient name
test('user recipe ingredients (no aisle) go to their own section, not "Other"', () => {
  const cases = {
    Eggs: 'dairy-eggs',
    'Chicken thigh': 'meat-seafood',
    Prawns: 'meat-seafood',
    'Jasmine rice': 'grains-noodles',
    Garlic: 'produce',
    'Spring onions': 'produce',
    'Soy sauce': 'canned-sauces',
    Salt: 'spices-condiments',
    'Frozen peas': 'frozen',
    'Dish soap': 'other',
  }
  for (const [name, section] of Object.entries(cases)) {
    assert.equal(categorize({ name }), section, name)
  }
})

test('more specific names win: coconut milk, chicken stock, egg noodles, eggplant, bell pepper', () => {
  assert.equal(categorize({ name: 'Coconut milk' }), 'canned-sauces')
  assert.equal(categorize({ name: 'Chicken stock' }), 'canned-sauces')
  assert.equal(categorize({ name: 'Egg noodles' }), 'grains-noodles')
  assert.equal(categorize({ name: 'Eggplant' }), 'produce')
  assert.equal(categorize({ name: 'Red bell pepper' }), 'produce')
  assert.equal(categorize({ name: 'Black pepper' }), 'spices-condiments')
  assert.equal(categorize({ name: 'Rice vinegar' }), 'spices-condiments')
})

test('a valid category or Spoonacular aisle still comes first', () => {
  assert.equal(categorize({ name: 'Eggs', category: 'other' }), 'other')
  assert.equal(categorize({ name: 'Mystery', aisle: 'Milk, Eggs, Other Dairy' }), 'dairy-eggs')
})

test('a whole list from a user recipe is spread over the sections', () => {
  const meals = [{
    status: 'Planned', recipeId: 'r1', title: 'Egg fried rice', recipeServings: 2, plannedServings: 2,
    ingredients: [
      { name: 'Eggs', quantity: 2, unit: 'piece' },
      { name: 'Jasmine rice', quantity: 200, unit: 'g' },
      { name: 'Soy sauce', quantity: 1, unit: 'tbsp' },
      { name: 'Spring onion', quantity: 1, unit: 'piece' },
    ],
  }]
  const sections = buildShoppingItems(meals, []).map((i) => `${i.name}:${i.category}`).sort()
  assert.deepEqual(sections, ['Eggs:dairy-eggs', 'Jasmine rice:grains-noodles', 'Soy sauce:canned-sauces', 'Spring onion:produce'])
})
