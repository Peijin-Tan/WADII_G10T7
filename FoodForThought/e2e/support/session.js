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
  await expect(page).not.toHaveURL(/\/login/)
}

export async function authHeaders(page) {
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('foodforthought_auth')))
  return { Authorization: `Bearer ${auth.token}` }
}

export function api(request, headers) {
  const call = async (method, path, data) => {
    const res = await request.fetch(`${apiURL}${path}`, { method, headers, data })
    expect(res.ok(), `${method} ${path} -> HTTP ${res.status()}`).toBeTruthy()
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  return {
    get: (path) => call('GET', path),
    post: (path, data) => call('POST', path, data),
    patch: (path, data) => call('PATCH', path, data),
    delete: (path) => call('DELETE', path),
  }
}

export function mondayISO(weeksAhead = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weeksAhead * 7)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const letters = (n) => n.toString(26).split('').map((d) => String.fromCharCode(97 + parseInt(d, 26))).join('')
export const uniqueName = (base, testInfo) => `${base} ${testInfo.project.name} ${letters(Date.now() % 1e9)}`

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
