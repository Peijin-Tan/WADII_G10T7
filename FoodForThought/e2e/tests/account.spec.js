import { test, expect } from '@playwright/test'
import { logIn } from '../support/session.js'
import { apiLogin, cleanUpUsers, newAccount, requireAdminAccount } from '../support/accounts.js'

const made = cleanUpUsers(test)

test('AC01 sign up, save preferences, change password and log in again', async ({ page, request }, testInfo) => {
  requireAdminAccount()
  const account = newAccount('Acct', testInfo)
  const newPassword = 'Changed-Passw0rd!'
  made.push(account.email)

  await page.goto('/register')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/, Acct$/)

  await page.goto('/preferences')
  await page.getByRole('checkbox', { name: 'Vegetarian' }).check()
  await page.getByRole('checkbox', { name: 'Peanuts' }).check()
  await page.getByRole('button', { name: 'Save Preferences' }).click()
  await expect(page.getByText('Your preferences have been saved!')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Peanuts' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Vegan' })).not.toBeChecked()

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

  await page.getByRole('button', { name: `Account menu for ${account.name}` }).click()
  await page.getByRole('menuitem', { name: /log out/i }).click()
  await expect(page).toHaveURL(/\/home$/)
  await logIn(page, { as: { email: account.email, password: newPassword } })
  await expect(page).toHaveURL(/\/dashboard$/)

  const { client } = await apiLogin(request, { email: account.email, password: newPassword })
  const prefs = await client.get('/preferences')
  expect(JSON.stringify(prefs)).toMatch(/Vegetarian/)
  expect(JSON.stringify(prefs)).toMatch(/Peanuts/)
})
