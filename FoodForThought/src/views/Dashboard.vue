<template>
  <div class="container mt-5">
    <div class="card">
      <div class="card-body">
        <h3>{{ title }}</h3>
        <p class="lead">Signed in as: <strong>{{ user?.name }}</strong> — <em>{{ user?.role }}</em></p>
        <button class="btn btn-outline-danger" @click="handleLogout">Logout</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getUser, clearUser, logout as apiLogout } from '../utils/authClient'

const router = useRouter()
const user = ref(null)
const title = ref('')

onMounted(() => {
  user.value = getUser()
  if (!user.value) return router.push('/home')
  title.value = user.value.role === 'admin' ? 'Welcome to the Admin Portal' : 'User Dashboard'
})

const handleLogout = async () => {
  await apiLogout()
  clearUser()
  router.push('/home')
}
</script>

<style scoped>
.lead { margin-bottom: 20px }
</style>
