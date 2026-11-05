
<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { createApi, errorMessage } from '@/services/api'
import RecipeComments from '@/components/RecipeComments.vue'
import { useAuthStore } from '@/stores/auth'
const route = useRoute()
const auth = useAuthStore()
const router = useRouter()
const plannerApi = createApi('/planner')

// Meal planner modal states
const showTodayModal = ref(false)
const showMultiModal = ref(false)

const selectedDate = ref('')
const dateToAdd = ref('')
const selectedDates = ref([])

const mealSlot = ref('lunch')
const servings = ref(1)

const plannerSaving = ref(false)
const plannerMessage = ref('')
const plannerError = ref('')
const recipe = ref(null)
const loading = ref(true)
const error = ref('')

async function fetchRecipe() {
  loading.value = true
  error.value = ''
  recipe.value = null

  try {
    const response = await axios.get(
      `/api/recipes/${route.params.id}`
    )

    recipe.value = response.data.data
  } catch (err) {
    console.error(err)

    if (err.response?.status === 404) {
      error.value = 'Recipe not found.'
    } else if (err.response?.status === 400) {
      error.value = 'Invalid recipe ID.'
    } else {
      error.value = 'Failed to load recipe. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

/* ---------- Page helpers ---------- */
// The four numbers under the title; any that are missing are left out
const stats = computed(() => {
  if (!recipe.value) return []
  return [
    { label: 'Prep', value: recipe.value.prepTime, unit: 'min' },
    { label: 'Cook', value: recipe.value.cookingTime, unit: 'min' },
    { label: 'Total', value: recipe.value.totalTime, unit: 'min' },
    { label: 'Serves', value: recipe.value.servings, unit: '' }
  ].filter(stat => stat.value != null && stat.value !== '')
})

// Steps in order, whatever order the database returns them in
const steps = computed(() => {
  return [...(recipe.value?.instructions || [])].sort(
    (a, b) => (a.step ?? 0) - (b.step ?? 0)
  )
})

// Ingredient checklist: ticks are only kept on this page (not saved)
const checked = ref([])

function toggleIngredient(index) {
  checked.value = checked.value.includes(index)
    ? checked.value.filter(i => i !== index)
    : [...checked.value, index]
}

// Get today's date in local timezone
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// Convert YYYY-MM-DD to local Date
function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Get Monday of the selected week
function getMonday(date) {
  const monday = new Date(date)
  const day = (monday.getDay() + 6) % 7

  monday.setDate(monday.getDate() - day)

  return getLocalDateString(monday)
}

// Convert Sunday-based JS day to Monday-based index
function getDayOfWeek(date) {
  return (date.getDay() + 6) % 7
}

// Open today's meal plan modal
function openTodayModal() {
  selectedDate.value = getLocalDateString()
  mealSlot.value = 'lunch'
  servings.value = Math.min(12, Math.max(1, recipe.value?.servings || 1))

  plannerMessage.value = ''
  plannerError.value = ''

  showTodayModal.value = true
}

// Open multiple days modal
function openMultiModal() {
  selectedDates.value = []
  dateToAdd.value = ''

  mealSlot.value = 'lunch'
  servings.value = Math.min(12, Math.max(1, recipe.value?.servings || 1))

  plannerMessage.value = ''
  plannerError.value = ''

  showMultiModal.value = true
}

// Add a date to selected dates
function addSelectedDate() {
  if (!dateToAdd.value) return

  if (selectedDates.value.includes(dateToAdd.value)) {
    plannerError.value = 'This date has already been selected.'
    return
  }

  selectedDates.value.push(dateToAdd.value)
  selectedDates.value.sort()

  dateToAdd.value = ''
  plannerError.value = ''
}

// Remove a selected date
function removeSelectedDate(date) {
  selectedDates.value = selectedDates.value.filter(d => d !== date)
}

// Send one meal plan entry to backend
async function createPlannerEntry(dateString) {
  const date = parseLocalDate(dateString)

  const payload = {
    start: getMonday(date),
    dayOfWeek: getDayOfWeek(date),
    mealSlot: mealSlot.value,
    servings: Number(servings.value),
    recipeId: recipe.value._id
  }

  // Uses the same authenticated API service as Planner.vue
  const response = await plannerApi.post('/entries', payload)

  return response.data
}


// Add recipe to today's meal plan
async function addToToday() {
  if (!auth.token) {
    plannerError.value = 'Please log in to add recipes to your meal plan.'
    return
  }

  if (!recipe.value?._id) {
    plannerError.value = 'This recipe cannot be added to your meal plan.'
    return
  }

  plannerSaving.value = true
  plannerError.value = ''

  try {
    await createPlannerEntry(selectedDate.value)

    showTodayModal.value = false

    // Redirect to Planner after successfully saving
    await router.push('/planner')
  } catch (err) {
    console.error('Meal plan error:', err.response?.data || err)

    plannerError.value = errorMessage(
      err,
      'Failed to add recipe. Please try again.'
    )
  } finally {
    plannerSaving.value = false
  }
}


// Add recipe to multiple selected dates
async function addToMultipleDays() {
  if (!auth.token) {
    plannerError.value = 'Please log in to add recipes to your meal plan.'
    return
  }

  if (!recipe.value?._id) {
    plannerError.value = 'This recipe cannot be added to your meal plan.'
    return
  }

  if (selectedDates.value.length === 0) {
    plannerError.value = 'Please select at least one date.'
    return
  }

  plannerSaving.value = true
  plannerError.value = ''

  try {
    for (const date of selectedDates.value) {
      await createPlannerEntry(date)
    }

    showMultiModal.value = false

    // Redirect to Planner after all dates are saved
    await router.push('/planner')
  } catch (err) {
    console.error('Meal plan error:', err.response?.data || err)

    plannerError.value = errorMessage(
      err,
      'Failed to add recipe. Please try again.'
    )
  } finally {
    plannerSaving.value = false
  }
}


onMounted(fetchRecipe)
</script>

<template>
  <div class="fft-page">
    <main class="container recipe-page py-4 py-lg-5 text-start">
      <RouterLink to="/recipes" class="rd-back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        All recipes
      </RouterLink>

      <!-- Loading -->
      <div v-if="loading" class="rd-hero" aria-busy="true" aria-label="Loading recipe">
        <div class="rd-photo rd-skeleton"></div>
        <div>
          <div class="rd-skeleton rd-skeleton-line" style="width: 30%"></div>
          <div class="rd-skeleton rd-skeleton-line is-title"></div>
          <div class="rd-skeleton rd-skeleton-line"></div>
          <div class="rd-skeleton rd-skeleton-line" style="width: 70%"></div>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="rd-empty" role="alert">
        <span class="material-symbols-outlined rd-empty-icon" aria-hidden="true">no_meals</span>
        <h1 class="rd-empty-title">{{ error }}</h1>
        <p>It may have been removed, or the link is wrong.</p>
        <RouterLink to="/recipes" class="rd-btn rd-btn-outline">Browse recipes</RouterLink>
      </div>

      <article v-else-if="recipe">
        <!-- ===== Photo + title + key numbers ===== -->
        <header class="rd-hero">
          <div class="rd-photo">
            <img v-recipe-img="recipe.image" :alt="recipe.title" />
          </div>

          <div class="rd-intro">
            <p class="rd-source" :class="recipe.source === 'spoonacular' ? 'is-web' : 'is-community'">
              {{ recipe.source === 'spoonacular' ? 'From Spoonacular' : 'Community recipe' }}
            </p>

            <h1 class="rd-title">{{ recipe.title }}</h1>

            <p class="rd-summary">
              {{ recipe.summary || 'No description yet.' }}
            </p>

            <!-- Meal Plan Buttons -->
            <div class="rd-planner-actions">
              <button
                class="rd-planner-btn"
                @click="openTodayModal"
              >
                + Add to Today's Meal Plan
              </button>

              <button
                class="rd-planner-btn rd-planner-btn-secondary"
                @click="openMultiModal"
              >
                + Add to Multiple Days
              </button>
            </div>

            <!-- Success Message -->
            <div v-if="plannerMessage" class="rd-planner-success">
              {{ plannerMessage }}
            </div>

            <dl v-if="stats.length" class="rd-stats">
              <div v-for="stat in stats" :key="stat.label" class="rd-stat">
                <dt>{{ stat.label }}</dt>
                <dd>
                  {{ stat.value }}<span v-if="stat.unit" class="rd-unit">{{ stat.unit }}</span>
                </dd>
              </div>
            </dl>

            <div
              v-if="recipe.cuisine?.length || recipe.dietaryCategories?.length"
              class="rd-tags"
            >
              <span v-for="name in recipe.cuisine" :key="'c-' + name" class="rd-tag is-cuisine">
                {{ name }}
              </span>
              <span v-for="diet in recipe.dietaryCategories" :key="'d-' + diet" class="rd-tag">
                {{ diet }}
              </span>
            </div>

            <a
              v-if="recipe.sourceUrl"
              :href="recipe.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="rd-btn rd-btn-outline rd-original"
            >
              View original recipe
              <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
              <span class="visually-hidden">(opens in a new tab)</span>
            </a>
          </div>
        </header>

        <!-- ===== Ingredients (left, stays in view) + method (right) ===== -->
        <div class="rd-body">
          <aside class="rd-side">
            <section class="rd-panel rd-ingredients-panel" aria-labelledby="rd-ingredients-title">
              <div class="rd-panel-head">
                <h2 id="rd-ingredients-title" class="rd-h2">Ingredients</h2>
                <span v-if="recipe.ingredients?.length" class="rd-panel-meta">
                  {{ checked.length ? `${checked.length} of ${recipe.ingredients.length} ready` : 'Tick off as you go' }}
                </span>
              </div>

              <ul v-if="recipe.ingredients?.length" class="rd-ingredients">
                <li v-for="(ingredient, index) in recipe.ingredients" :key="index">
                  <label class="rd-ingredient" :class="{ 'is-checked': checked.includes(index) }">
                    <input
                      type="checkbox"
                      class="rd-check"
                      :checked="checked.includes(index)"
                      @change="toggleIngredient(index)"
                    />
                    <span class="rd-ingredient-name">{{ ingredient.name }}</span>
                    <span class="rd-ingredient-amount">{{ ingredient.amount }} {{ ingredient.unit }}</span>
                  </label>
                </li>
              </ul>
              <p v-else class="rd-muted m-0">No ingredients listed.</p>
            </section>

            <section v-if="recipe.nutrition?.length" class="rd-panel" aria-labelledby="rd-nutrition-title">
              <h2 id="rd-nutrition-title" class="rd-h2 rd-h2-sm">Nutrition</h2>
              <dl class="rd-nutrition">
                <div v-for="(item, index) in recipe.nutrition" :key="index">
                  <dt>{{ item.name }}</dt>
                  <dd>{{ item.amount ?? 'N/A' }} {{ item.unit || '' }}</dd>
                </div>
              </dl>
            </section>

            <section v-if="recipe.allergens?.length" class="rd-panel rd-allergens" aria-labelledby="rd-allergens-title">
              <h2 id="rd-allergens-title" class="rd-h2 rd-h2-sm">
                <span class="material-symbols-outlined" aria-hidden="true">warning</span>
                Contains
              </h2>
              <div class="rd-tags m-0">
                <span v-for="allergen in recipe.allergens" :key="allergen" class="rd-tag is-allergen">
                  {{ allergen }}
                </span>
              </div>
            </section>
          </aside>

          <section class="rd-method" aria-labelledby="rd-method-title">
            <h2 id="rd-method-title" class="rd-h2">Method</h2>

            <!-- A real sequence, so a numbered list -->
            <ol v-if="steps.length" class="rd-steps">
              <li v-for="(instruction, index) in steps" :key="index" class="rd-step">
                <span class="rd-step-num" aria-hidden="true">{{ index + 1 }}</span>
                <p class="rd-step-text">{{ instruction.description }}</p>
              </li>
            </ol>
            <p v-else class="rd-muted">No cooking instructions yet.</p>
          </section>
        </div>

        <RecipeComments
          :key="recipe._id"
          :recipe-id="recipe._id"
        />
      </article>
    </main>
  </div>
  <!-- Today's Meal Plan Modal -->
<div
  v-if="showTodayModal"
  class="rd-modal-overlay"
  @click.self="showTodayModal = false"
>
  <div class="rd-modal">
    <h2>Add to Today's Meal Plan</h2>

    <p>{{ recipe?.title }}</p>

    <label>Date</label>
    <input
      v-model="selectedDate"
      type="date"
      class="rd-modal-input"
    />

    <label>Meal Slot</label>
    <select v-model="mealSlot" class="rd-modal-input">
      <option value="breakfast">Breakfast</option>
      <option value="lunch">Lunch</option>
      <option value="dinner">Dinner</option>
      <option value="snack">Snack</option>
    </select>

    <label>Servings</label>
    <input
      v-model.number="servings"
      type="number"
      min="1"
      max="12"
      class="rd-modal-input"
    />

    <p v-if="plannerError" class="rd-planner-error">
      {{ plannerError }}
    </p>

    <div class="rd-modal-actions">
      <button
        class="rd-planner-btn rd-planner-btn-secondary"
        @click="showTodayModal = false"
      >
        Cancel
      </button>

      <button
        class="rd-planner-btn"
        :disabled="plannerSaving"
        @click="addToToday"
      >
        {{ plannerSaving ? 'Adding...' : 'Add Recipe' }}
      </button>
    </div>
  </div>
</div>

<!-- Multiple Days Modal -->
<div
  v-if="showMultiModal"
  class="rd-modal-overlay"
  @click.self="showMultiModal = false"
>
  <div class="rd-modal">
    <h2>Add to Multiple Days</h2>

    <p>{{ recipe?.title }}</p>

    <label>Select Dates</label>

    <div class="rd-date-picker-row">
      <input
        v-model="dateToAdd"
        type="date"
        class="rd-modal-input"
      />

      <button
        class="rd-planner-btn"
        @click="addSelectedDate"
      >
        Add Date
      </button>
    </div>

    <!-- Selected Dates -->
    <div class="rd-selected-dates">
      <div
        v-for="date in selectedDates"
        :key="date"
        class="rd-selected-date"
      >
        <span>{{ date }}</span>

        <button
          type="button"
          @click="removeSelectedDate(date)"
        >
          ×
        </button>
      </div>

      <p v-if="selectedDates.length === 0">
        No dates selected yet.
      </p>
    </div>

    <label>Meal Slot</label>
    <select v-model="mealSlot" class="rd-modal-input">
      <option value="breakfast">Breakfast</option>
      <option value="lunch">Lunch</option>
      <option value="dinner">Dinner</option>
      <option value="snack">Snack</option>
    </select>

    <label>Servings</label>
    <input
      v-model.number="servings"
      type="number"
      min="1"
      max="12"
      class="rd-modal-input"
    />

    <p v-if="plannerError" class="rd-planner-error">
      {{ plannerError }}
    </p>

    <div class="rd-modal-actions">
      <button
        class="rd-planner-btn rd-planner-btn-secondary"
        @click="showMultiModal = false"
      >
        Cancel
      </button>

      <button
        class="rd-planner-btn"
        :disabled="plannerSaving || selectedDates.length === 0"
        @click="addToMultipleDays"
      >
        {{ plannerSaving ? 'Adding...' : 'Add Recipe' }}
      </button>
    </div>
  </div>
</div>
</template>

<style scoped>
.recipe-page {
  color: var(--fft-text);
}

.rd-muted {
  color: var(--fft-muted);
}

/* ---------- Back link ---------- */
.rd-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 24px;
  padding: 6px 12px 6px 8px;
  border-radius: 9999px;
  color: var(--fft-secondary-text);
  font: 600 14px/20px 'Inter', sans-serif;
  text-decoration: none;
  transition: background-color var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
}

.rd-back:hover {
  background: var(--fft-surface-high);
  color: var(--fft-text);
}

.rd-back .material-symbols-outlined {
  font-size: 20px;
}

/* ---------- Hero ---------- */
.rd-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 40px;
  align-items: center;
  margin-bottom: 48px;
}

.rd-photo {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 24px;
  background: var(--fft-surface-high);
}

.rd-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rd-source {
  display: inline-block;
  margin: 0 0 12px;
  padding: 2px 10px;
  border-radius: 6px;
  font: 600 12px/20px 'Inter', sans-serif;
}

.rd-source.is-community {
  background: var(--fft-primary-light);
  color: var(--fft-primary-dark);
}

.rd-source.is-web {
  background: var(--fft-peach);
  color: var(--fft-peach-text);
}

.rd-title {
  margin: 0;
  font: 600 clamp(32px, 4.4vw, 48px) / 1.08 'Outfit', sans-serif;
  letter-spacing: -0.025em;
  text-wrap: balance;
}

.rd-summary {
  max-width: 60ch;
  margin: 14px 0 0;
  color: var(--fft-secondary-text);
  font-size: 16px;
  line-height: 26px;
}

/* Prep / Cook / Total / Serves in one strip */
.rd-stats {
  display: flex;
  margin: 24px 0 0;
  padding: 16px 0;
  border-top: 1px solid var(--fft-surface-high);
  border-bottom: 1px solid var(--fft-surface-high);
}

.rd-stat {
  flex: 1;
  padding: 0 16px;
  border-left: 1px solid var(--fft-surface-high);
}

.rd-stat:first-child {
  padding-left: 0;
  border-left: 0;
}

.rd-stat dt {
  color: var(--fft-muted);
  font: 500 13px/18px 'Inter', sans-serif;
}

.rd-stat dd {
  margin: 2px 0 0;
  font: 600 26px/32px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
}

.rd-unit {
  margin-left: 3px;
  color: var(--fft-secondary-text);
  font: 500 14px/20px 'Inter', sans-serif;
}

.rd-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.rd-tag {
  padding: 4px 12px;
  border: 1px solid var(--fft-border);
  border-radius: 9999px;
  color: var(--fft-secondary-text);
  font: 500 13px/18px 'Inter', sans-serif;
}

.rd-tag.is-cuisine {
  border-color: transparent;
  background: var(--fft-primary-light);
  color: var(--fft-primary-dark);
}

.rd-tag.is-allergen {
  border-color: transparent;
  background: var(--fft-peach);
  color: var(--fft-peach-text);
  text-transform: capitalize;
}

/* ---------- Buttons ---------- */
.rd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 10px 16px;
  font: 600 14px/20px 'Inter', sans-serif;
  text-decoration: none;
  transition: border-color var(--dur-fast, 150ms), background-color var(--dur-fast, 150ms);
}

