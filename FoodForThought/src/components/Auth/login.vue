<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { login, saveUser } from '../../utils/authClient'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const error = ref(null)
const fieldErrors = ref({})

const selectedRole = computed(() => {
  const r = route.query.role
  return r === 'admin' ? 'admin' : 'user'
})

const validate = () => {
  fieldErrors.value = {}
  const emailRe = /.+@.+\..+/
  if (!email.value || !emailRe.test(email.value)) {
    fieldErrors.value.email = 'Please enter a valid email.'
  }
  if (!password.value || password.value.length < 6) {
    fieldErrors.value.password = 'Password must be at least 6 characters.'
  }
  return Object.keys(fieldErrors.value).length === 0
}

const handleSubmit = async () => {
  error.value = null
  if (!validate()) return
  const res = await login({ email: email.value, password: password.value, role: selectedRole.value })
  if (res && res.userId) {
    if (res.token) localStorage.setItem('token', res.token)
    saveUser({ id: res.userId, name: res.name, role: res.role, email: email.value })
    router.push('/dashboard')
  } else {
    error.value = res?.message || 'Login failed'
  }
}
</script>

<template>
  <div class="container mt-5">
    <div class="col-12 mt-5">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Login</h5>
          <form @submit.prevent="handleSubmit">
            <div class="mb-2">
              <small class="text-muted">Signing in as <strong>{{ selectedRole }}</strong></small>
            </div>
            <div class="mb-3">
              <label for="loginEmail" class="form-label">Email address</label>
              <input v-model="email" type="email" class="form-control" id="loginEmail" :class="{ 'is-invalid': fieldErrors.email }" >
              <div v-if="fieldErrors.email" class="invalid-feedback">{{ fieldErrors.email }}</div>
            </div>
            <div class="mb-3">
              <label for="loginPassword" class="form-label">Password</label>
              <input v-model="password" type="password" class="form-control" id="loginPassword" :class="{ 'is-invalid': fieldErrors.password }" >
              <div v-if="fieldErrors.password" class="invalid-feedback">{{ fieldErrors.password }}</div>
            </div>
            <div v-if="error" class="text-danger mb-2">{{ error }}</div>
            <button type="submit" class="btn btn-primary">Login</button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>