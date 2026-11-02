import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import axios from 'axios'
import Dashboard from '@/views/Dashboard.vue'
import { renderFeature, flushPromises, text, rankedRecipe, progress, activity } from './featureTestSupport'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  axios.get.mockImplementation(url => {
    const data = {
      '/analytics': [rankedRecipe], '/analytics/meal-progress': progress,
      '/analytics/cuisines': [{ cuisine: 'chinese', likeCount: 3 }],
      '/analytics/activity': activity,
    }
    return url in data ? Promise.resolve({ data: data[url] }) : Promise.reject(new Error(`Unexpected request: ${url}`))
  })
})

// Mount the real Dashboard AND both real DashboardAnalytics children.
// HTTP remains mocked: these tests verify Vue integration, not MongoDB.
describe('Dashboard and DashboardAnalytics integration', () => {
  it('I01 displays recipes, meal progress, cuisines and personal charts together', async () => {
    const { wrapper } = await renderFeature(Dashboard)
    await flushPromises()
    expect(text(wrapper)).toContain(rankedRecipe.title)
    expect(text(wrapper)).toContain('67% complete')
    expect(text(wrapper)).toContain('Trending cuisines')
    expect(text(wrapper)).toContain('100.0%')
    expect(text(wrapper)).toMatch(/5\s*comments this period/)
    expect(text(wrapper)).toMatch(/4\s*likes this period/)
    expect(wrapper.findAll('svg[role="img"]')).toHaveLength(2)
  })
  it('I02 updates parent progress and child activity after switching accounts', async () => {
    const { wrapper, auth } = await renderFeature(Dashboard)
    await flushPromises()
    axios.get.mockImplementation(url => {
      if (url === '/analytics/meal-progress') return Promise.resolve({ data: { totalMeals: 1, completedMeals: 0, skippedMeals: 0, percentage: 0 } })
      if (url === '/analytics/activity') return Promise.resolve({ data: [{ date: '2026-11-01', commentCount: 0, likeCount: 0 }] })
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    auth.setLogin({ token: 'token-b', user: { _id: 'user-b', name: 'Ben' } })
    await flushPromises()
    expect(text(wrapper)).toContain('0 / 1')
    expect(text(wrapper)).toMatch(/0\s*comments this period/)
    expect(text(wrapper)).toMatch(/0\s*likes this period/)
    expect(text(wrapper)).not.toContain('67% complete')
  })
  it('I03 clears personal data in both parent and child after logout', async () => {
    const { wrapper, auth } = await renderFeature(Dashboard)
    await flushPromises()
    auth.logout()
    await flushPromises()
    expect(text(wrapper)).toContain('Please log in to view your meal-plan progress.')
    expect(text(wrapper)).toContain('Please log in to view your activity.')
    expect(text(wrapper)).not.toContain('67% complete')
    expect(text(wrapper)).not.toMatch(/5\s*comments this period/)
  })
})
