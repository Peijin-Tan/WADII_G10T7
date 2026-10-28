<script setup>
import { reactive, ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const error = ref('')
const success = ref('')
const submitting = ref(false)

async function handleSubmit() {
  if (submitting.value) return

  error.value = ''
  success.value = ''

  if (!auth.token) {
    error.value = 'Please log in to change your password.'
    router.push('/login')
    return
  }

  if (!form.currentPassword.trim()) {
    error.value = 'Please enter your current password.'
    return
  }

  if (!form.newPassword || form.newPassword.length < 8) {
    error.value = 'Your new password must be at least 8 characters long.'
    return
  }

  if (form.newPassword !== form.confirmPassword) {
    error.value = 'New password and confirm password must match.'
    return
  }

  submitting.value = true

  try {
    await axios.patch(
      'http://localhost:8000/auth/change-password',
      {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword
      },
      {
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      }
    )

    success.value = 'Your password has been updated successfully.'
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
  } catch (err) {
    error.value = err.response?.data?.message || 'Unable to update your password right now.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="container py-5">
    <div class="mb-4">
      <RouterLink to="/profile" class="back-link">← Back to Profile</RouterLink>
      <h1>Change Password</h1>
      <p class="text-muted">
        Update your account password using your current password and a new one.
      </p>
    </div>

    <div class="card shadow-sm border-0">
      <div class="card-body p-4 p-md-5">
        <div v-if="error" class="alert alert-danger" role="alert">
          {{ error }}
        </div>

        <div v-if="success" class="alert alert-success" role="alert">
          {{ success }}
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="mb-3">
            <label for="currentPassword" class="form-label">Current password</label>
            <input
              id="currentPassword"
              v-model="form.currentPassword"
              type="password"
              class="form-control"
              autocomplete="current-password"
              placeholder="Enter current password"
              required
            />
          </div>

          <div class="mb-3">
            <label for="newPassword" class="form-label">New password</label>
            <input
              id="newPassword"
              v-model="form.newPassword"
              type="password"
              class="form-control"
              autocomplete="new-password"
              placeholder="Enter a new password"
              required
            />
          </div>

          <div class="mb-4">
            <label for="confirmPassword" class="form-label">Confirm new password</label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              type="password"
              class="form-control"
              autocomplete="new-password"
              placeholder="Confirm your new password"
              required
            />
          </div>

          <button type="submit" class="btn btn-success w-100" :disabled="submitting">
            {{ submitting ? 'Updating...' : 'Update Password' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.back-link {
  display: inline-block;
  margin-bottom: 16px;
  color: #32533c;
  text-decoration: none;
  font-weight: 600;
}

.back-link:hover {
  text-decoration: underline;
}

.card {
  max-width: 620px;
  margin: 0 auto;
  border-radius: 18px;
  border: 1px solid #e8e9e2;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
}
</style>
