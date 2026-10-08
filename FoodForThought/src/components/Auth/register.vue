<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { register, saveUser } from '../../utils/authClient'

const router = useRouter()
const route = useRoute()
const email = ref('')
const name = ref('')
const password = ref('')
const error = ref(null)

const selectedRole = computed(() => {
  const r = route.query.role
  return r === 'admin' ? 'admin' : 'user'
})

const handleSubmit = async () => {
  error.value = null
  try {
    // include role in payload to scope registration (server may ignore by design)
    const payload = { email: email.value, password: password.value, name: name.value, role: selectedRole.value }
    console.debug('Register payload', payload)
    const res = await register(payload)
    console.debug('Register response', res)
    if (res && res.userId) {
      // save token + user session and redirect
      if (res.token) localStorage.setItem('token', res.token)
      saveUser({ id: res.userId, name: res.name, role: res.role, email: email.value })
      router.push('/dashboard')
      return
    }
    error.value = res?.message || 'Register failed'
  } catch (e) {
    console.error('Register error', e)
    error.value = e?.message || 'Register encountered an error. See console for details.'
  }
}
</script>

<template>
  <div class="container mt-5">
    <div class="col-12 mt-5">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Register</h5>
          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label for="registerName" class="form-label">Full name</label>
              <input v-model="name" type="text" class="form-control" id="registerName" required>
            </div>
            <div class="mb-3">
              <label for="registerEmail" class="form-label">Email address</label>
              <input v-model="email" type="email" class="form-control" id="registerEmail" aria-describedby="emailHelp" required>
              <div id="emailHelp" class="form-text">We'll never share your email with anyone else.</div>
            </div>
            <div class="mb-3">
              <label for="registerPassword" class="form-label">Password</label>
              <input v-model="password" type="password" class="form-control" id="registerPassword" required>
            </div>
            <div v-if="error" class="text-danger mb-2">{{ error }}</div>
            <button type="submit" class="btn btn-primary">Register</button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>