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
  <div class="container min-vh-100 d-flex justify-content-center align-items-center py-4">
    <div class="col-12 col-sm-9 col-md-6 col-lg-4">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Login</h5>
          <p v-if="error" class="text-danger" role="alert">
            {{ error }}
          </p>
          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label for="loginEmail" class="form-label">Email address</label>
              <input type="email" class="form-control" id="loginEmail" v-model="email" required>
            </div>
            <div class="mb-3">
              <label for="loginPassword" class="form-label">Password</label>
              <input type="password" class="form-control" id="loginPassword" v-model="password" required>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="loading">{{ loading ? 'Logging in...' : 'Login' }}</button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>