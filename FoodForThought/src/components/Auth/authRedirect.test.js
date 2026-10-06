import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

const mockPush = vi.fn()

import Login from './login.vue'
import Register from './register.vue'

describe('auth redirects', () => {
  it('routes the login form to the dashboard', async () => {
    mockPush.mockClear()

    const wrapper = mount(Login)
    await wrapper.find('form').trigger('submit')

    expect(mockPush).toHaveBeenCalledWith('/dashboard')
  })

  it('routes the register form to the dashboard', async () => {
    mockPush.mockClear()

    const wrapper = mount(Register)
    await wrapper.find('form').trigger('submit')

    expect(mockPush).toHaveBeenCalledWith('/dashboard')
  })
})
