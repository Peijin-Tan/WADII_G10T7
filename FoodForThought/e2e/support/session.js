// session.js - shared helpers for the Planner / Shopping List / Pantry E2E tests.
//
// These tests use the REAL frontend, Express server and MongoDB, so they need:
//   1. the backend running:          cd server && npm start      (http://localhost:8000)
//   2. a dedicated TEST account (not your own one - the tests add and remove data):
//        E2E_EMAIL=...  E2E_PASSWORD=...        (optional: E2E_API_URL, default http://localhost:8000)
// Playwright starts the Vite dev server itself (see playwright.config.js).
import process from 'node:process'
import { expect } from '@playwright/test'

export const apiURL = process.env.E2E_API_URL || 'http://localhost:8000'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

export function requireTestAccount() {
  if (!email || !password) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD to a dedicated test account (see README "Testing").')
  }
}

// Log in through the real login form and wait for the server to accept it
// (pass { email, password } to log in as another account, e.g. a throwaway user from accounts.js)
export async function logIn(page, { startAt = '/login', as } = {}) {
  if (!as) requireTestAccount()
  const account = as || { email, password }
  await page.goto(startAt)
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  const loginResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/auth/login' && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  expect((await loginResponse).ok(), 'Login failed: check E2E_EMAIL / E2E_PASSWORD').toBeTruthy()
  await expect(page).not.toHaveURL(/\/login/) // the app has moved on to the next page
}

// The JWT the app saved after logging in, as headers for direct API calls (set-up and clean-up only)
export async function authHeaders(page) {
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('foodforthought_auth')))
  return { Authorization: `Bearer ${auth.token}` }
}

// A small API client for preparing data and cleaning up afterwards
export function api(request, headers) {
  const call = async (method, path, data) => {
    const res = await request.fetch(`${apiURL}${path}`, { method, headers, data })
    expect(res.ok(), `${method} ${path} -> HTTP ${res.status()}`).toBeTruthy()
    const text = await res.text() // some routes answer 204 No Content
    return text ? JSON.parse(text) : null
  }
  return {
    get: (path) => call('GET', path),
    post: (path, data) => call('POST', path, data),
    patch: (path, data) => call('PATCH', path, data),
    delete: (path) => call('DELETE', path),
  }
}

// 'YYYY-MM-DD' of the Monday `weeksAhead` weeks from this week (same rule as src/utils/dates.js)
export function mondayISO(weeksAhead = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weeksAhead * 7)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A name no other run (or browser) will use, so tests never collide with each other or real data.
// The unique part is LETTERS: the app ignores digits when it matches ingredient names
// ("E2E oats 123" and "E2E oats 456" are the same ingredient to it), so numbers wouldn't be unique.
const letters = (n) => n.toString(26).split('').map((d) => String.fromCharCode(97 + parseInt(d, 26))).join('')
export const uniqueName = (base, testInfo) => `${base} ${testInfo.project.name} ${letters(Date.now() % 1e9)}`

// Put the pantry back as it was before the test:
//  - items this test created are removed. Only names in `ownNames` are removed, because the
//    same account may be used by the other browsers at the same time, adding their own items.
//  - with restoreAmounts, items that were already there get their old amount back (e.g. after cooking)
export async function restorePantry(client, before, ownNames = [], { restoreAmounts = false } = {}) {
  const now = (await client.get('/pantry')).items
  const id = (i) => i.id || i._id
  const mine = (item) => ownNames.some((n) => item.name.toLowerCase().startsWith(n.toLowerCase()))
  for (const item of now) {
    const old = before.find((b) => id(b) === id(item))
    if (!old && mine(item)) await client.delete(`/pantry/${id(item)}`)
    else if (restoreAmounts && old && old.quantity !== item.quantity) await client.patch(`/pantry/${id(item)}`, { quantity: old.quantity })
  }
}
