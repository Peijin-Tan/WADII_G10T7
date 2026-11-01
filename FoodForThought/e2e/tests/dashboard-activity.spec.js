import { test, expect } from '@playwright/test'

// Run against a disposable test database and a dedicated regular user.
// The existing playwright.config.js starts Vite. Start server/index.js yourself.
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const recipeId = process.env.E2E_RECIPE_ID
const apiURL = process.env.E2E_API_URL || 'http://localhost:8000'

test.describe('Dashboard, comments and likes with the real backend', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(async ({ page }) => {
    if (!email || !password || !recipeId) {
      throw new Error(
        'Set E2E_EMAIL, E2E_PASSWORD and E2E_RECIPE_ID.'
      )
    }

    await page.goto('/login')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)

    const loginResponsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/auth/login' &&
      response.request().method() === 'POST'
    )

    await page.getByRole('button', {
      name: 'Login',
      exact: true
    }).click()

    const response = await loginResponsePromise

    expect(
      response.ok(),
      `Login failed with HTTP ${response.status()}`
    ).toBeTruthy()

    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('E01 adds, edits and deletes a comment, with persistence after reload', async ({ page, request }) => {
    const draft = `E2E comment ${Date.now()}`
    const edited = `${draft} updated`
    const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('foodforthought_auth')))
    const headers = { Authorization: `Bearer ${auth.token}` }
    let commentId
    try {
      await page.goto(`/recipes/${recipeId}`)
      await page.getByLabel('Share your thoughts on this recipe').fill(draft)
      const created = page.waitForResponse(r => r.url().endsWith(`/activity/recipes/${recipeId}/comments`) && r.request().method() === 'POST')
      await page.getByRole('button', { name: 'Post Comment', exact: true }).click()
      const response = await created
      expect(response.status()).toBe(201)
      commentId = (await response.json())._id
      await expect(page.getByText('Comment added!', { exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'Manage my comments' }).click()
      let card = page.locator('article').filter({ hasText: draft })
      // Other comments on the same recipe can share the card.
      let entry = card.locator('.comment-entry').filter({ hasText: draft })
      await entry.getByRole('button', {
        name: 'Edit',
        exact: true
      }).click()

      await page.getByLabel('Edit your comment', {
        exact: true
      }).fill(edited)

      await page.getByRole('button', {
        name: 'Save Changes',
        exact: true
      }).click()
      await expect(page.getByText('Your comment was updated.', { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByText(edited, { exact: true })).toBeVisible()
      card = page.locator('article').filter({ hasText: edited })
      entry = card.locator('.comment-entry').filter({ hasText: edited })
      page.once('dialog', dialog => dialog.accept())
      await entry.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText('Your comment was deleted.', { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByRole('heading', { name: 'My Comments', exact: true })).toBeVisible()
      // Wait for the fetch before asserting absence.
      await expect(page.getByText('Loading your comments...', { exact: true })).toBeHidden()
      await expect(page.getByText(edited, { exact: true })).toHaveCount(0)
      const remaining = await request.get(`${apiURL}/activity/comments`, { headers })
      expect(remaining.ok()).toBeTruthy()
      expect((await remaining.json()).some(c => c._id === commentId)).toBe(false)
    } finally {
      if (commentId) {
        const cleanup = await request.delete(`${apiURL}/activity/comments/${commentId}`, { headers })
        expect([200, 404]).toContain(cleanup.status())
      }
    }
  })

  test('E02 unlikes a fixture recipe and keeps it removed after reload', async ({ page, request }) => {
    const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('foodforthought_auth')))
    const headers = { Authorization: `Bearer ${auth.token}` }
    const key = `recipe-${recipeId}`
    const before = await request.get(`${apiURL}/activity/likes`, { headers })
    expect(before.ok()).toBeTruthy()
    const existing = await before.json()
    // Require a fresh fixture; never remove a pre-existing user's like.
    expect(existing.some(like => like.recipe?._id === recipeId)).toBe(false)
    const seeded = await request.post(`${apiURL}/recipes/${key}/like`, { headers })
    expect(seeded.ok()).toBeTruthy()
    let fixtureLikeId
    try {
      const seededLikes = await request.get(`${apiURL}/activity/likes`, { headers })
      expect(seededLikes.ok()).toBeTruthy()
      fixtureLikeId = (await seededLikes.json()).find(like => like.recipe?._id === recipeId)?._id
      expect(fixtureLikeId).toBeTruthy()
      await page.goto('/community')
      await page.getByRole('button', { name: 'My Liked Recipes', exact: true }).click()
      const card = page.locator('article').filter({ has: page.locator(`a[href="/recipes/${recipeId}"]`) })
      await expect(card).toHaveCount(1)
      await card.getByRole('button', { name: 'Unlike', exact: true }).click()
      await expect(page.getByText('Recipe removed from your likes.', { exact: true })).toBeVisible()
      await page.reload()
      await page.getByRole('button', { name: 'My Liked Recipes', exact: true }).click()
      await expect(page.getByText('Loading your liked recipes...', { exact: true })).toBeHidden()
      await expect(page.locator(`main a[href="/recipes/${recipeId}"]`)).toHaveCount(0)
      const after = await request.get(`${apiURL}/activity/likes`, { headers })
      expect(after.ok()).toBeTruthy()
      expect((await after.json()).some(like => like._id === fixtureLikeId)).toBe(false)
    } finally {
      if (fixtureLikeId) {
        const cleanup = await request.delete(`${apiURL}/activity/likes/${fixtureLikeId}`, { headers })
        expect([200, 404]).toContain(cleanup.status())
      }
    }
  })

  test('E03 displays known current-month meal-plan totals', async ({ page }) => {
    // Alex currently has one November meal, marked Cooked.
    const main = page.locator('main')

    await expect(
      main.getByText('100% complete', { exact: true })
    ).toBeVisible()

    await expect(
      main.getByRole('progressbar', {
        name: 'Monthly meal-plan completion'
      })
    ).toHaveAttribute('aria-valuenow', '100')

    await expect(
      main.getByText(/1 of\s+1\s+planned meals completed this month/)
    ).toBeVisible()

    await expect(
      main.getByRole('heading', { name: 'Trending cuisines' })
    ).toBeVisible()

    await main.getByRole('link', { name: 'View Meal Plan' }).click()
    await expect(page).toHaveURL(/\/planner$/)
  })
})
