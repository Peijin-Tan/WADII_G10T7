<script setup>
/* Change Password (/change-password, logged-in users only; linked from Profile).
   Sends PATCH /auth/change-password { currentPassword, newPassword } (server/src/router/auth.js).
   createApi sends the login token, and logs out + goes to /login if the login has expired. */
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { createApi, errorMessage } from '@/services/api'
import AppAlert from '@/components/ui/AppAlert.vue'

const api = createApi('/auth')

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const showPasswords = ref(false)
const error = ref('')
const success = ref('')
const submitting = ref(false)

// Live checks, shown under the fields as the user types
const longEnough = computed(() => form.newPassword.length >= 8)
const matches = computed(() => form.confirmPassword === form.newPassword)
const sameAsOld = computed(() => form.newPassword && form.newPassword === form.currentPassword)
const canSubmit = computed(() =>
  form.currentPassword && longEnough.value && matches.value && !sameAsOld.value && !submitting.value)

async function handleSubmit() {
  if (!canSubmit.value) return
  error.value = ''
  success.value = ''
  submitting.value = true

  try {
    const { data } = await api.patch('/change-password', {
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    })
    success.value = data.message || 'Your password has been updated.'
    form.currentPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    showPasswords.value = false
  } catch (err) {
    error.value = errorMessage(err, 'Unable to update your password right now.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="fp">
    <div class="fp-wrap fp-wrap--narrow">
      <RouterLink to="/profile" class="fp-back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        Profile
      </RouterLink>

      <header class="fp-head">
        <h1 class="fp-title">Change password</h1>
        <p class="fp-lede">Enter your current password, then choose a new one with at least 8 characters.</p>
      </header>

      <AppAlert v-if="error" tone="error" title="Password not changed" class="mb-3" @dismiss="error = ''">
        {{ error }}
      </AppAlert>
      <AppAlert v-if="success" tone="success" class="mb-3" @dismiss="success = ''">
        {{ success }}
      </AppAlert>

      <form class="fp-card" novalidate @submit.prevent="handleSubmit">
        <div class="fp-field">
          <label for="currentPassword" class="fp-label">Current password</label>
          <div class="fp-input-wrap">
            <input
              id="currentPassword"
              v-model="form.currentPassword"
              :type="showPasswords ? 'text' : 'password'"
              class="fp-input"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              class="fp-reveal"
              :aria-pressed="showPasswords"
              aria-controls="currentPassword newPassword confirmPassword"
              @click="showPasswords = !showPasswords"
            >
              {{ showPasswords ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <div class="fp-field">
          <label for="newPassword" class="fp-label">New password</label>
          <input
            id="newPassword"
            v-model="form.newPassword"
            :type="showPasswords ? 'text' : 'password'"
            class="fp-input"
            :class="{ 'is-invalid': (form.newPassword && !longEnough) || sameAsOld }"
            autocomplete="new-password"
            aria-describedby="newPasswordHint"
            required
          />
          <p v-if="sameAsOld" id="newPasswordHint" class="fp-hint is-error">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            Must be different from your current password
          </p>
          <p
            v-else
            id="newPasswordHint"
            class="fp-hint"
            :class="{ 'is-ok': longEnough, 'is-error': form.newPassword && !longEnough }"
          >
            <span class="material-symbols-outlined" aria-hidden="true">{{ longEnough ? 'check_circle' : 'info' }}</span>
            At least 8 characters
          </p>
        </div>

        <div class="fp-field">
          <label for="confirmPassword" class="fp-label">Confirm new password</label>
          <input
            id="confirmPassword"
            v-model="form.confirmPassword"
            :type="showPasswords ? 'text' : 'password'"
            class="fp-input"
            :class="{ 'is-invalid': form.confirmPassword && !matches }"
            autocomplete="new-password"
            aria-describedby="confirmPasswordHint"
            required
          />
          <p v-if="form.confirmPassword" id="confirmPasswordHint" class="fp-hint" :class="matches ? 'is-ok' : 'is-error'">
            <span class="material-symbols-outlined" aria-hidden="true">{{ matches ? 'check_circle' : 'error' }}</span>
            {{ matches ? 'Passwords match' : "Passwords don't match" }}
          </p>
        </div>

        <div class="fp-actions">
          <button type="submit" class="fp-btn fp-btn--primary" :disabled="!canSubmit">
            <span v-if="submitting" class="fp-spinner" aria-hidden="true"></span>
            {{ submitting ? 'Updating...' : 'Update password' }}
          </button>
          <RouterLink to="/profile" class="fp-btn fp-btn--ghost">Cancel</RouterLink>
        </div>
      </form>
    </div>
  </main>
</template>
