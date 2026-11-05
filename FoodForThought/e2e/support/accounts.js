// accounts.js - throwaway users for E2E tests that need a fresh account (register, change password,
// neighbour pantry between two people, admin deleting a user...).
//
// Needs an ADMIN test account, because throwaway users are removed at the end through the same
// admin "delete user" route the Admin Dashboard uses (it also removes their pantry, plans, invites...):
//     E2E_ADMIN_EMAIL=...  E2E_ADMIN_PASSWORD=...
import process from 'node:process'
import { expect } from '@playwright/test'
import { apiURL, api } from './session.js'

const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD

export function requireAdminAccount() {
  if (!adminEmail || !adminPassword) {
    throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to an admin test account (see README "Automated tests").')
  }
}
export const adminAccount = () => ({ email: adminEmail, password: adminPassword })

// Logs in through the API (no browser) and returns { token, user, client }
export async function apiLogin(request, { email, password }) {
  const res = await request.post(`${apiURL}/auth/login`, { data: { email, password } })
  expect(res.ok(), `API login for ${email} -> HTTP ${res.status()}`).toBeTruthy()
  const body = await res.json()
  return { ...body, client: api(request, { Authorization: `Bearer ${body.token}` }) }
}

// A letters-only tag that is different for every run and every browser (see uniqueName in session.js)
const letters = (n) => n.toString(26).split('').map((d) => String.fromCharCode(97 + parseInt(d, 26))).join('')
export function uniqueTag(testInfo) {
  return `${testInfo.project.name.slice(0, 2)}${letters((Date.now() * 7 + testInfo.workerIndex) % 1e10)}`
}

// Details for a new account. Not created yet: register it with createUser, or through the sign-up form.
export function newAccount(firstName, testInfo) {
  const tag = uniqueTag(testInfo)
  return { name: `${firstName} ${tag}`, email: `e2e.${firstName.toLowerCase()}.${tag}@example.com`, password: 'E2e-Passw0rd!' }
}

// Registers a throwaway user through the API and logs them in. Returns the account plus id, token and client.
// Pass the list from cleanUpUsers() as `cleanUp` so the user is removed after the test, even if it fails.
export async function createUser(request, firstName, testInfo, cleanUp) {
  const account = newAccount(firstName, testInfo)
  cleanUp?.push(account.email) // remembered before registering, so a half-finished sign-up is removed too
  const res = await request.post(`${apiURL}/auth/register`, { data: account })
  expect(res.status(), `register ${account.email}`).toBe(201)
  const login = await apiLogin(request, account)
  return { ...account, id: login.user._id || login.user.id, token: login.token, client: login.client }
}

// Deletes throwaway users by email (as the admin). Safe to call in `finally` even if a user was never created.
export async function deleteUsers(request, emails) {
  requireAdminAccount()
  const admin = await apiLogin(request, adminAccount())
  const all = await admin.client.get('/users')
  const users = Array.isArray(all) ? all : all.users || all.data || []
  for (const email of emails.filter(Boolean)) {
    const user = users.find((u) => u.email === email.toLowerCase())
    if (user) await admin.client.delete(`/users/${user._id || user.id}`)
  }
}

// Removes every throwaway user a test made, in afterEach: unlike `finally`, afterEach still has a working
// `request` when the test itself timed out. Use:  const made = cleanUpUsers(test)  ...  made.push(user.email)
export function cleanUpUsers(test) {
  const emails = []
  test.afterEach(async ({ request }) => {
    await deleteUsers(request, emails.splice(0))
  })
  return emails
}
