<template>
  <div class="auth-landing">
    <div class="landing-card">
      <div class="brand-mark">🌱</div>
      <h1>Welcome to FoodForThought</h1>
        <p>Your personal food management app.</p>

        <div v-if="user" class="mb-3">
          <strong>Signed in as:</strong> {{ user.name }} — <em>{{ user.role }}</em>
        </div>

        <div v-if="!user" class="role-selection">
          <p class="mb-2">Continue as</p>
          <div class="role-row">
            <RouterLink :to="{ name: 'Login', query: { role: 'user' } }" class="role-card">User</RouterLink>
            <RouterLink :to="{ name: 'Login', query: { role: 'admin' } }" class="role-card">Admin</RouterLink>
          </div>
          <div class="mt-3">
            <RouterLink :to="{ name: 'Register', query: { role: 'user' } }" class="btn btn-outline-dark">Register</RouterLink>
          </div>
        </div>

        <div v-else class="action-row">
          <RouterLink v-if="user && user.role === 'admin'" to="/admin" class="btn btn-dark">Admin</RouterLink>
          <RouterLink to="/dashboard" class="btn btn-success">Dashboard</RouterLink>
        </div>
    </div>
  </div>
</template>

<style scoped>
.auth-landing {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f7f9f7 0%, #edf5ef 100%);
  padding: 32px 20px;
}

.landing-card {
  width: min(560px, 100%);
  background: #ffffff;
  border: 1px solid rgba(25, 135, 84, 0.14);
  border-radius: 18px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  padding: 40px 32px 32px;
  text-align: center;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(25, 135, 84, 0.12);
  font-size: 1.8rem;
  margin-bottom: 18px;
}

h1 {
  margin: 0;
  color: #111111;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.1;
  font-weight: 700;
}

p {
  margin: 14px 0 28px;
  color: #4b5563;
  font-size: 1.05rem;
}

.action-row {
  display: flex;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
}

.role-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.role-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.role-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  padding: 12px 18px;
  border-radius: 12px;
  background: #f1fdf6;
  color: #0f5132;
  border: 1px solid rgba(25,135,84,0.12);
  text-decoration: none;
  font-weight: 700;
}

.role-card:hover {
  transform: translateY(-3px);
}

.btn {
  min-width: 130px;
  border-radius: 10px;
  padding: 0.7rem 1.3rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-success {
  background-color: #198754;
  border-color: #198754;
}

.btn-success:hover {
  background-color: #157347;
  border-color: #157347;
}

.btn-outline-dark {
  border-width: 1.5px;
  color: #111111;
  border-color: #111111;
  background: #ffffff;
}

.btn-outline-dark:hover {
  background: #111111;
  color: #ffffff;
}
</style>

<script setup>
import { ref, onMounted } from 'vue'
import { getUser } from '../../utils/authClient'

const user = ref(getUser())

onMounted(() => {
  // reset auth session when landing on home
  localStorage.removeItem('user')
  localStorage.removeItem('token')
  user.value = null
})
</script>