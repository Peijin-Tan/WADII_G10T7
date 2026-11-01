// Unit tests for turning Spoonacular recipes into our Recipe documents
// (used when a Spoonacular recipe is added to the meal plan).
// Run from the server folder with:   npm test
// No real Spoonacular calls or database: inputs are shaped like Spoonacular's responses,
// and the Recipe model's database methods are replaced with fakes.

const test = require('node:test')
const assert = require('node:assert/strict')

const Recipe = require('../models/Recipe')
const { toRecipeDoc, importRecipe } = require('../src/services/spoonacular')
const { buildShoppingItems } = require('../src/services/shoppinglistbuilder')

// Shaped like GET https://api.spoonacular.com/recipes/{id}/information?includeNutrition=true
const information = {
  id: 715538,
  title: 'Bruschetta Style Pork & Pasta',
  image: 'https://img.spoonacular.com/recipes/715538-556x370.jpg',
  servings: 5,
  readyInMinutes: 35,
  preparationMinutes: -1, // Spoonacular often sends -1 or null when it doesn't know
  cookingMinutes: null,
  summary: 'A <b>tasty</b> pasta.',
  cuisines: ['Italian'],
  diets: ['dairy free'],
  sourceUrl: 'https://example.com/pasta',
  extendedIngredients: [
    { name: 'eggs', nameClean: 'egg', amount: 2, unit: 'large', aisle: 'Milk, Eggs, Other Dairy',
      measures: { metric: { amount: 2, unitShort: 'large' } } },
    { name: 'olive oil', amount: 2, unit: 'tablespoons', aisle: 'Oil, Vinegar, Salad Dressing',
      measures: { metric: { amount: 2, unitShort: 'Tbsps' } } },
    { name: 'pork chops', amount: 1, unit: 'lb', aisle: 'Meat',
      measures: { metric: { amount: 453.592, unitShort: 'g' } } },
  ],
  analyzedInstructions: [{ steps: [{ number: 1, step: 'Boil the pasta.' }, { number: 2, step: 'Brown the pork.' }] }],
  nutrition: { nutrients: [{ name: 'Calories', amount: 520.3, unit: 'kcal' }, { name: 'Protein', amount: 31, unit: 'g' }] },
}

test('a Spoonacular recipe becomes a valid Recipe document', async () => {
  const doc = toRecipeDoc(information)
  assert.equal(doc.externalId, 715538)
  assert.equal(doc.source, 'spoonacular')
  assert.equal(doc.prepTime, 35) // falls back to readyInMinutes when prep time is -1
  assert.equal(doc.instructions.length, 2)
  await new Recipe(doc).validate() // throws if a required field is missing
})

test('ingredients use metric amounts, with "piece" for counted items', () => {
  const [egg, oil, pork] = toRecipeDoc(information).ingredients
  assert.deepEqual(egg, { name: 'egg', amount: 2, unit: 'large', aisle: 'Milk, Eggs, Other Dairy' })
  assert.equal(oil.unit, 'tbsps')
  assert.deepEqual([pork.amount, pork.unit], [453.59, 'g']) // not "1 lb"
})

test('search results with only per-serving ingredients are scaled to the whole recipe', () => {
  const doc = toRecipeDoc({ id: 1, title: 'Rice bowl', servings: 4, readyInMinutes: 20,
    nutrition: { nutrients: [], ingredients: [{ name: 'rice', amount: 50, unit: 'g' }] } })
  assert.deepEqual(doc.ingredients[0], { name: 'rice', amount: 200, unit: 'g', aisle: '' })
  assert.ok(doc.image.includes('/recipes/1-')) // a missing image gets Spoonacular's standard image URL
})

test('an imported recipe works with the shopping list (tbsp, aisles -> sections)', () => {
  const doc = toRecipeDoc(information)
  const items = buildShoppingItems([{
    status: 'Planned', recipeId: 'r1', title: doc.title, recipeServings: doc.servings, plannedServings: 5,
    ingredients: doc.ingredients.map((i) => ({ name: i.name, quantity: i.amount, unit: i.unit, aisle: i.aisle })),
  }])
  const byName = Object.fromEntries(items.map((i) => [i.name.toLowerCase(), i]))
  assert.equal(byName['olive oil'].unit, 'tbsp')
  assert.equal(byName.egg.category, 'dairy-eggs') // from the aisle, instead of everything in "Other"
  assert.equal(byName['pork chops'].category, 'meat-seafood')
})

test('a recipe added before is reused, not fetched from Spoonacular again', async (t) => {
  const saved = { _id: 'abc', externalId: 715538, title: 'Saved copy' }
  t.mock.method(Recipe, 'findOne', async () => saved)
  const create = t.mock.method(Recipe, 'create', async () => assert.fail('should not create a duplicate'))
  assert.equal(await importRecipe(715538), saved)
  assert.equal(create.mock.callCount(), 0)
})
