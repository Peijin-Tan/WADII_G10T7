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

  // The login page saves the JWT in the auth store. We only send the token:
  // the server works out who the user is from it (requireAuth -> req.user).
  instance.interceptors.request.use((config) => {
    const auth = useAuthStore()
    if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`
    return config
  })

  // Expired or missing login (tokens last 1h) -> log out and go to the login page
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        useAuthStore().logout()
        router.push('/login')
      }
      return Promise.reject(err)
    },
  )
  return instance
}

// The message to show for a failed request: the server's own message if it sent one
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err.response?.data?.message) return err.response.data.message
  if (!err.response) return 'Could not reach the server. Is it running?'
  return fallback
}
