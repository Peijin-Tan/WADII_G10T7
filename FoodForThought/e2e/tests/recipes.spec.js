import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { api, logIn, mondayISO } from '../support/session.js'
import { cleanUpUsers, createUser, requireAdminAccount, uniqueTag } from '../support/accounts.js'

const photo = fileURLToPath(new URL('../fixtures/dish.png', import.meta.url))

let cook
test.afterEach(async ({ request }) => {
  if (!cook) return
  const client = api(request, { Authorization: `Bearer ${cook.token}` })
  for (const recipe of (await client.get('/recipes/mine')).data || []) await client.delete(`/recipes/${recipe._id}`)
  cook = undefined
})
const made = cleanUpUsers(test)

test('R01 create, open, plan, edit and delete a recipe', async ({ page, request }, testInfo) => {
  requireAdminAccount()
  const title = `E2E Laksa ${uniqueTag(testInfo)}`
  const renamed = `${title} v2`
  const user = await createUser(request, 'Cook', testInfo, made)
  cook = user
  await logIn(page, { as: user })

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
  await expect(create).toBeEnabled({ timeout: 10_000 })
  await create.click()
  await expect(page).toHaveURL(/\/recipes$/)

  await page.getByRole('link', { name: title, exact: true }).click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'rice noodles 200 g' })).toBeVisible()

  await page.getByRole('button', { name: "+ Add to Today's Meal Plan" }).click()
  const modal = page.locator('.rd-modal').filter({ has: page.getByRole('heading', { name: "Add to Today's Meal Plan" }) })
  await modal.locator('select').selectOption('dinner')
  await modal.getByRole('button', { name: 'Add Recipe', exact: true }).click()
  await expect(page).toHaveURL(/\/planner$/)
  await expect(page.getByTestId('meal-card').filter({ hasText: title })).toBeVisible()
  const week = await user.client.get(`/planner?start=${mondayISO()}`)
  expect(week.entries).toEqual([expect.objectContaining({ mealSlot: 'dinner', dayOfWeek: (new Date().getDay() + 6) % 7 })])

  await page.goto('/profile')
  const mine = page.locator('.my-recipe-item').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await mine.getByRole('button', { name: /Edit/ }).click()
  await expect(page).toHaveURL(/\/edit$/)
  await page.getByPlaceholder('Recipe title').fill(renamed)
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.getByRole('heading', { name: renamed, level: 1 })).toBeVisible()

  await page.goto('/profile')
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.my-recipe-item').filter({ hasText: renamed }).getByRole('button', { name: /Delete/ }).click()
  await expect(page.getByRole('heading', { name: 'No recipes yet' })).toBeVisible()
  const left = await user.client.get('/recipes/mine')
  expect(left.data).toHaveLength(0)
})
