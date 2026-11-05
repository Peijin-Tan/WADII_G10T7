// neighbour-pantry.spec.js - two people share pantries and borrow an ingredient:
//   Ben invites Ann -> Ann accepts -> Ben sees Ann's pantry and asks to borrow flour
//   -> Ann approves -> the flour moves from Ann's pantry to Ben's.
// Both are throwaway users, each in their own browser context (two people on two devices).
// Needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to remove them afterwards.
import { test, expect } from '@playwright/test'
import { logIn } from '../support/session.js'
import { cleanUpUsers, createUser, requireAdminAccount, uniqueTag } from '../support/accounts.js'

const made = cleanUpUsers(test) // deleting the users also removes their invite, neighbour link and request

async function openNeighbourPantry(page) {
  await page.goto('/community')
  await page.getByRole('tab', { name: /^Neighbour Pantry/ }).click()
  await expect(page.getByRole('heading', { name: /^Neighbours/, level: 2 })).toBeVisible()
}

test('N01 invite a neighbour, borrow an ingredient and get it approved', async ({ browser, request }, testInfo) => {
  requireAdminAccount()
  const ann = await createUser(request, 'Ann', testInfo, made)
  const ben = await createUser(request, 'Ben', testInfo, made)
  const flour = `flour ${uniqueTag(testInfo)}`
  await ann.client.post('/pantry', { name: flour, quantity: 500, unit: 'g', category: 'grains' })

  const { baseURL } = testInfo.project.use
  const annPage = await (await browser.newContext({ baseURL })).newPage()
  const benPage = await (await browser.newContext({ baseURL })).newPage()
  await logIn(annPage, { as: ann })
  await logIn(benPage, { as: ben })

  // 1. Ben finds Ann by name and invites her
  await openNeighbourPantry(benPage)
  await benPage.getByRole('searchbox', { name: 'Add a neighbour' }).fill(ann.name)
  const result = benPage.getByRole('list', { name: 'Search results' }).getByRole('listitem').filter({ hasText: ann.name })
  await result.getByRole('button', { name: 'Invite' }).click()
  await expect(benPage.getByRole('heading', { name: 'Invites you sent' })).toBeVisible()

  // 2. Ann accepts the invite
  await openNeighbourPantry(annPage)
  await expect(annPage.getByRole('heading', { name: 'Invites for you' })).toBeVisible()
  await annPage.getByRole('listitem').filter({ hasText: ben.name }).getByRole('button', { name: 'Accept' }).click()
  await expect(annPage.getByRole('button', { name: `Remove ${ben.name} as a neighbour` })).toBeVisible()

  // 3. Ben opens Ann's pantry, puts the flour on his borrow list (default amount) and sends the request
  await openNeighbourPantry(benPage)
  await benPage.getByRole('button', { name: new RegExp(ann.name) }).filter({ hasText: 'Neighbours since' }).click()
  await expect(benPage.getByRole('heading', { name: `${ann.name}'s pantry` })).toBeVisible()
  const item = benPage.getByRole('listitem').filter({ hasText: flour })
  await item.getByRole('button', { name: /Borrow/ }).click()
  await expect(item.getByRole('button', { name: /On your list/ })).toBeVisible()
  await benPage.getByLabel(/Message/).fill('Baking a cake tonight!')
  await benPage.getByRole('button', { name: 'Send request' }).click()
  await expect(benPage.getByRole('region', { name: 'Your borrow requests' })).toContainText('Waiting')
  const asked = (await ben.client.get('/pantry/requests')).outgoing[0].items[0] // what he asked for, and how much
  expect(asked?.name).toBe(flour)

  // 4. Ann sees the request and approves it
  await openNeighbourPantry(annPage)
  const request_ = annPage.getByRole('listitem').filter({ hasText: `${ben.name} wants to borrow` })
  await expect(request_).toContainText('Baking a cake tonight!')
  await request_.getByRole('button', { name: /Approve/ }).click()
  await expect(annPage.getByText(`${ben.name} wants to borrow`)).toHaveCount(0)

  // 5. Ben's request now says Approved, and the flour is in his pantry (and taken out of Ann's)
  await openNeighbourPantry(benPage)
  await expect(benPage.getByText('Added to your pantry.')).toBeVisible()
  const benFlour = (await ben.client.get('/pantry')).items.find((i) => i.name === flour)
  expect(benFlour?.quantity).toBe(asked.quantity)
  const annFlour = (await ann.client.get('/pantry')).items.find((i) => i.name === flour)
  expect(annFlour?.quantity ?? 0).toBe(500 - asked.quantity)

  await annPage.context().close()
  await benPage.context().close()
})
