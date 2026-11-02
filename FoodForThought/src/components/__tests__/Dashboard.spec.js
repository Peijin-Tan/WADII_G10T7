import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import axios from 'axios'
import Dashboard from '@/views/Dashboard.vue'
import { renderFeature, flushPromises, button, text, rankedRecipe, progress, serverError, deferred } from './featureTestSupport'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  axios.get.mockImplementation(url => {
    if (url === '/analytics') return Promise.resolve({ data: [rankedRecipe] })
    if (url === '/analytics/meal-progress') return Promise.resolve({ data: progress })
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
})
afterEach(() => vi.useRealTimers())
const renderDashboard = options => renderFeature(Dashboard, { stubs: { DashboardAnalytics: true }, ...options })

describe('Dashboard in isolation', () => {
  it('D01 displays the top recipe and its link', async () => {
    const { wrapper } = await renderDashboard()
    await flushPromises()
    expect(text(wrapper)).toContain(rankedRecipe.title)
    expect(text(wrapper)).toContain('5 likes')
    expect(wrapper.findAll('a').some(a => a.attributes('href') === `/recipes/${rankedRecipe.recipeId}`)).toBe(true)
  })
  it('D02 shows no liked recipes when the response is empty', async () => {
    axios.get.mockImplementation(url => Promise.resolve({ data: url === '/analytics' ? [] : progress }))
    const { wrapper } = await renderDashboard()
    await flushPromises()
    expect(text(wrapper)).toContain('No liked recipes this month yet.')
  })
  it('D03 displays the supplied meal progress and accessible percentage', async () => {
    const { wrapper } = await renderDashboard()
    await flushPromises()
    expect(text(wrapper)).toContain('2 / 3')
    expect(text(wrapper)).toContain('67% complete')
    expect(text(wrapper)).toContain('1 skipped.')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('67')
  })
  it('D04 handles a month with no planned meals', async () => {
    axios.get.mockImplementation(url => Promise.resolve({ data: url === '/analytics' ? [] :
      { totalMeals: 0, completedMeals: 0, skippedMeals: 0, percentage: 0 } }))
    const { wrapper } = await renderDashboard()
    await flushPromises()
    expect(text(wrapper)).toContain('No meals planned for this month yet.')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0')
  })
  it('D05 wraps forward and backward through the recipes', async () => {
    axios.get.mockImplementation(url => Promise.resolve({ data: url === '/analytics'
      ? [rankedRecipe, { ...rankedRecipe, recipeId: 'second', title: 'Lentil soup' }] : progress }))
    const { wrapper } = await renderDashboard()
    await flushPromises()
    await button(wrapper, 'Previous').trigger('click')
    expect(text(wrapper)).toContain('Lentil soup')
    await button(wrapper, 'Next').trigger('click')
    expect(text(wrapper)).toContain(rankedRecipe.title)
    await button(wrapper, 'Next').trigger('click')
    expect(text(wrapper)).toContain('Lentil soup')
  })
  it('D06 advances every five seconds and supports pause and play', async () => {
    // Fake only the carousel timer so flushPromises can still resolve normally.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    axios.get.mockImplementation(url => Promise.resolve({ data: url === '/analytics'
      ? [rankedRecipe, { ...rankedRecipe, recipeId: 'second', title: 'Lentil soup' }] : progress }))
    const { wrapper } = await renderDashboard()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(5000)
    expect(text(wrapper)).toContain('Lentil soup')
    await button(wrapper, 'Pause').trigger('click')
    await vi.advanceTimersByTimeAsync(5000)
    expect(text(wrapper)).toContain('Lentil soup')
    await button(wrapper, 'Play').trigger('click')
    await vi.advanceTimersByTimeAsync(5000)
    expect(text(wrapper)).toContain(rankedRecipe.title)
  })
  it('D07 hides unnecessary controls for one recipe', async () => {
    const { wrapper } = await renderDashboard()
    await flushPromises()
    expect(wrapper.findAll('button').some(b => b.text() === 'Next')).toBe(false)
  })
  it('D08 displays an error and retries top recipes', async () => {
    axios.get.mockRejectedValueOnce(serverError('Top recipes unavailable'))
    const { wrapper } = await renderDashboard()
    await flushPromises()
    expect(text(wrapper)).toContain('Top recipes unavailable')
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(text(wrapper)).toContain(rankedRecipe.title)
  })
  it('D09 asks guests to log in before loading personal progress', async () => {
    const { wrapper } = await renderDashboard({ loggedIn: false })
    await flushPromises()
    expect(text(wrapper)).toContain('Please log in to view your meal-plan progress.')
    expect(axios.get.mock.calls.some(([url]) => url === '/analytics/meal-progress')).toBe(false)
  })
  it('D10 ignores meal progress returned for the previous account', async () => {
    const old = deferred()
    axios.get.mockImplementation(url => url === '/analytics' ? Promise.resolve({ data: [] }) : old.promise)
    const { wrapper, auth } = await renderDashboard()
    axios.get.mockResolvedValue({ data: { totalMeals: 0, completedMeals: 0, skippedMeals: 0, percentage: 0 } })
    auth.setLogin({ token: 'token-b', user: { _id: 'user-b' } })
    await flushPromises()
    old.resolve({ data: progress })
    await flushPromises()
    expect(text(wrapper)).toContain('No meals planned for this month yet.')
    expect(text(wrapper)).not.toContain('67% complete')
  })
})
