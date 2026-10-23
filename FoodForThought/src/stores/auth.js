import { ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'foodforthought_auth'

function readPersistedAuth() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const persisted = readPersistedAuth()

  const token = ref(persisted?.token || '')
  const user = ref(persisted?.user || null)

  function persist() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: token.value,
      user: user.value
    }))
  }

  function setLogin(data) {
    token.value = data?.token || ''
    user.value = data?.user || null
    persist()
  }

  function logout() {
    token.value = ''
    user.value = null
    window.localStorage.removeItem(STORAGE_KEY)
  }

  return { token, user, setLogin, logout }
})