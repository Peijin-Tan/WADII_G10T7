<script setup>
import { ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

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

    const isAdmin = auth.user?.role === 'admin'
    await router.push(isAdmin ? '/admindashboard' : '/dashboard')
  } catch (err) {
    error.value =
      err.response?.data?.message || 'Unable to log in. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fft-page login-page">
    <div class="login-shell">
      <div class="login-card">
        <div class="login-brand" aria-label="FoodForThought brand">
          <span class="brand-icon">🍽️</span>
        </div>

        <h1>Welcome back</h1>
        <p class="login-subtitle">Log in to continue planning your meals.</p>

        <p v-if="error" class="error-message" role="alert">
          {{ error }}
        </p>

        <form @submit.prevent="handleSubmit" class="login-form">
          <div class="field-group">
            <label for="loginEmail" class="field-label">Email address</label>
            <input
              id="loginEmail"
              v-model="email"
              type="email"
              class="form-control"
              placeholder="you@example.com"
              required
            >
          </div>

          <div class="field-group">
            <label for="loginPassword" class="field-label">Password</label>
            <input
              id="loginPassword"
              v-model="password"
              type="password"
              class="form-control"
              placeholder="Enter your password"
              required
            >
          </div>

          <button type="submit" class="login-button" :disabled="loading">
            {{ loading ? 'Logging in...' : 'Login' }}
          </button>
        </form>

        <p class="login-footer">
          Need an account?
          <router-link to="/register">Create one</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px 20px;
  background: linear-gradient(180deg, var(--fft-background) 0%, #f2f5f0 100%);
}

.login-shell {
  width: min(100%, 440px);
}

.login-card {
  background: var(--fft-card);
  border: 1px solid var(--fft-border);
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(18, 29, 20, 0.08);
  padding: 32px 26px;
}

.login-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
  border-radius: 18px;
  background: var(--fft-primary-light);
  border: 1px solid rgba(50, 83, 60, 0.15);
}

.brand-icon {
  font-size: 30px;
}

.login-card h1 {
  margin: 0;
  text-align: center;
  color: var(--fft-primary-dark);
  font-size: clamp(28px, 4vw, 36px);
  line-height: 1.2;
}

.login-subtitle {
  margin: 10px 0 0;
  text-align: center;
  color: var(--fft-muted);
  font-size: 15px;
}

.error-message {
  margin: 20px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(185, 28, 28, 0.08);
  border: 1px solid rgba(185, 28, 28, 0.18);
  color: #b91c1c;
  font-size: 14px;
}

.login-form {
  display: grid;
  gap: 18px;
  margin-top: 24px;
}

.field-group {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--fft-primary-dark);
}

.form-control {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--fft-border);
  border-radius: 12px;
  background: #fff;
  color: var(--fft-text);
  font-size: 15px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-control::placeholder {
  color: var(--fft-muted);
}

.form-control:focus {
  border-color: var(--fft-primary);
  outline: none;
  box-shadow: 0 0 0 4px rgba(50, 83, 60, 0.12);
}

.login-button {
  width: 100%;
  border: none;
  border-radius: 12px;
  background: var(--fft-primary);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  padding: 14px 18px;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.login-button:hover {
  background: var(--fft-primary-hover);
}

.login-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.login-footer {
  margin: 20px 0 0;
  text-align: center;
  color: var(--fft-secondary-text);
  font-size: 14px;
}

.login-footer a {
  color: var(--fft-primary);
  font-weight: 600;
  text-decoration: none;
}

.login-footer a:hover {
  text-decoration: underline;
}
</style>