// App.spec.js - component tests for the app shell (src/App.vue): navbar, account menu, footer,
// plus the route guard (src/router/index.js) and the "expired login" rule (src/services/api.js)
// that every page relies on.
//
// The pages themselves are not drawn: <RouterView> is stubbed, so these tests only check
// what App.vue is responsible for. The real router is used, so links and redirects are real.
//
// Run:  npx vitest run src/components/__tests__/App.spec.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import App from '@/App.vue'
import Login from '@/components/Auth/login.vue'
import { createApi } from '@/services/api'
import { server, httpError, renderPage, button, label, flushPromises, TEST_TOKEN } from './mealFlowSupport'

vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
enableAutoUnmount(afterEach)

const NAV = ['Dashboard', 'Weekly Plan', 'Shopping List', 'Pantry', 'Recipes', 'Community']
const eleen = { _id: 'u1', name: 'Eleen Chia', role: 'user' }
const admin = { _id: 'u2', name: 'Ada Admin', role: 'admin' }

const renderApp = (options = {}) =>
  renderPage(App, { path: '/recipes', attach: true, stubs: { RouterView: true, ConfirmDialog: true }, ...options })

const mainNav = (wrapper) => wrapper.get('nav[aria-label="Main"]')
const linkLabels = (el) => el.findAll('a').map(label)
const accountButton = (wrapper) => wrapper.get('button[aria-haspopup="menu"]')

beforeEach(() => server.reset())

describe('App: navbar for guests', () => {
  it('A01 guests see the main links in the order a week goes, and Log in / Create account', async () => {
    const { wrapper } = await renderApp({ loggedIn: false })

    expect(linkLabels(mainNav(wrapper).get('ul'))).toEqual(NAV)
    expect(label(mainNav(wrapper))).toContain('Log in')
    expect(label(mainNav(wrapper))).toContain('Create account')
    expect(wrapper.find('button[aria-haspopup="menu"]').exists()).toBe(false)
    expect(label(mainNav(wrapper))).not.toContain('Admin')
  })

  it.each(['/login', '/register', '/home'])('A02 there is no navbar or footer on %s', async (path) => {
    const { wrapper } = await renderApp({ loggedIn: false, path })
    expect(wrapper.find('nav[aria-label="Main"]').exists()).toBe(false)
    expect(wrapper.find('footer').exists()).toBe(false)
  })

  it('A03 a guest who opens a members-only page is sent to log in, and will come back after', async () => {
    const { wrapper, router } = await renderApp({ loggedIn: false })

    await mainNav(wrapper).findAll('a').find((a) => label(a) === 'Weekly Plan').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/planner'))
  })
})

describe('App: navbar for logged-in users', () => {
  it('A04 shows who is logged in, as initials and name', async () => {
    const { wrapper } = await renderApp({ user: eleen })
    expect(label(accountButton(wrapper))).toBe('EC Eleen Chia')
    expect(label(mainNav(wrapper))).not.toContain('Log in')
  })

  it('A05 the link for the current page is marked as the current page', async () => {
    const { wrapper, router } = await renderApp({ user: eleen, path: '/pantry' })
    const current = () => mainNav(wrapper).get('ul').findAll('a[aria-current="page"]').map(label)
    expect(current()).toEqual(['Pantry'])

    await router.push('/shoppinglist')
    await flushPromises()
    expect(current()).toEqual(['Shopping List'])
  })

  it('A06 the account menu opens on click and closes with Esc, a click outside, or moving page', async () => {
    const { wrapper, router } = await renderApp({ user: eleen })
    const menu = () => wrapper.find('[role="menu"]')
    expect(menu().exists()).toBe(false)

    await accountButton(wrapper).trigger('click')
    expect(accountButton(wrapper).attributes('aria-expanded')).toBe('true')
    expect(menu().findAll('[role="menuitem"]').map(label)).toEqual(['Profile', 'Dietary preferences', 'Log out'])

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(menu().exists()).toBe(false)

    await accountButton(wrapper).trigger('click')
    document.body.click() // somewhere outside the menu
    await flushPromises()
    expect(menu().exists()).toBe(false)

    await accountButton(wrapper).trigger('click')
    await router.push('/pantry')
    await flushPromises()
    expect(menu().exists()).toBe(false)
  })

  it('A07 logging out forgets the login and goes to the landing page', async () => {
    const { wrapper, auth, router } = await renderApp({ user: eleen })

    await accountButton(wrapper).trigger('click')
    await wrapper.get('[role="menu"]').findAll('button').find((b) => label(b) === 'Log out').trigger('click')
    await flushPromises()

    expect(auth.token).toBe('')
    expect(localStorage.getItem('foodforthought_auth')).toBeNull()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/home'))
  })

  it('A08 only admins get the Admin link', async () => {
    const asUser = await renderApp({ user: eleen })
    expect(asUser.wrapper.find('a[href="/admindashboard"]').exists()).toBe(false)
    asUser.wrapper.unmount()

    const asAdmin = await renderApp({ user: admin })
    expect(label(asAdmin.wrapper.get('a[href="/admindashboard"]'))).toBe('Admin')
  })

  it('A09 a user with no name still gets a sensible account button', async () => {
    const { wrapper } = await renderApp({ user: { _id: 'u3', role: 'user' } })
    expect(label(accountButton(wrapper))).toBe('? Your account')
  })
})

