import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const recipe = {
  _id: '670000000000000000000101', title: 'Tofu stir-fry',
  cuisine: ['chinese'], totalTime: 20, image: '',
}
export const comment = {
  _id: '670000000000000000000201', content: 'Delicious tofu!',
  recipeId: recipe, userId: { _id: 'user-a', name: 'Alex' },
  createdAt: '2026-11-01T01:00:00Z', updatedAt: '2026-11-01T01:00:00Z',
}
export const like = {
  _id: '670000000000000000000301', recipeKey: `recipe-${recipe._id}`,
  recipe, createdAt: comment.createdAt,
}
export const progress = { totalMeals: 3, completedMeals: 2, skippedMeals: 1, percentage: 67 }
export const rankedRecipe = { ...recipe, recipeId: recipe._id, likeCount: 5 }
export const activity = [
  { date: '2026-10-31T00:00:00Z', commentCount: 2, likeCount: 1 },
  { date: '2026-11-01T00:00:00Z', commentCount: 3, likeCount: 3 },
]
export const serverError = (message = 'Server unavailable', status = 500) =>
  ({ response: { status, data: { message } } })
export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
export function button(wrapper, text) {
  const found = wrapper.findAll('button').find(item => item.text() === text)
  if (!found) throw new Error(`Button not found: ${text}`)
  return found
}
export const text = wrapper => wrapper.text().replace(/\s+/g, ' ').trim()

// Real auth store and in-memory router, with no server or database required.
export async function renderFeature(component, { props = {}, stubs = {}, loggedIn = true } = {}) {
  localStorage.clear()
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  if (loggedIn) auth.setLogin({ token: 'token-a', user: { _id: 'user-a', name: 'Alex', role: 'user' } })
  const emptyPage = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/login', '/dashboard', '/community', '/recipes', '/recipes/:id', '/planner', '/pantry']
      .map(path => ({ path, component: emptyPage })),
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(component, { props, global: { plugins: [pinia, router], stubs } })
  return { wrapper, auth, router }
}
export { flushPromises }
