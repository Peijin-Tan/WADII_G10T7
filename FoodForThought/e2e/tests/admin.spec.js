import { test, expect } from '@playwright/test'
import { logIn } from '../support/session.js'
import { adminAccount, apiLogin, cleanUpUsers, createUser, requireAdminAccount } from '../support/accounts.js'

const made = cleanUpUsers(test)

test('AD01 admin opens Users from the overview and deletes a user', async ({ page, request }, testInfo) => {
  requireAdminAccount()
  const victim = await createUser(request, 'Gone', testInfo, made)

  await logIn(page, { as: adminAccount() })
  await expect(page).toHaveURL(/\/admindashboard$/)
  await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible()

  await page.getByRole('button', { name: /^Total users \d+/ }).click()
  await expect(page.getByRole('heading', { name: 'Users', level: 2 })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search users' }).fill(victim.email)
  const deleteButton = page.getByRole('button', { name: `Delete ${victim.name}` })
  const row = page.getByRole('row').filter({ has: deleteButton })
  await expect(row).toContainText(victim.email)
  await deleteButton.click()
  const dialog = page.getByRole('alertdialog', { name: `Delete ${victim.name}?` })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete user' }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toHaveCount(0)
  await expect(page.getByText(`No users match "${victim.email}".`)).toBeVisible()
  await expect(page.getByText(`Deleted ${victim.name}`)).toBeVisible()

  const admin = await apiLogin(request, adminAccount())
  const users = await admin.client.get('/users')
  expect(users.some((u) => u.email === victim.email)).toBe(false)

  const nav = page.getByRole('navigation', { name: 'Admin sections' })
  await nav.getByRole('button', { name: /^Recipes/ }).click()
  await expect(page.getByRole('heading', { name: 'Recipes', level: 2 })).toBeVisible()
  await nav.getByRole('button', { name: /^Comments/ }).click()
  await expect(page.getByRole('heading', { name: 'Comments', level: 2 })).toBeVisible()
})
