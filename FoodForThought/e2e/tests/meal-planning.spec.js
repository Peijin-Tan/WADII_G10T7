// meal-planning.spec.js - End-to-end tests for the weekly planner, shopping list, pantry and app shell.
// Real browser + real Vue app + real Express server + real MongoDB (nothing is faked).
//
// Before running (see README "Testing"):
//   cd server && npm start                                   # backend on http://localhost:8000
//   E2E_EMAIL=<test account> E2E_PASSWORD=<password> npx playwright test e2e/tests/meal-planning.spec.js
//
// Every test makes its own data with unique names and removes it in `finally`, so the tests can be
// run again and again (and in any order) and leave the account as they found it.
import { test, expect } from '@playwright/test'
import { logIn, authHeaders, api, mondayISO, uniqueName, restorePantry } from '../support/session'

/* ======================================================================
   Journey 1: Plan a meal -> build the shopping list -> buy -> pantry
   This is the app's core loop. It changes the planner, list and pantry of
   the test account, so it runs once (in Chromium) rather than in all three
   browsers at the same time, where the runs would edit the same data.
   ====================================================================== */
test.describe('Weekly plan -> shopping list -> pantry', () => {
  test.describe.configure({ mode: 'serial' })

  test('J01 plan a meal, cook it, build its list, buy an item and find it in the pantry', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Edits shared account data: run once, in Chromium')
    test.setTimeout(90_000)

    await logIn(page)
    const client = api(request, await authHeaders(page))

    // A week far enough ahead that no real plan is in it. Clear it so every run starts the same.
    const WEEKS_AHEAD = 8
    const week = mondayISO(WEEKS_AHEAD)
    for (const entry of (await client.get(`/planner?start=${week}`)).entries) {
      await client.delete(`/planner/entries/${entry.id}`)
    }
    const pantryBefore = (await client.get('/pantry')).items
    const [recipe] = await client.get('/planner/recipe-options?limit=5') // what "Quick Suggestions" will show first
    expect(recipe, 'The database needs at least one saved recipe').toBeTruthy()
    const extra = uniqueName('E2E oats', testInfo)
    let addedListItemId

    try {
      /* ---- 1. Planner: go to the empty week and add a dinner ---- */
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Weekly Plan' }).click()
      await expect(page).toHaveURL(/\/planner$/)
      for (let i = 0; i < WEEKS_AHEAD; i++) await page.getByRole('button', { name: 'Next week' }).click()
      await expect(page.getByText(`${WEEKS_AHEAD} weeks ahead`)).toBeVisible()
      await page.getByRole('button', { name: /^Mon \d+/ }).click()
      await expect(page.getByRole('heading', { name: /Nothing planned for Monday/ })).toBeVisible()

      await page.getByRole('button', { name: /Add Meal/ }).click()
      const addMeal = page.getByRole('dialog', { name: 'Add Meal' })
      await addMeal.getByRole('button', { name: 'Dinner', exact: true }).click()
      await addMeal.getByTestId('add-meal-quick').getByRole('button', { name: recipe.title }).first().click()
      await addMeal.getByRole('button', { name: /Add to plan/ }).click()
      await expect(addMeal).toBeHidden()

      const card = page.getByTestId('meal-card').filter({ hasText: recipe.title })
      await expect(card).toBeVisible()
      await expect(card.getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'true')

      /* ---- 2. Cooking takes ingredients out of the pantry; undoing puts them back ---- */
      await card.getByRole('radio', { name: 'Cooked' }).click()
      await expect(card.getByRole('radio', { name: 'Cooked' })).toHaveAttribute('aria-checked', 'true')
      // a short message says what came out of the pantry (or that nothing did)
      await expect(page.getByRole('status').filter({ hasText: /Deducted from your pantry|None of its ingredients/ })).toBeVisible()
      await card.getByRole('radio', { name: 'Planned' }).click()
      await expect(card.getByRole('radio', { name: 'Planned' })).toHaveAttribute('aria-checked', 'true')

      // The plan is saved on the server: it is still there after a reload
      await page.reload()
      for (let i = 0; i < WEEKS_AHEAD; i++) await page.getByRole('button', { name: 'Next week' }).click()
      await page.getByRole('button', { name: /^Mon \d+/ }).click()
      await expect(page.getByTestId('meal-card').filter({ hasText: recipe.title })).toBeVisible()

      /* ---- 3. Build the shopping list for the same week ---- */
      await page.getByRole('button', { name: /Build Shopping List/ }).click()
      await expect(page).toHaveURL(new RegExp(`/shoppinglist\\?start=${week}$`))
      await expect(page.getByRole('heading', { name: 'Shopping List', level: 1 })).toBeVisible()
      await expect(page.getByText(/From 1 recipe in your meal plan/)).toBeVisible()

      /* ---- 4. Add our own item, tick it as bought, move it into the pantry ---- */
      await page.getByLabel('Item name').fill(extra)
      await page.getByLabel('Quantity').fill('500')
      await page.getByLabel('Unit').selectOption('g')
      await page.getByLabel('Section').selectOption('grains-noodles')
      const added = page.waitForResponse((r) => r.url().endsWith('/shoppinglist/items') && r.request().method() === 'POST')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      addedListItemId = (await (await added).json())._id

      const row = page.getByTestId('shopping-item').filter({ hasText: extra })
      await expect(row).toContainText('Added by you')
      const ticked = page.waitForResponse((r) => r.url().endsWith(`/shoppinglist/items/${addedListItemId}`) && r.request().method() === 'PATCH')
      await row.getByLabel(`Bought ${extra}`).check()
      expect((await ticked).ok()).toBeTruthy()

      await page.reload() // the tick was saved
      await expect(page.getByTestId('shopping-item').filter({ hasText: extra }).getByLabel(`Bought ${extra}`)).toBeChecked()

      await page.getByRole('button', { name: /bought to pantry/ }).click()
      await expect(page.getByText('Pantry updated')).toBeVisible()
      await expect(page.getByTestId('shopping-item').filter({ hasText: extra })).toContainText('Added to pantry')

      /* ---- 5. The pantry now has it ---- */
      await page.getByRole('link', { name: 'See your pantry' }).click()
      await expect(page).toHaveURL(/\/pantry$/)
      await page.getByLabel('Search your pantry').fill(extra)
      const pantryRow = page.getByTestId('pantry-item').filter({ hasText: extra })
      await expect(pantryRow.getByTestId('pantry-item-qty')).toHaveText('500 g')
    } finally {
      // Leave the account as we found it
      for (const entry of (await client.get(`/planner?start=${week}`)).entries) {
        await client.delete(`/planner/entries/${entry.id}`)
      }
      if (addedListItemId) await client.delete(`/shoppinglist/items/${addedListItemId}`)
      await restorePantry(client, pantryBefore, [extra], { restoreAmounts: true })
    }
  })
})