.rd-btn .material-symbols-outlined {
  font-size: 18px;
}

.rd-btn-outline {
  border-color: var(--fft-border);
  background: var(--fft-card);
  color: var(--fft-primary);
}

.rd-btn-outline:hover {
  border-color: var(--fft-primary);
  color: var(--fft-primary);
}

.rd-original {
  margin-top: 20px;
}

/* ---------- Body: ingredients + method ---------- */
.rd-body {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 1.8fr);
  gap: 40px;
  align-items: start;
  margin-bottom: 48px;
}

.rd-side {
  position: sticky; /* the ingredient list stays in view while you read the method */
  top: 96px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rd-panel {
  padding: 22px 22px 18px;
  border: 1px solid rgb(194 200 192 / 45%);
  border-radius: 20px;
  background: var(--fft-card);
}

.rd-panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.rd-panel-meta {
  color: var(--fft-muted);
  font-size: 13px;
  line-height: 18px;
}

.rd-h2 {
  margin: 0;
  font: 600 22px/28px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
}

.rd-h2-sm {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 17px;
  line-height: 24px;
}

.rd-h2-sm .material-symbols-outlined {
  font-size: 20px;
  color: var(--fft-peach-text);
}

/* Ingredient checklist */
.rd-ingredients {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rd-ingredients li + li {
  border-top: 1px solid var(--fft-surface-low);
}

.rd-ingredient {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  cursor: pointer;
}

.rd-check {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--fft-primary);
  cursor: pointer;
}

.rd-ingredient-name {
  font-weight: 500;
  transition: color var(--dur-fast, 150ms);
}

.rd-ingredient-amount {
  color: var(--fft-muted);
  font-size: 14px;
  white-space: nowrap;
}

.rd-ingredient.is-checked .rd-ingredient-name {
  color: var(--fft-muted);
  text-decoration: line-through;
}

/* Nutrition as a two-column list */
.rd-nutrition {
  margin: 0;
}

.rd-nutrition > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 14px;
}

