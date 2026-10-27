
<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const dietaryOptions = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Pescatarian',
  'Keto'
]

const allergenOptions = [
  'Peanuts',
  'Tree Nuts',
  'Milk',
  'Eggs',
  'Soy',
  'Wheat',
  'Fish',
  'Shellfish',
  'Sesame'
]

const dietaryPreferences = ref([])
const allergens = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

const authHeaders = () => ({
  Authorization: `Bearer ${auth.token}`
})

async function loadPreferences() {
  error.value = ''
  loading.value = true

  try {
    if (!auth.token) {
      error.value = 'Please log in to manage your preferences.'
      return
    }

    const response = await axios.get('/api/preferences', {
      headers: authHeaders()
    })

    dietaryPreferences.value =
      response.data.dietaryPreferences || []

    allergens.value = response.data.allergens || []
  } catch (err) {
    console.error(err)
    error.value =
      err.response?.data?.message ||
      'Failed to load your preferences.'
  } finally {
    loading.value = false
  }
}

async function savePreferences() {
  error.value = ''
  success.value = ''

  if (!auth.token) {
    error.value = 'Please log in to save your preferences.'
    return
  }

  saving.value = true

  try {
    const response = await axios.put(
      '/api/preferences',
      {
        dietaryPreferences: dietaryPreferences.value,
        allergens: allergens.value
      },
      {
        headers: authHeaders()
      }
    )

    dietaryPreferences.value =
      response.data.dietaryPreferences || []

    allergens.value = response.data.allergens || []

    success.value = 'Your preferences have been saved!'
  } catch (err) {
    console.error(err)
    error.value =
      err.response?.data?.message ||
      'Failed to save your preferences.'
  } finally {
    saving.value = false
  }
}

onMounted(loadPreferences)
</script>

<template>
  <div class="container py-5">
    <div class="mb-4">
      <h1>Dietary Preferences</h1>
      <p class="text-muted">
        Personalise your recipe experience by selecting your
        dietary preferences and allergens to avoid.
      </p>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div
        class="spinner-border text-success"
        role="status"
      ></div>
      <p class="mt-3">Loading your preferences...</p>
    </div>

    <template v-else>
      <div v-if="error" class="alert alert-danger">
        {{ error }}
      </div>

      <div v-if="success" class="alert alert-success">
        {{ success }}
      </div>

      <form @submit.prevent="savePreferences">
        <section class="card mb-4">
          <div class="card-body">
            <h2 class="h4">Dietary Categories</h2>
            <p class="text-muted">
              Select the dietary styles that suit you.
            </p>

            <div class="row g-3">
              <div
                v-for="option in dietaryOptions"
                :key="option"
                class="col-md-6 col-lg-4"
              >
                <label
                  class="preference-option d-flex align-items-center gap-2"
                >
                  <input
                    v-model="dietaryPreferences"
                    type="checkbox"
                    :value="option"
                    class="form-check-input mt-0"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section class="card mb-4">
          <div class="card-body">
            <h2 class="h4">Allergens to Avoid</h2>
            <p class="text-muted">
              Select any ingredients you need to avoid.
            </p>

            <div class="row g-3">
              <div
                v-for="option in allergenOptions"
                :key="option"
                class="col-md-6 col-lg-4"
              >
                <label
                  class="preference-option d-flex align-items-center gap-2"
                >
                  <input
                    v-model="allergens"
                    type="checkbox"
                    :value="option"
                    class="form-check-input mt-0"
                  />
                  <span>{{ option }}</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <button
          type="submit"
          class="btn btn-success px-4"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : 'Save Preferences' }}
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.preference-option {
  padding: 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  cursor: pointer;
  min-height: 46px;
}

.preference-option:hover {
  background-color: #f8f9fa;
}

.preference-option .form-check-input {
  flex-shrink: 0;
}
</style>