/* ======================================================================
   Journey 2: Keeping the pantry up to date (add, adjust, edit, remove)
   Uses a uniquely named ingredient, so it is safe in all three browsers.
   ====================================================================== */
test.describe('Pantry', () => {
  test('J02 add an ingredient, change the amount, edit it and remove it; every change survives a reload', async ({ page, request }, testInfo) => {
    await logIn(page)
    const client = api(request, await authHeaders(page))
    const pantryBefore = (await client.get('/pantry')).items
    const name = uniqueName('E2E basil', testInfo)
    const renamed = `${name} (Thai)`
    const rowFor = (n) => page.getByTestId('pantry-item').filter({ hasText: n })

    try {
      await page.goto('/pantry')
      await expect(page.getByRole('heading', { name: 'My Pantry' })).toBeVisible()

      /* Add, with a use-by date 2 days from now */
      const form = page.getByTestId('pantry-form')
      await page.getByTestId('pantry-name').fill(name)
      await page.getByTestId('pantry-qty').fill('2')
      await form.getByLabel('Unit').selectOption('pcs')
      await form.getByLabel('Category').selectOption('produce')
      const inTwoDays = new Date()
      inTwoDays.setDate(inTwoDays.getDate() + 2)
      await form.getByLabel(/Use by/).fill(inTwoDays.toLocaleDateString('en-CA')) // YYYY-MM-DD
      await page.getByTestId('pantry-add').click()

      await expect(page.getByTestId('pantry-notice')).toContainText(`Added ${name}`)
      await expect(rowFor(name)).toContainText('2d left')
      await expect(rowFor(name).getByTestId('pantry-item-qty')).toHaveText('2 pcs')

      /* "Use within 3 days" shows it */
      await page.getByRole('button', { name: /Use Within 3 Days/ }).click()
      await expect(rowFor(name)).toBeVisible()
      await page.getByRole('button', { name: 'All', exact: true }).click()

      /* + button */
      await page.getByRole('button', { name: `More ${name}` }).click()
      await expect(rowFor(name).getByTestId('pantry-item-qty')).toHaveText('3 pcs')

      /* Edit name and amount */
      await page.getByRole('button', { name: `Edit ${name}` }).click()
      await page.getByTestId('pantry-edit-name').fill(renamed)
      await page.getByTestId('pantry-edit-qty').fill('5')
      await page.getByTestId('pantry-edit-save').click()
      await expect(page.getByTestId('pantry-notice')).toContainText(`Saved ${renamed}`)

      await page.reload()
      await expect(rowFor(renamed).getByTestId('pantry-item-qty')).toHaveText('5 pcs')

      /* Remove: Cancel first, then really remove */
      await page.getByRole('button', { name: `Remove ${renamed}` }).click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toContainText(`Remove ${renamed}?`)
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(rowFor(renamed)).toBeVisible()

      await page.getByRole('button', { name: `Remove ${renamed}` }).click()
      await dialog.getByRole('button', { name: 'Remove item' }).click()
      await expect(page.getByTestId('pantry-notice')).toContainText(`Removed ${renamed}`)

      await page.reload()
      await expect(page.getByRole('heading', { name: 'My Pantry' })).toBeVisible()
      await expect(rowFor(renamed)).toHaveCount(0)
    } finally {
      await restorePantry(client, pantryBefore, [name])
    }
  })
})

