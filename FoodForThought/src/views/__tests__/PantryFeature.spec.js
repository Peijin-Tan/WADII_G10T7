import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import Pantry from '../Pantry.vue'
import { useAuthStore } from '@/stores/auth'

const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}

vi.mock('axios', () => ({
  default: {
    create: () => mockAxiosInstance,
  },
}))

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
  })
}

describe('Pantry feature: neighbourhood food sharing', () => {
  let router

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    const auth = useAuthStore()
    auth.token = 'test-token'
    auth.user = { _id: 'user-1', name: 'Alice', email: 'alice@example.com' }

    router = buildRouter()

    mockAxiosInstance.get.mockImplementation((url) => {
      if (url === '/') {
        return Promise.resolve({ data: { items: [] } })
      }

      if (url === '/neighbours') {
        return Promise.resolve({
          data: {
            friends: [{ _id: 'user-2', name: 'Bob', email: 'bob@example.com' }],
            availableUsers: [],
            pendingIncoming: [{ _id: 'user-3', name: 'Charlie' }],
            pendingOutgoing: [],
          },
        })
      }

      if (url === '/requests') {
        return Promise.resolve({
          data: {
            incomingRequests: [
              {
                _id: 'r-1',
                status: 'pending',
                requestType: 'borrow',
                requester: { _id: 'user-2', name: 'Bob' },
                owner: { _id: 'user-1', name: 'Alice' },
                items: [{ itemId: 'i-1', name: 'Eggs', quantity: 2, unit: 'pcs' }],
                message: 'Can I borrow some eggs?',
                createdAt: new Date().toISOString(),
              },
            ],
            outgoingRequests: [
              {
                _id: 'r-2',
                status: 'approved',
                requestType: 'takeover',
                requester: { _id: 'user-1', name: 'Alice' },
                owner: { _id: 'user-2', name: 'Bob' },
                items: [{ itemId: 'i-2', name: 'Rice', quantity: 1, unit: 'kg' }],
                message: 'Please approve my takeover request.',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        })
      }

      if (url === '/neighbours/user-2') {
        return Promise.resolve({
          data: {
            friend: { _id: 'user-2', name: 'Bob' },
            items: [{ _id: 'i-2', name: 'Rice', quantity: 1, unit: 'kg', category: 'grains' }],
          },
        })
      }

      return Promise.resolve({ data: {} })
    })

    mockAxiosInstance.post.mockResolvedValue({
      data: { message: 'Request sent successfully.' },
    })

    mockAxiosInstance.patch.mockResolvedValue({
      data: { message: 'Request updated.' },
    })
  })

  it('loads the pantry, neighbours, and request history on mount', async () => {
    const wrapper = mount(Pantry, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/')
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/neighbours')
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/requests')

    expect(wrapper.text()).toContain('Requests')
    expect(wrapper.text()).toContain('My request history')
  })

  it('shows incoming friend requests and allows accept/reject actions', async () => {
    const wrapper = mount(Pantry, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Friend requests')
    expect(wrapper.text()).toContain('Charlie')

    const buttons = wrapper.findAll('button')
    expect(buttons.some((button) => button.text().includes('Accept'))).toBe(true)
    expect(buttons.some((button) => button.text().includes('Reject'))).toBe(true)
  })

  it('sends a borrow request for a selected neighbour item', async () => {
    const wrapper = mount(Pantry, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    await wrapper.vm.viewNeighbour('user-2')
    await wrapper.vm.toggleBorrowItem({
      _id: 'i-2',
      name: 'Rice',
      quantity: 1,
      unit: 'kg',
      category: 'grains',
    })

    await wrapper.vm.requestNeighbourAction('borrow')

    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/requests', expect.objectContaining({
      friendId: 'user-2',
      requestType: 'borrow',
      items: expect.arrayContaining([
        expect.objectContaining({ name: 'Rice' }),
      ]),
    }))
  })

  it('approves a pending request from the owner side', async () => {
    const wrapper = mount(Pantry, {
      global: {
        plugins: [router],
      },
    })

    await flushPromises()

    await wrapper.vm.updateRequestStatus('r-1', 'approved')

    expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/requests/r-1', { status: 'approved' })
  })
})
