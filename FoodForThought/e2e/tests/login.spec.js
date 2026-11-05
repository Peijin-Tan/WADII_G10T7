// login.spec.js - logging in as a user, as an admin, and with a wrong password.
// Accounts come from environment variables (never hard-coded), see README "Automated tests":
//   E2E_EMAIL / E2E_PASSWORD             a regular test user
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD an admin test user
// URLs are relative, so they follow baseURL in playwright.config.js.
import process from 'node:process'
import { test, expect } from '@playwright/test'

async function fillLogin(page, email, password) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
}

test.describe('Login page', () => {
  test('L01 a user logs in and lands on their dashboard', async ({ page }) => {
    test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD')
    await fillLogin(page, process.env.E2E_EMAIL, process.env.E2E_PASSWORD)

    await expect(page).toHaveURL(/\/dashboard$/)
    // The dashboard greets the user by first name, e.g. "Good morning, Alex"
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)/)
  })

  test('L02 an admin logs in and lands on the admin dashboard', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD')
    await fillLogin(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD)

    await expect(page).toHaveURL(/\/admindashboard$/)
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', level: 1 })).toBeVisible()
  })

  test('L03 a wrong password shows an error and stays on the login page', async ({ page }, testInfo) => {
    // Only one browser runs this: the server allows 10 failed logins per 15 minutes,
    // so running it in all three browsers would use that up after a few runs.
    test.skip(testInfo.project.name !== 'chromium', 'runs in Chromium only (login rate limit)')
    await fillLogin(page, 'nobody.e2e@example.com', 'Wrong-passw0rd!')

    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i)
    await expect(page).toHaveURL(/\/login/)
  })
})