describe('App: phone menu and footer', () => {
  it('A10 the menu button opens and closes the menu, and choosing a page closes it', async () => {
    const { wrapper, router } = await renderApp({ user: eleen })
    const toggle = () => button(wrapper, wrapper.find('[aria-label="Open menu"]').exists() ? 'Open menu' : 'Close menu')
    const panel = () => wrapper.get('#mainNav')

    expect(panel().classes()).not.toContain('show')
    await toggle().trigger('click')
    expect(panel().classes()).toContain('show')
    expect(toggle().attributes('aria-label')).toBe('Close menu')
    expect(toggle().attributes('aria-expanded')).toBe('true')

    await router.push('/planner')
    await flushPromises()
    expect(panel().classes()).not.toContain('show')
  })

  it('A11 the footer has the same links as the navbar', async () => {
    const { wrapper } = await renderApp({ user: eleen })
    expect(linkLabels(wrapper.get('nav[aria-label="Footer"]'))).toEqual(NAV)
    expect(wrapper.get('footer').text()).toContain(`© ${new Date().getFullYear()} FoodForThought`)
  })
})

describe('App: expired login', () => {
  it('A12 a 401 from any page\'s request logs the user out and sends them to log in', async () => {
    server.on('GET /pantry', () => { throw httpError(401, 'Token expired') })
    const { auth, router } = await renderApp({ user: eleen, path: '/pantry' })

    await expect(createApi('/pantry').get('/')).rejects.toMatchObject({ response: { status: 401 } })
    await flushPromises()

    expect(auth.token).toBe('')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
  })

  it('A13 every request carries the login token', async () => {
    server.on('GET /pantry', () => ({ items: [] }))
    await renderApp({ user: eleen })

    await createApi('/pantry').get('/')
    expect(server.last('GET /pantry').headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`)
  })
})

describe('Router: who can open which page', () => {
  // Every page needs a login unless its route has meta: { public: true } (src/router/index.js)
  it.each(['/dashboard', '/planner', '/shoppinglist', '/pantry', '/community', '/profile', '/preferences',
    '/change-password', '/recipes/create', '/admindashboard'])('A14 a guest opening %s is sent to log in first', async (path) => {
    const { router } = await renderApp({ loggedIn: false, path })
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe(path) // so login can bring them back
    expect(server.calls).toHaveLength(0) // redirected BEFORE the page asked the server for anything
  })

  it.each(['/home', '/recipes', '/login', '/register'])('A15 a guest can open %s', async (path) => {
    const { router } = await renderApp({ loggedIn: false, path })
    expect(router.currentRoute.value.path).toBe(path)
  })

  it('A16 a logged-in user opening Login or Register goes to their dashboard', async () => {
    const { router } = await renderApp({ user: eleen, path: '/login' })
    expect(router.currentRoute.value.path).toBe('/dashboard')
    await router.push('/register')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('A17 a login that has expired counts as logged out', async () => {
    const { auth, router } = await renderApp({ user: eleen, path: '/home' })
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '')
    auth.setLogin({ token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 60 })}.sig`, user: eleen })

    await router.push('/planner')
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/planner')
    expect(auth.token).toBe('')
  })

  it('A18 a normal user is kept out of the admin dashboard', async () => {
    const { router } = await renderApp({ user: eleen, path: '/admindashboard' })
    expect(router.currentRoute.value.path).toBe('/home')
  })
})

describe('Login page: going back to the page you wanted', () => {
  const logIn = async (path) => {
    server.on('POST /auth/login', () => ({ token: TEST_TOKEN, user: eleen }))
    const { wrapper, router } = await renderPage(Login, { path, loggedIn: false })
    await wrapper.get('input[type="email"]').setValue('eleen@test.com')
    await wrapper.get('input[type="password"]').setValue('Passw0rd!')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).not.toBe('/login'))
    return router.currentRoute.value.fullPath
  }

  it('A19 after logging in from /login?redirect=/pantry the user lands on the Pantry', async () => {
    expect(await logIn('/login?redirect=/pantry')).toBe('/pantry')
  })

  it('A20 without a redirect the user lands on the dashboard', async () => {
    expect(await logIn('/login')).toBe('/dashboard')
  })

  it('A21 a redirect to another website is ignored', async () => {
    expect(await logIn('/login?redirect=//evil.example.com')).toBe('/dashboard')
  })
})
