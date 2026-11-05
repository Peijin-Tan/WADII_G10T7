<script setup>
import { ref } from 'vue'
import axios from 'axios'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthShell from './AuthShell.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)

async function handleSubmit() {
  if (loading.value) return

  error.value = ''
  loading.value = true

  try {
    const response = await axios.post('/auth/login', {
      email: email.value,
      password: password.value
    })

    auth.setLogin(response.data)
    password.value = ''

    // Back to the page the user was trying to open (?redirect=/pantry), otherwise their home page.
    // Only paths inside this site ("/..." but not "//other-site.com") are followed.
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : ''
    const isAdmin = auth.user?.role === 'admin'
    await router.push(safeRedirect || (isAdmin ? '/admindashboard' : '/dashboard'))
  } catch (err) {
    error.value =
      err.response?.data?.message || 'Unable to log in. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell
    headline="Good to see you again."
    lede="Pick up your plan where you left off: check today's meals, tick off what you cooked and see what's running low."
  >
    <h1 class="auth-title">Welcome back</h1>
    <p class="auth-sub">Log in to see this week's meal plan.</p>

    <div v-if="error" class="auth-alert is-error" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <span>{{ error }}</span>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="auth-field">
        <label for="loginEmail" class="auth-label">Email address</label>
        <input
          id="loginEmail"
          v-model="email"
          type="email"
          class="auth-input"
          placeholder="name@example.com"
          autocomplete="email"
          required
        />
      </div>

      <div class="auth-field">
        <label for="loginPassword" class="auth-label">Password</label>
        <div class="auth-input-wrap">
          <input
            id="loginPassword"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="auth-input has-toggle"
            autocomplete="current-password"
            required
          />
          <button
            type="button"
            class="auth-toggle"
            aria-controls="loginPassword"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>
      </div>

      <button type="submit" class="auth-submit" :disabled="loading">
        <span v-if="loading" class="auth-spinner" aria-hidden="true"></span>
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>
    </form>

    <p class="auth-switch">
      New to FoodForThought? <router-link to="/register">Create an account</router-link>
    </p>
  </AuthShell>
</template>
