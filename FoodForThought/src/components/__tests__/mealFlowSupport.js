// mealFlowSupport.js
// Shared set-up for the Planner, Shopping List, Pantry and App tests.
//
// WHY A FAKE SERVER?
// Planner.vue, ShoppingList.vue and Pantry.vue talk to Express through createApi()
// (src/services/api.js), which calls axios.create(). Each spec file replaces axios with
// the fake below, so:
//   - the REAL createApi() runs (token header, 401 -> log out), and so does errorMessage()
//   - no Express server or MongoDB is needed, so the tests are fast and repeatable
//   - every test starts from the same known data, so the results never change between runs
//
// Each test describes the server it needs with server.on('GET /planner', handler) (see fakeServer.js).
//
// Usage in a spec file (vi.mock is hoisted, so it must be written in each spec file):
//   vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { confirmState, answerConfirm } from '@/composables/useConfirm'
import { vRecipeImg } from '@/directives/recipeImage'
export { server, httpError, deferred } from './fakeServer'

/* ---------------- Mounting ---------------- */
// A JWT-shaped token that expires in an hour. The router reads its "exp" (a login that has expired
// counts as logged out), so a plain string like 'test-token' would log the test user straight out.
// The signature part is fake: only the server checks signatures, and the server is faked here.
const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
export const TEST_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`

// Logs a user in (real Pinia auth store), sends the real app router to `path`, then mounts the component.
// The real router is used because createApi() and the pages import it directly.
export async function renderPage(component, { path = '/', loggedIn = true, user, stubs = {}, attach = false } = {}) {
  localStorage.clear()
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  if (loggedIn) auth.setLogin({ token: TEST_TOKEN, user: user || { _id: 'u1', name: 'Eleen Chia', role: 'user' } })

  const { default: router } = await import('@/router')
  await router.push(path)
  await router.isReady()

  const wrapper = mount(component, {
    attachTo: attach ? document.body : undefined,
    global: {
      plugins: [pinia, router],
      directives: { 'recipe-img': vRecipeImg },
      stubs: { PageIntro: true, ...stubs },
    },
  })
  await flushPromises()
  return { wrapper, auth, router }
}

/* ---------------- Small helpers ---------------- */

// What a person reads on a button. Material icons are drawn from words ("add", "delete"),
// so those words are left out: <button><span class="material-symbols-outlined">add</span>Add Meal</button> -> "Add Meal"
export function label(el) {
  const copy = el.element.cloneNode(true)
  copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove())
  // a space after every element, like a browser shows separate boxes: <b>Categories</b><b>2</b> -> "Categories 2"
  copy.querySelectorAll('*').forEach((el) => el.after(' '))
  return copy.textContent.replace(/\s+/g, ' ').trim()
}

// The text a person reads (icons left out, whitespace collapsed), so template line breaks don't break assertions
export const text = (wrapper) => label(wrapper)

// The (first) button whose visible label or aria-label is exactly `name`, like Playwright's getByRole('button', { name })
export function button(wrapper, name) {
  const found = wrapper.findAll('button').find((b) => label(b) === name || b.attributes('aria-label') === name)
  if (!found) throw new Error(`Button not found: ${name}`)
  return found
}

// The themed "Are you sure?" dialog (useConfirm). Component tests answer it without drawing it.
export function answerDialog(answer) {
  if (!confirmState.open) throw new Error('Expected a confirm dialog to be open')
  answerConfirm(answer)
}
export { confirmState } from '@/composables/useConfirm'
export { flushPromises } from '@vue/test-utils'

/* ---------------- Fixture data (what the Express routes return) ---------------- */
// Same shape as GET /planner (formatEntry in server/src/router/Planner.js)
export function plannerEntry(overrides = {}) {
  return {
    id: 'e1',
    dayOfWeek: 0,
    mealSlot: 'dinner',
    status: 'Planned',
    servings: 2,
    recipe: {
      id: 'r1',
      title: 'Chicken Rice',
      description: 'Hainanese classic',
      image: '',
      tags: ['chinese', 'high-protein'],
      prepMinutes: 40,
      nutrition: { calories: 600, protein: 35, carbs: 70, fat: 20 },
      ingredients: [
        { name: 'chicken', inPantry: true },
        { name: 'rice', inPantry: true },
        { name: 'ginger', inPantry: false },
      ],
    },
    ...overrides,
  }
}

export const recipeOption = (overrides = {}) => ({
  id: 'r2',
  title: 'Tofu Stir-fry',
  source: 'saved',
  tags: ['vegetarian'],
  ingredients: [{ name: 'tofu' }],
  nutrition: { calories: 400 },
  prepMinutes: 20,
  ...overrides,
})

// Same shape as GET /shoppinglist
export function shoppingItem(overrides = {}) {
  return {
    _id: 'i1',
    name: 'Ginger',
    quantity: 50,
    unit: 'g',
    pantryQuantity: 0,
    category: 'produce',
    purchased: false,
    addedToPantry: false,
    source: 'auto',
    usedIn: [{ title: 'Chicken Rice' }],
    ...overrides,
  }
}

// Same shape as GET /pantry -> { items }
export function pantryItem(overrides = {}) {
  return { _id: 'p1', name: 'Eggs', quantity: 6, unit: 'pcs', category: 'dairy', expiryDate: null, ...overrides }
}

// 'YYYY-MM-DD' n days from today, in local time (same as the app's dates.js)
export function isoInDays(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
