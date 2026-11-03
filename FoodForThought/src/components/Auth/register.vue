<template>
  <!-- min-vh-100 and d-flex vertically center the form in the viewport -->
  <div class="container min-vh-100 d-flex justify-content-center align-items-center py-4">
    <div class="row justify-content-center w-100">
      <!-- Standardized form card widths across screen sizes -->
      <div class="col-12 col-sm-10 col-md-8 col-lg-5 col-xl-4 ">
        <div class="card shadow-sm border-0 rounded-3">
          <div class="card-body p-4">
            <h5 class="card-title text-center mb-4 fw-bold">Register</h5>

            <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">
              {{ errorMessage }}
            </div>
            <div v-if="successMessage" class="alert alert-success py-2" role="alert">
              {{ successMessage }}
            </div>

            <form @submit.prevent="handleSubmit" novalidate>
              <div class="mb-3">
                <label for="registerName" class="form-label text-secondary small fw-semibold">Name</label>
                <input
                  v-model.trim="form.name"
                  type="text"
                  class="form-control"
                  id="registerName"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div class="mb-3">
                <label for="registerEmail" class="form-label text-secondary small fw-semibold">Email address</label>
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

              <div class="mb-3">
                <label for="registerPassword" class="form-label text-secondary small fw-semibold">Password</label>
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


              <button
                type="submit"
                class="btn btn-primary w-100 py-2 fw-semibold"
                :disabled="isLoading || !isFormValid"
              >
                <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
                {{ isLoading ? 'Registering...' : 'Register' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { API_URL } from '@/services/api'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({
  name: '',
  email: '',
  password: ''
  // (no role: every new account is a normal user; admins are promoted on the admin dashboard)
})

const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailValid = computed(() => emailRegex.test(form.email))
const isPasswordValid = computed(() => form.password.length >= 8)

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