test.describe('Pantry units', () => {
  test('J06 rice typed in cups is saved in grams, and a recipe in cups is covered by it', async ({ page, request }, testInfo) => {
    await logIn(page)
    const client = api(request, await authHeaders(page))
    const pantryBefore = (await client.get('/pantry')).items
    const name = uniqueName('E2E jasmine rice', testInfo)
    const rowFor = (n) => page.getByTestId('pantry-item').filter({ hasText: n })

    try {
      await page.goto('/pantry')
      await page.getByTestId('pantry-name').fill(name)
      await page.getByTestId('pantry-qty').fill('2')
      await page.getByTestId('pantry-form').getByLabel('Unit').selectOption('cup')
      await expect(page.getByTestId('pantry-unit-hint')).toHaveText('Saved as g or ml')
      await page.getByTestId('pantry-form').getByLabel('Category').selectOption('grains')
      await page.getByTestId('pantry-add').click()

      // 1 cup of uncooked rice is about 185 g
      await expect(page.getByTestId('pantry-notice')).toContainText(`Added ${name} (370 g)`)
      await expect(rowFor(name).getByTestId('pantry-item-qty')).toHaveText('370 g')

      // adding 1 more cup merges into the same row, still in grams
      await page.getByTestId('pantry-name').fill(name)
      await page.getByTestId('pantry-qty').fill('1')
      await page.getByTestId('pantry-form').getByLabel('Unit').selectOption('cup')
      await page.getByTestId('pantry-add').click()
      await expect(rowFor(name).getByTestId('pantry-item-qty')).toHaveText('555 g')

      await page.reload()
      await expect(rowFor(name).getByTestId('pantry-item-qty')).toHaveText('555 g')
    } finally {
      await restorePantry(client, pantryBefore, [name])
    }
  })
})

/* ======================================================================
   Journey 3: Getting around the app (navbar, login guard, log out)
   Read-only, so it runs in every browser.
   ====================================================================== */
test.describe('App shell and navigation', () => {
  test('J03 a guest is sent to log in, then taken back to the page they wanted', async ({ page }) => {
    await page.goto('/pantry')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)pantry/)

    await logIn(page, { startAt: page.url() })
    await expect(page).toHaveURL(/\/pantry$/)
    await expect(page.getByRole('heading', { name: 'My Pantry' })).toBeVisible()
  })

  test('J04 the navbar reaches each page of the weekly loop, and log out ends the session', async ({ page }) => {
    await logIn(page)
    const nav = page.getByRole('navigation', { name: 'Main' })

    const pages = [
      { link: 'Weekly Plan', url: /\/planner$/, check: page.getByText(/^Week of /) },
      { link: 'Shopping List', url: /\/shoppinglist/, check: page.getByRole('heading', { name: 'Shopping List', level: 1 }) },
      { link: 'Pantry', url: /\/pantry$/, check: page.getByRole('heading', { name: 'My Pantry' }) },
    ]
    for (const p of pages) {
      await nav.getByRole('link', { name: p.link, exact: true }).click()
      await expect(page).toHaveURL(p.url)
      await expect(p.check).toBeVisible()
      await expect(nav.getByRole('link', { name: p.link, exact: true })).toHaveAttribute('aria-current', 'page')
    }

    await page.locator('button[aria-haspopup="menu"]').click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/home$/)

    await page.goto('/planner') // the session really is gone
    await expect(page).toHaveURL(/\/login/)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('J05 the menu button opens the links, and choosing one closes the menu', async ({ page }) => {
      await logIn(page)
      const menuButton = page.getByRole('button', { name: 'Open menu' })
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pantry', exact: true })).toBeHidden()

      await menuButton.click()
      await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pantry', exact: true }).click()

      await expect(page).toHaveURL(/\/pantry$/)
      await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
    })
  })
})
