import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref(null)

  function setLogin(data) {
    token.value = data.token
    user.value = data.user
  }

  function logout() {
    token.value = ''
    user.value = null
  }

  return { token, user, setLogin, logout }
})