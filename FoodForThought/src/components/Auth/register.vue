<template>
  <!-- min-vh-100 and d-flex vertically center the form in the viewport -->
  <div class="container min-vh-100 d-flex justify-content-center align-items-center py-4">
    <div class="row justify-content-center w-100">
      <!-- Standardized form card widths across screen sizes -->
      <div class="col-12 col-sm-9 col-md-6 col-lg-4">
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

              <div class="mb-4">
                <label for="registerRole" class="form-label text-secondary small fw-semibold">Role</label>
                <select v-model="form.role" class="form-select" id="registerRole" required>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
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
      errorMessage.value = 'Cannot connect to backend server. Is Express running on port 5000?'
    }
  } finally {
    isLoading.value = false;
  }
}
</script>