.rd-nutrition > div + div {
  border-top: 1px solid var(--fft-surface-low);
}

.rd-nutrition dt {
  color: var(--fft-secondary-text);
  font-weight: 400;
}

.rd-nutrition dd {
  margin: 0;
  font-weight: 600;
}

.rd-allergens {
  background: #fff3ed;
  border-color: #f7cfbf;
}

/* Method */
.rd-method .rd-h2 {
  margin-bottom: 8px;
}

.rd-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rd-step {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 16px;
  padding: 22px 0;
  border-bottom: 1px solid var(--fft-surface-high);
}

.rd-step:last-child {
  border-bottom: 0;
}

.rd-step-num {
  font: 600 36px/1 'Outfit', sans-serif;
  color: var(--fft-primary);
  letter-spacing: -0.02em;
}

.rd-step-text {
  max-width: 64ch;
  margin: 0;
  font-size: 17px;
  line-height: 28px;
}

/* ---------- Empty / error ---------- */
.rd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px;
  border: 1px dashed var(--fft-border);
  border-radius: 20px;
  text-align: center;
  color: var(--fft-secondary-text);
}

.rd-empty-icon {
  margin-bottom: 8px;
  font-size: 44px;
  color: var(--fft-muted);
}

.rd-empty-title {
  margin: 0 0 4px;
  font: 600 24px/30px 'Outfit', sans-serif;
  color: var(--fft-text);
}

