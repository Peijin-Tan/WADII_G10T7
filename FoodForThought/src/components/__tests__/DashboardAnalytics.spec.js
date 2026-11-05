import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import axios from 'axios'
import DashboardAnalytics from '@/components/DashboardAnalytics.vue'
import { renderFeature, flushPromises, button, text, activity, serverError } from './featureTestSupport'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  axios.get.mockImplementation(url => Promise.resolve({ data: url === '/analytics/cuisines'
    ? [{ cuisine: 'chinese', likeCount: 3 }, { cuisine: 'indian', likeCount: 1 }]
    : activity }))
})
describe('DashboardAnalytics in isolation', () => {
  it('A01 displays cuisine shares to one decimal place', async () => {
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'cuisines' } })
    await flushPromises()
    expect(text(wrapper)).toContain('75.0%')
    expect(text(wrapper)).toContain('25.0%')
    expect(text(wrapper)).not.toContain('Your Comments')
    expect(axios.get).toHaveBeenCalledTimes(1)
  })
  it('A02 rounds recurring cuisine percentages', async () => {
    axios.get.mockResolvedValue({ data: [{ cuisine: 'chinese', likeCount: 2 }, { cuisine: 'indian', likeCount: 1 }] })
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'cuisines' } })
    await flushPromises()
    expect(text(wrapper)).toContain('66.7%')
    expect(text(wrapper)).toContain('33.3%')
  })
  it('A03 handles zero cuisine likes without invalid percentages', async () => {
    axios.get.mockResolvedValue({ data: [] })
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'cuisines' } })
    await flushPromises()
    expect(text(wrapper)).toContain('No cuisine likes recorded this month yet.')
    expect(text(wrapper)).not.toContain('NaN')
  })
  it('A04 calculates separate comment and like totals', async () => {
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'activity' } })
    await flushPromises()
    const sections = wrapper.findAll('section')
    expect(text(sections[0])).toMatch(/5\s*comments this period/)
    expect(text(sections[1])).toMatch(/4\s*likes this period/)
    expect(wrapper.findAll('svg[role="img"]')).toHaveLength(2)
    expect(wrapper.get('[aria-label="Comments over the last seven days"]').exists()).toBe(true)
  })
  it('A05 displays zero totals for seven days with no activity', async () => {
    axios.get.mockResolvedValue({ data: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`, commentCount: 0, likeCount: 0,
    })) })
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'activity' } })
    await flushPromises()
    expect(text(wrapper)).toMatch(/0\s*comments this period/)
    expect(text(wrapper)).toMatch(/0\s*likes this period/)
    expect(wrapper.html()).not.toContain('NaN')
  })
  it('A06 shows a message when no activity data is returned', async () => {
    axios.get.mockResolvedValue({ data: [] })
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'activity' } })
    await flushPromises()
    expect(text(wrapper)).toContain('No activity data available.')
  })
  it('A07 shows the activity error and recovers on retry', async () => {
    axios.get.mockRejectedValueOnce(serverError('Activity unavailable'))
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'activity' } })
    await flushPromises()
    expect(text(wrapper)).toContain('Activity unavailable')
    await button(wrapper, 'Try again').trigger('click')
    await flushPromises()
    expect(text(wrapper)).toContain('Your Comments')
    expect(text(wrapper)).not.toContain('Activity unavailable')
  })
  it('A08 asks a guest to log in without requesting personal activity', async () => {
    const { wrapper } = await renderFeature(DashboardAnalytics, { props: { section: 'activity' }, loggedIn: false })
    await flushPromises()
    expect(text(wrapper)).toContain('Please log in to view your activity.')
    expect(axios.get).not.toHaveBeenCalled()
  })
  it('A09 clears the previous personal charts on logout', async () => {
    const { wrapper, auth } = await renderFeature(DashboardAnalytics, { props: { section: 'activity' } })
    await flushPromises()
    expect(text(wrapper)).toMatch(/5\s*comments this period/)
    auth.logout()
    await flushPromises()
    expect(text(wrapper)).toContain('Please log in to view your activity.')
    expect(text(wrapper)).not.toMatch(/5\s*comments this period/)
  })
})
