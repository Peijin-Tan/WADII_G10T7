// recipes.spec.js - the recipe journey: create a recipe with a photo, open it from the Recipes list,
// add it to today's plan from its page, edit it and delete it from the Profile page.
// Uses a throwaway user (needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to remove it afterwards),
// so "My Created Recipes" and the planner only contain what this test made.
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { api, logIn, mondayISO } from '../support/session.js'
import { cleanUpUsers, createUser, requireAdminAccount, uniqueTag } from '../support/accounts.js'

const photo = fileURLToPath(new URL('../fixtures/dish.png', import.meta.url))

let cook // the throwaway user, kept so afterEach can remove a recipe a failed run left behind
test.afterEach(async ({ request }) => {
  if (!cook) return
  // deleting a user does not delete their recipes, so remove any that are still there first
  const client = api(request, { Authorization: `Bearer ${cook.token}` })
  for (const recipe of (await client.get('/recipes/mine')).data || []) await client.delete(`/recipes/${recipe._id}`)
  cook = undefined
})
const made = cleanUpUsers(test) // registered after the hook above, so it runs after it

test('R01 create, open, plan, edit and delete a recipe', async ({ page, request }, testInfo) => {
  requireAdminAccount()
  const title = `E2E Laksa ${uniqueTag(testInfo)}`
  const renamed = `${title} v2`
  const user = await createUser(request, 'Cook', testInfo, made)
  cook = user
  await logIn(page, { as: user })

  // 1. Create: the button stays disabled until a photo has uploaded
  await page.goto('/recipes/create')
  const create = page.getByRole('button', { name: 'Create Recipe', exact: true })
  await expect(create).toBeDisabled()
  await page.getByPlaceholder('e.g. Chicken Fried Rice').fill(title)
  await page.locator('input[type="file"]').setInputFiles(photo)
  await page.getByPlaceholder('Describe your recipe...').fill('Spicy coconut noodle soup.')
  await page.getByPlaceholder('Ingredient name').fill('rice noodles')
  await page.getByRole('spinbutton', { name: 'Amount' }).fill('200')
  await page.getByPlaceholder('Unit').fill('g')
  await page.getByPlaceholder('Describe this cooking step...').fill('Boil the noodles and add the broth.')
  await expect(create).toBeEnabled({ timeout: 10_000 }) // photo uploaded
  await create.click()
  await expect(page).toHaveURL(/\/recipes$/)

  // 2. It is listed on the Recipes page; open it
  // (opened from the list, not with Search: Search also asks Spoonacular and fails when its daily quota is used up)
  await page.getByRole('link', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'rice noodles 200 g' })).toBeVisible()

  // 3. Add to today's dinner from the recipe page -> it is in the planner
  await page.getByRole('button', { name: "+ Add to Today's Meal Plan" }).click()
  // the pop-up has no dialog role or linked labels, so it is found by its heading
  const modal = page.locator('.rd-modal').filter({ has: page.getByRole('heading', { name: "Add to Today's Meal Plan" }) })
  await modal.locator('select').selectOption('dinner') // its only drop-down: Meal Slot
  await modal.getByRole('button', { name: 'Add Recipe', exact: true }).click()
  await expect(page).toHaveURL(/\/planner$/)
  await expect(page.getByTestId('meal-card').filter({ hasText: title })).toBeVisible()
  const week = await user.client.get(`/planner?start=${mondayISO()}`)
  expect(week.entries).toEqual([expect.objectContaining({ mealSlot: 'dinner', dayOfWeek: (new Date().getDay() + 6) % 7 })])

  // 4. Edit it from Profile > My Created Recipes
  await page.goto('/profile')
  const mine = page.locator('.my-recipe-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await mine.getByRole('button', { name: /Edit/ }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.getByPlaceholder('Recipe title').fill(renamed)
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('heading', { name: renamed, level: 1 })).toBeVisible()

  // 5. Delete it (the page asks first) -> gone from Profile and from the server
  await page.goto('/profile')
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.my-recipe-item').filter({ hasText: renamed }).getByRole('button', { name: /Delete/ }).click()
  await expect(page.getByRole('heading', { name: 'No recipes yet' })).toBeVisible()
  const left = await user.client.get('/recipes/mine')
  expect(left.data).toHaveLength(0)
})