.rd-empty .rd-btn {
  margin-top: 16px;
}

/* ---------- Loading ---------- */
.rd-skeleton {
  background: linear-gradient(90deg, var(--fft-surface-low) 25%, var(--fft-surface-high) 50%, var(--fft-surface-low) 75%);
  background-size: 200% 100%;
  animation: rd-shimmer 1.2s linear infinite;
}

.rd-skeleton-line {
  height: 18px;
  margin-bottom: 14px;
  border-radius: 6px;
}

.rd-skeleton-line.is-title {
  height: 44px;
  width: 85%;
}

@keyframes rd-shimmer {
  to { background-position: -200% 0; }
}

/* ---------- Smaller screens ---------- */
@media (max-width: 991.98px) {
  .rd-hero,
  .rd-body {
    grid-template-columns: 1fr;
    gap: 28px;
  }

  /* Phones/tablets: Ingredients, then Method, then nutrition + allergens.
     display: contents lets the panels inside the sidebar be ordered alongside the method. */
  .rd-side {
    display: contents;
  }

  .rd-ingredients-panel {
    order: 1;
  }

  .rd-method {
    order: 2;
  }

  .rd-side > .rd-panel:not(.rd-ingredients-panel) {
    order: 3;
  }
}

@media (max-width: 575.98px) {
  .rd-photo {
    border-radius: 18px;
  }

  .rd-stat {
    padding: 0 10px;
  }

  .rd-stat dd {
    font-size: 22px;
    line-height: 28px;
  }

  .rd-step {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 12px;
  }

  .rd-step-num {
    font-size: 28px;
  }

  .rd-step-text {
    font-size: 16px;
    line-height: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rd-skeleton {
    animation: none;
  }
}

/* Meal Planner Buttons */
.rd-planner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0;
}

