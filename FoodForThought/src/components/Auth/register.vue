<template>
  <AuthShell
    headline="Cook more of the week at home."
    lede="Add what's in your kitchen, plan breakfast, lunch and dinner, then shop from one list."
  >
    <h1 class="auth-title">Create your account</h1>
    <p class="auth-sub">It's free. All you need is your name, email and a password.</p>

    <div v-if="errorMessage" class="auth-alert is-error" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <span>{{ errorMessage }}</span>
    </div>
    <div v-if="successMessage" class="auth-alert is-success" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
      <span>{{ successMessage }}</span>
    </div>

    <form @submit.prevent="handleSubmit" novalidate>
      <div class="auth-field">
        <label for="registerName" class="auth-label">Name</label>
        <input
          id="registerName"
          v-model.trim="form.name"
          type="text"
          class="auth-input"
          placeholder="e.g. Alex Tan"
          autocomplete="name"
          required
        />
      </div>

      <div class="auth-field">
        <label for="registerEmail" class="auth-label">Email address</label>
        <input
          id="registerEmail"
          v-model.trim="form.email"
          type="email"
          class="auth-input"
          :class="{ 'is-invalid': form.email && !isEmailValid }"
          placeholder="name@example.com"
          autocomplete="email"
          :aria-invalid="Boolean(form.email && !isEmailValid)"
          aria-describedby="registerEmailHint"
          required
        />
        <p v-if="form.email && !isEmailValid" id="registerEmailHint" class="auth-hint is-error">
          <span class="material-symbols-outlined" aria-hidden="true">error</span>
          Please enter a valid email address.
        </p>
      </div>

      <div class="auth-field">
        <label for="registerPassword" class="auth-label">Password</label>
        <div class="auth-input-wrap">
          <input
            id="registerPassword"
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            class="auth-input has-toggle"
            :class="{ 'is-invalid': form.password && !isPasswordValid }"
            autocomplete="new-password"
            :aria-invalid="Boolean(form.password && !isPasswordValid)"
            aria-describedby="registerPasswordHint"
            required
          />
          <button
            type="button"
            class="auth-toggle"
            aria-controls="registerPassword"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>
        <!-- Always visible, so people know the rules before they type; each turns green once it's met -->
        <PasswordChecklist id="registerPasswordHint" :password="form.password" />
      </div>

      <button type="submit" class="auth-submit" :disabled="isLoading || !isFormValid">
        <span v-if="isLoading" class="auth-spinner" aria-hidden="true"></span>
        {{ isLoading ? 'Creating account...' : 'Create account' }}
      </button>
    </form>

    <p class="auth-switch">
      Already have an account? <router-link to="/login">Log in</router-link>
    </p>
  </AuthShell>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { API_URL } from '@/services/api'
import AuthShell from './AuthShell.vue'
import PasswordChecklist from './PasswordChecklist.vue'
import { isStrongPassword } from '@/utils/passwordRules'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({
  name: '',
  email: '',
  password: ''
  // (no role: every new account is a normal user; admins are promoted on the admin dashboard)
})

const isLoading = ref(false)
const showPassword = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailValid = computed(() => emailRegex.test(form.email))
const isPasswordValid = computed(() => isStrongPassword(form.password))

const isFormValid = computed(() => {
  return (
    form.name.trim().length > 0 &&
    isEmailValid.value &&
    isPasswordValid.value
  )
})

const handleSubmit = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!isFormValid.value) {
    errorMessage.value = 'Please complete all required fields before submitting.'
    return
  }

  isLoading.value = true

  try {
    await axios.post(`${API_URL}/auth/register`, {
      name: form.name,
      email: form.email,
      password: form.password
    })

    // Log the new account straight in, so the dashboard opens signed in
    // (before, it went to /dashboard without a login token and bounced back to the login page)
    const { data } = await axios.post(`${API_URL}/auth/login`, {
      email: form.email,
      password: form.password
    })
    auth.setLogin(data)

    successMessage.value = 'Account created! Taking you to your dashboard…'
    setTimeout(() => {
      router.push('/dashboard')
    }, 1000)
  } catch (err) {
    if (err.response) {
      errorMessage.value = err.response.data.message || 'Registration failed.'
    } else {
      errorMessage.value = 'Cannot connect to backend server. Is Express running on port 8000?'
    }
  } finally {
    isLoading.value = false;
  }
}
</script>