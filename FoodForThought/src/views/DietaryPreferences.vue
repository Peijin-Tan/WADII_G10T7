<script setup>
/* Dietary Preferences (/preferences, logged-in users only).
   GET/PUT /preferences (server/src/router/preferences.js). The pantry's "What can I cook?" suggestions
   use these (diets -> Spoonacular diet, allergens -> intolerances; see getSavedPreferences in pantry.js).
   Styles: assets/forms.css (fp-). */
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import AppAlert from '@/components/ui/AppAlert.vue'

const auth = useAuthStore()

// value = what is saved (must match DIET_TO_SPOONACULAR / ALLERGEN_TO_SPOONACULAR in pantry.js)
const dietaryOptions = [
  { value: 'Vegetarian', icon: 'eco' },
  { value: 'Vegan', icon: 'spa' },
  { value: 'Gluten-Free', icon: 'grain' },
  { value: 'Dairy-Free', icon: 'water_drop' },
  { value: 'Pescatarian', icon: 'set_meal' },
  { value: 'Keto', icon: 'egg_alt' },
]

const allergenOptions = ['Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Soy', 'Wheat', 'Fish', 'Shellfish', 'Sesame']

const dietaryPreferences = ref([])
const allergens = ref([])
const saved = ref({ diets: [], allergens: [] }) // what the server has, to spot unsaved changes
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

const authHeaders = () => ({ Authorization: `Bearer ${auth.token}` })

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))
const dirty = computed(() =>
  !sameSet(dietaryPreferences.value, saved.value.diets) || !sameSet(allergens.value, saved.value.allergens))

function applyResponse(data) {
  dietaryPreferences.value = data.dietaryPreferences || []
  allergens.value = data.allergens || []
  saved.value = { diets: [...dietaryPreferences.value], allergens: [...allergens.value] }
}

async function loadPreferences() {
  error.value = ''
  loading.value = true
  try {
    const response = await axios.get('/api/preferences', { headers: authHeaders() })
    applyResponse(response.data)
  } catch (err) {
    console.error(err)
    error.value = err.response?.data?.message || 'Failed to load your preferences.'
  } finally {
    loading.value = false
  }
}

async function savePreferences() {
  error.value = ''
  success.value = ''
  saving.value = true
  try {
    const response = await axios.put(
      '/api/preferences',
      { dietaryPreferences: dietaryPreferences.value, allergens: allergens.value },
      { headers: authHeaders() },
    )
    applyResponse(response.data)
    success.value = 'Your preferences have been saved!'
  } catch (err) {
    console.error(err)
    error.value = err.response?.data?.message || 'Failed to save your preferences.'
  } finally {
    saving.value = false
  }
}

function resetChanges() {
  dietaryPreferences.value = [...saved.value.diets]
  allergens.value = [...saved.value.allergens]
}

onMounted(loadPreferences)
</script>

<template>
  <main class="fp">
    <div class="fp-wrap">
      <RouterLink to="/profile" class="fp-back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        Profile
      </RouterLink>

      <header class="fp-head">
        <h1 class="fp-title">Dietary preferences</h1>
        <p class="fp-lede">
          Pick how you eat and what you can't have. "What can I cook?" in your pantry only suggests recipes
          that fit these.
        </p>
      </header>

      <div v-if="loading" class="fp-card fp-loading" role="status">
        <span class="fp-spinner" aria-hidden="true"></span>
        Loading your preferences...
      </div>

      <template v-else>
        <AppAlert v-if="error" tone="error" class="mb-3" @dismiss="error = ''">{{ error }}</AppAlert>
        <AppAlert v-if="success && !dirty" tone="success" class="mb-3" @dismiss="success = ''">{{ success }}</AppAlert>

        <form @submit.prevent="savePreferences">
          <section class="fp-card" aria-labelledby="diets-title">
            <div class="fp-card-head">
              <span class="fp-bubble" aria-hidden="true"><span class="material-symbols-outlined">restaurant</span></span>
              <div>
                <h2 id="diets-title">Diets</h2>
                <p>Choose any that describe how you eat.</p>
              </div>
              <span class="fp-count">{{ dietaryPreferences.length }} selected</span>
            </div>
            <div class="fp-chips" role="group" aria-labelledby="diets-title">
              <label v-for="option in dietaryOptions" :key="option.value" class="fp-chip">
                <input v-model="dietaryPreferences" type="checkbox" :value="option.value" />
                <span class="material-symbols-outlined" aria-hidden="true">
                  {{ dietaryPreferences.includes(option.value) ? 'check' : option.icon }}
                </span>
                {{ option.value }}
              </label>
            </div>
          </section>

          <section class="fp-card" aria-labelledby="allergens-title">
            <div class="fp-card-head">
              <span class="fp-bubble fp-bubble--peach" aria-hidden="true"><span class="material-symbols-outlined">warning</span></span>
              <div>
                <h2 id="allergens-title">Allergens to avoid</h2>
                <p>Recipes with these are always left out of suggestions.</p>
              </div>
              <span class="fp-count">{{ allergens.length }} selected</span>
            </div>
            <div class="fp-chips" role="group" aria-labelledby="allergens-title">
              <label v-for="option in allergenOptions" :key="option" class="fp-chip fp-chip--warn">
                <input v-model="allergens" type="checkbox" :value="option" />
                <span class="material-symbols-outlined" aria-hidden="true">
                  {{ allergens.includes(option) ? 'block' : 'add' }}
                </span>
                {{ option }}
              </label>
            </div>
          </section>

          <div class="fp-actions">
            <button type="submit" class="fp-btn fp-btn--primary" :disabled="saving || !dirty">
              <span v-if="saving" class="fp-spinner" aria-hidden="true"></span>
              {{ saving ? 'Saving...' : 'Save preferences' }}
            </button>
            <button v-if="dirty" type="button" class="fp-btn fp-btn--ghost" :disabled="saving" @click="resetChanges">
              Undo changes
            </button>
            <span v-if="dirty" class="dp-unsaved" role="status">
              <span class="material-symbols-outlined" aria-hidden="true">edit</span>
              Unsaved changes
            </span>
          </div>
        </form>
      </template>
    </div>
  </main>
</template>

<style scoped>
.dp-unsaved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--fp-muted);
  font-size: 14px;
}
.dp-unsaved .material-symbols-outlined {
  font-size: 18px;
}
</style>