.rd-planner-btn {
  padding: 12px 18px;
  border: none;
  border-radius: 10px;
  background: #e879a9;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
}

.rd-planner-btn:hover {
  background: #d85c91;
}

.rd-planner-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.rd-planner-btn-secondary {
  background: #f3e4ec;
  color: #8c4268;
}

.rd-planner-btn-secondary:hover {
  background: #ead2df;
}

/* Modal */
.rd-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 9999;
}

.rd-modal {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  background: white;
  border-radius: 18px;
  padding: 28px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.rd-modal h2 {
  margin-top: 0;
  margin-bottom: 10px;
}

.rd-modal label {
  display: block;
  margin-top: 18px;
  margin-bottom: 8px;
  font-weight: 600;
}

.rd-modal-input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
}

.rd-date-picker-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.rd-date-picker-row .rd-modal-input {
  flex: 1;
}

.rd-selected-dates {
  margin-top: 12px;
}

.rd-selected-date {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #f9edf3;
  border-radius: 8px;
}

.rd-selected-date button {
  border: none;
  background: transparent;
  color: #c44c80;
  font-size: 20px;
  cursor: pointer;
}

.rd-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.rd-planner-success {
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: #e8f7ed;
  color: #247543;
}

.rd-planner-error {
  margin-top: 12px;
  color: #d33;
}
</style>
