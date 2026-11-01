<template>
  <div class="fft-page register-page">
    <div class="register-shell">
      <div class="register-card">
        <div class="register-brand" aria-label="FoodForThought brand">
          <span class="brand-icon">🍽️</span>
        </div>

        <h1>Create account</h1>
        <p class="register-subtitle">Start planning meals with your own personalized dashboard.</p>

        <div v-if="errorMessage" class="message-box error-box" role="alert">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="message-box success-box" role="alert">
          {{ successMessage }}
        </div>

        <form @submit.prevent="handleSubmit" novalidate class="register-form">
          <div class="field-group">
            <label for="registerName" class="field-label">Name</label>
            <input
              v-model.trim="form.name"
              type="text"
              class="form-control"
              id="registerName"
              placeholder="John Doe"
              required
            />
          </div>

          <div class="field-group">
            <label for="registerEmail" class="field-label">Email address</label>
            <input
              v-model.trim="form.email"
              type="email"
              class="form-control"
              :class="{ 'is-invalid': form.email && !isEmailValid }"
              id="registerEmail"
              placeholder="name@example.com"
              required
            />
            <div v-if="form.email && !isEmailValid" class="invalid-feedback">
              Please enter a valid email address.
            </div>
          </div>

          <div class="field-group">
            <label for="registerPassword" class="field-label">Password</label>
            <input
              v-model="form.password"
              type="password"
              class="form-control"
              :class="{ 'is-invalid': form.password && !isPasswordValid }"
              id="registerPassword"
              placeholder="At least 8 characters"
              required
            />
            <div v-if="form.password && !isPasswordValid" class="invalid-feedback">
              Password must be at least 8 characters long.
            </div>
          </div>

          <div class="field-group">
            <label for="registerRole" class="field-label">Role</label>
            <select v-model="form.role" class="form-select" id="registerRole" required>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button
            type="submit"
            class="register-button"
            :disabled="isLoading || !isFormValid"
          >
            <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
            {{ isLoading ? 'Registering...' : 'Register' }}
          </button>
        </form>

        <p class="register-footer">
          Already have an account?
          <router-link to="/login">Log in</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 32px 20px;
  background: linear-gradient(180deg, var(--fft-background) 0%, #f2f5f0 100%);
}

.register-shell {
  width: min(100%, 480px);
}

.register-card {
  background: var(--fft-card);
  border: 1px solid var(--fft-border);
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(18, 29, 20, 0.08);
  padding: 32px 26px;
}

.register-brand {
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

.register-card h1 {
  margin: 0;
  text-align: center;
  color: var(--fft-primary-dark);
  font-size: clamp(28px, 4vw, 36px);
  line-height: 1.2;
}

.register-subtitle {
  margin: 10px 0 0;
  text-align: center;
  color: var(--fft-muted);
  font-size: 15px;
}

.message-box {
  margin-top: 20px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
}

.error-box {
  background: rgba(185, 28, 28, 0.08);
  border: 1px solid rgba(185, 28, 28, 0.18);
  color: #b91c1c;
}

.success-box {
  background: rgba(22, 101, 52, 0.08);
  border: 1px solid rgba(22, 101, 52, 0.18);
  color: #166534;
}

.register-form {
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

.form-control,
.form-select {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--fft-border);
  border-radius: 12px;
  background: #fff;
  color: var(--fft-text);
  font-size: 15px;
}

.form-control::placeholder {
  color: var(--fft-muted);
}

.form-control:focus,
.form-select:focus {
  border-color: var(--fft-primary);
  outline: none;
  box-shadow: 0 0 0 4px rgba(50, 83, 60, 0.12);
}

.invalid-feedback {
  margin-top: 6px;
  color: #b91c1c;
  font-size: 12px;
}

.register-button {
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

.register-button:hover {
  background: var(--fft-primary-hover);
}

.register-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.register-footer {
  margin: 20px 0 0;
  text-align: center;
  color: var(--fft-secondary-text);
  font-size: 14px;
}

.register-footer a {
  color: var(--fft-primary);
  font-weight: 600;
  text-decoration: none;
}

.register-footer a:hover {
  text-decoration: underline;
}
</style>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const form = reactive({
  name: '',
  email: '',
  password: '',
  role: 'user'
})

const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailValid = computed(() => emailRegex.test(form.email))
const isPasswordValid = computed(() => form.password.length >= 8)
const isRoleValid = computed(() => ['user', 'admin'].includes(form.role))

const isFormValid = computed(() => {
  return (
    form.name.trim().length > 0 &&
    isEmailValid.value &&
    isPasswordValid.value &&
    isRoleValid.value
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
    const response = await axios.post('http://localhost:8000/auth/register', {
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role
    })

    successMessage.value = response.data.message || 'Account created successfully!'

    setTimeout(() => {
      router.push('/dashboard')
    }, 1500)
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