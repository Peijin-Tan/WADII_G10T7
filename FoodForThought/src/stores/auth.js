import { ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'foodforthought_auth'

export const useAuthStore = defineStore('auth', () => {
  const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')

  const token = ref(persisted?.token || '')
  const user = ref(persisted?.user || null)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: token.value,
      user: user.value
    }))
  }

  function setLogin(data) {
    token.value = data.token
    user.value = data.user
    persist()
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  return { token, user, setLogin, logout }
})