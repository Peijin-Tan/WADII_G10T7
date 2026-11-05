// api.js
// One place that creates the axios clients for our Express server.
// Before this file, Planner.vue, ShoppingList.vue and Pantry.vue each had their own copy
// of the same "send the token / log out on 401" code.
//
//   import { createApi } from '@/services/api'
//   const api = createApi('/pantry')      // -> http://localhost:8000/pantry
//   const { data } = await api.get('/')
//
// The server URL can be changed with VITE_API_URL in a .env file (e.g. when deploying).
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function createApi(path = '') {
  const instance = axios.create({ baseURL: `${API_URL}${path}` })

  instance.interceptors.request.use((config) => {
    const auth = useAuthStore()
    if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`
    return config
  })

  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        useAuthStore().logout()
        const here = router.currentRoute.value
        router.push(here.meta.public ? '/login' : { path: '/login', query: { redirect: here.fullPath } })
      }
      return Promise.reject(err)
    },
  )
  return instance
}

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err.response?.data?.message) return err.response.data.message
  if (!err.response) return 'Could not reach the server. Is it running?'
  return fallback
}
