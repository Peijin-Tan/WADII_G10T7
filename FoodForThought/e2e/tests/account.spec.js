// account.spec.js - a new visitor signs up, sets dietary preferences, changes their password,
// logs out and logs back in with the new password.
// The account is made in the test (needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to remove it afterwards).
import { test, expect } from '@playwright/test'
import { logIn } from '../support/session.js'
import { apiLogin, cleanUpUsers, newAccount, requireAdminAccount } from '../support/accounts.js'

const made = cleanUpUsers(test) // the new account is deleted after the test, pass or fail

test('AC01 sign up, save preferences, change password and log in again', async ({ page, request }, testInfo) => {
  requireAdminAccount()
  const account = newAccount('Acct', testInfo)
  const newPassword = 'Changed-Passw0rd!'
  made.push(account.email)

  // 1. Sign up through the form -> straight to the dashboard, greeted by first name
  await page.goto('/register')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/, Acct$/)

  // 2. Dietary preferences are saved and still ticked after a reload
  await page.goto('/preferences')
  await page.getByRole('checkbox', { name: 'Vegetarian' }).check()
  await page.getByRole('checkbox', { name: 'Peanuts' }).check()
  await page.getByRole('button', { name: 'Save Preferences' }).click()
  await expect(page.getByText('Your preferences have been saved!')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Vegan' })).not.toBeChecked()

  // 3. Change password: a wrong current password is refused, the right one works
  await page.goto('/change-password')
  const fillForm = async (current) => {
    await page.getByLabel('Current password').fill(current)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password').fill(newPassword)
    await page.getByRole('button', { name: 'Update Password' }).click()
  }
  await fillForm('Not-my-passw0rd!')
  await expect(page.getByRole('alert')).toContainText(/incorrect|wrong|invalid/i)
  await fillForm(account.password)
  await expect(page.getByRole('alert')).toHaveText('Your password has been updated successfully.')

  // 4. Log out from the account menu, then log in with the NEW password
  await page.getByRole('button', { name: `Account menu for ${account.name}` }).click()
  await page.getByRole('menuitem', { name: /log out/i }).click()
  await expect(page).toHaveURL(/\/home$/)
  await logIn(page, { as: { email: account.email, password: newPassword } })
  await expect(page).toHaveURL(/\/dashboard$/)

  // the saved preferences belong to the account (checked on the server, not just in the page)
  const { client } = await apiLogin(request, { email: account.email, password: newPassword })
  const prefs = await client.get('/preferences')
  expect(JSON.stringify(prefs)).toMatch(/Vegetarian/)
  expect(JSON.stringify(prefs)).toMatch(/Peanuts/)
})
