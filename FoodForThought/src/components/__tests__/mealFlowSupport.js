import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { confirmState, answerConfirm } from '@/composables/useConfirm'
import { vRecipeImg } from '@/directives/recipeImage'
export { server, httpError, deferred } from './fakeServer'

/* ---------------- Mounting ---------------- */
const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
export const TEST_TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`

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

export function label(el) {
  const copy = el.element.cloneNode(true)
  copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove())
  copy.querySelectorAll('*').forEach((el) => el.after(' '))
  return copy.textContent.replace(/\s+/g, ' ').trim()
}

export const text = (wrapper) => label(wrapper)

export function button(wrapper, name) {
  const found = wrapper.findAll('button').find((b) => label(b) === name || b.attributes('aria-label') === name)
  if (!found) throw new Error(`Button not found: ${name}`)
  return found
}

export function answerDialog(answer) {
  if (!confirmState.open) throw new Error('Expected a confirm dialog to be open')
  answerConfirm(answer)
}
export { confirmState } from '@/composables/useConfirm'
export { flushPromises } from '@vue/test-utils'

/* ---------------- Fixture data (what the Express routes return) ---------------- */
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

export function pantryItem(overrides = {}) {
  return { _id: 'p1', name: 'Eggs', quantity: 6, unit: 'pcs', category: 'dairy', expiryDate: null, ...overrides }
}

export function isoInDays(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
