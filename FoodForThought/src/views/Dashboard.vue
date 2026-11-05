<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch
} from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import DashboardAnalytics from '@/components/DashboardAnalytics.vue'
import WeekAtGlance from '@/components/Dashboard/WeekAtGlance.vue'

const auth = useAuthStore()
const API_URL = import.meta.env.VITE_API_URL
const topRecipes = ref([])
const currentIndex = ref(0)
const loadingRecipes = ref(true)
const recipesError = ref('')
const carouselPaused = ref(false)

const mealProgress = ref(null)
const loadingMealProgress = ref(true)
const mealProgressError = ref('')

let mealProgressRequest = 0

const currentRecipe = computed(() => {
  return topRecipes.value[currentIndex.value]
})

const currentMonth = new Date().toLocaleDateString('en-SG', {
  month: 'long',
  year: 'numeric'
})

/* ---------- Greeting ---------- */
// e.g. "Wednesday, 4 November" + "Good afternoon, Eleen" + a line about today's meals
const todayLong = new Date().toLocaleDateString('en-SG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
})

const greeting = (() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})()

const firstName = computed(() => {
  return (auth.user?.name || '').trim().split(/\s+/)[0]
})

// WeekAtGlance sends { total, left } once this week's plan has loaded
const todaySummary = ref(null)

const todayLine = computed(() => {
  const summary = todaySummary.value
  if (!summary) return 'Here is your week of meals.'
  if (summary.total === 0) return 'Nothing is planned for today yet.'
  if (summary.left === 0) return 'Every meal today is logged.'
  if (summary.left === 1) return 'One meal left to cook today.'
  return `${summary.left} meals left to cook today.`
})

async function loadTopRecipes() {
  loadingRecipes.value = true
  recipesError.value = ''

  try {
    const response = await axios.get(`${API_URL}/analytics`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    topRecipes.value = response.data
    currentIndex.value = 0
  } catch (err) {
    recipesError.value =
      err.response?.data?.message ||
      'Unable to load top recipes.'
  } finally {
    loadingRecipes.value = false
  }
}

async function loadMealProgress() {
  const request = ++mealProgressRequest
  const token = auth.token

  mealProgress.value = null
  mealProgressError.value = ''
  loadingMealProgress.value = false

  if (!token) {
    mealProgressError.value =
      'Please log in to view your meal-plan progress.'
    return
  }

  loadingMealProgress.value = true

  try {
    const response = await axios.get(`${API_URL}/analytics/meal-progress`, {
  headers: {
    Authorization: `Bearer ${token}`
  }
})

    if (
      request !== mealProgressRequest ||
      token !== auth.token
    ) {
      return
    }

    mealProgress.value = response.data
  } catch (err) {
    if (
      request !== mealProgressRequest ||
      token !== auth.token
    ) {
      return
    }

    mealProgressError.value =
      err.response?.data?.message ||
      'Unable to load your meal-plan progress.'
  } finally {
    if (
      request === mealProgressRequest &&
      token === auth.token
    ) {
      loadingMealProgress.value = false
    }
  }
}

function previousRecipe() {
  if (topRecipes.value.length === 0) return

  if (currentIndex.value === 0) {
    currentIndex.value = topRecipes.value.length - 1
  } else {
    currentIndex.value--
  }
}

function nextRecipe() {
  if (topRecipes.value.length === 0) return

  if (currentIndex.value === topRecipes.value.length - 1) {
    currentIndex.value = 0
  } else {
    currentIndex.value++
  }
}

watch(() => auth.token, loadMealProgress)

let carouselTimer

onMounted(() => {
  loadTopRecipes()
  loadMealProgress()

  carouselTimer = setInterval(() => {
    if (
      !loadingRecipes.value &&
      !carouselPaused.value &&
      topRecipes.value.length > 1
    ) {
      nextRecipe()
    }
  }, 5000)
})

onUnmounted(() => {
  clearInterval(carouselTimer)
})
</script>

<template>
  <div class="fft-page">
    <main class="container dashboard-page py-4 py-lg-5 text-start">
      <!-- Page heading: today's date + greeting + how today is going -->
      <header class="dashboard-hero">
        <p class="hero-date">{{ todayLong }}</p>

        <h1 class="dashboard-heading">
          {{ greeting }}<template v-if="firstName">, {{ firstName }}</template>
        </h1>

        <p class="hero-line" aria-live="polite">{{ todayLine }}</p>
      </header>

      <!-- This week grid + suggestion + today's meals -->
      <WeekAtGlance @summary="todaySummary = $event" />

      <!-- Monthly stats -->
      <div class="section-head">
        <h2 class="section-title">{{ currentMonth }}</h2>
        <p class="section-sub">Your progress and what the community is cooking.</p>
      </div>

      <div class="row g-4">
        <!-- Left column -->
        <div class="col-12 col-lg-5">
          <section class="dashboard-card">
            <div class="panel-header">
              <h2 class="panel-label mb-0">
                Most liked recipes
              </h2>

              <span class="period-label">This month</span>
            </div>

            <div class="panel-body">
              <p
                v-if="loadingRecipes"
                class="text-muted"
                role="status"
              >
                Loading recipes...
              </p>

              <div v-else-if="recipesError">
                <p class="text-danger" role="alert">
                  {{ recipesError }}
                </p>

                <button
                  type="button"
                  class="btn dashboard-button btn-sm"
                  @click="loadTopRecipes"
                >
                  Try again
                </button>
              </div>

              <div v-else-if="topRecipes.length === 0">
                <p class="text-muted">
                  No liked recipes this month yet.
                </p>

                <RouterLink
                  to="/community"
                  class="btn dashboard-outline btn-sm"
                >
                  Explore Community
                </RouterLink>
              </div>

              <div v-else aria-roledescription="carousel">
                <RouterLink
                  :to="'/recipes/' + currentRecipe.recipeId"
                >
                  <img
                    v-recipe-img="currentRecipe.image"
                    :alt="currentRecipe.title"
                    class="recipe-image mb-3"
                  >
                </RouterLink>

                <div class="mb-2">
                  <span class="badge rank-badge">
                    #{{ currentIndex + 1 }} this month
                  </span>
                </div>

                <h3 class="h5 mb-2">
                  <RouterLink
                    :to="'/recipes/' + currentRecipe.recipeId"
                    class="recipe-title"
                  >
                    {{ currentRecipe.title }}
                  </RouterLink>
                </h3>

                <div class="mb-3">
                  <span
                    v-for="cuisine in currentRecipe.cuisine"
                    :key="cuisine"
                    class="badge cuisine-badge me-1 mb-1"
                  >
                    {{ cuisine }}
                  </span>
                </div>

                <p class="recipe-meta mb-0">
                  {{ currentRecipe.likeCount }}
                  {{ currentRecipe.likeCount === 1 ? 'like' : 'likes' }}

                  <span v-if="currentRecipe.totalTime != null">
                    <span class="mx-2">·</span>
                    {{ currentRecipe.totalTime }} min
                  </span>
                </p>

                <div
                  v-if="topRecipes.length > 1"
                  class="carousel-controls"
                >
                  <button
                    type="button"
                    class="btn dashboard-outline btn-sm"
                    @click="previousRecipe"
                  >
                    Previous
                  </button>

                  <div class="d-flex align-items-center gap-2">
                    <span class="recipe-meta">
                      {{ currentIndex + 1 }} / {{ topRecipes.length }}
                    </span>

                    <button
                      type="button"
                      class="btn pause-button btn-sm"
                      :aria-pressed="carouselPaused"
                      @click="carouselPaused = !carouselPaused"
                    >
                      {{ carouselPaused ? 'Play' : 'Pause' }}
                    </button>
                  </div>

                  <button
                    type="button"
                    class="btn dashboard-outline btn-sm"
                    @click="nextRecipe"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div class="mt-4">
            <DashboardAnalytics section="cuisines" />
          </div>
        </div>

        <!-- Right column -->
        <div class="col-12 col-lg-7">
          <!-- Monthly meal-plan completion -->
          <section class="dashboard-card">
            <div class="panel-header">
              <h2 class="panel-label mb-0">
                Your meal-plan progress
              </h2>

              <span class="period-label">This month</span>
            </div>

            <div class="panel-body">
              <p
                v-if="loadingMealProgress"
                class="text-muted"
                role="status"
              >
                Loading your meal-plan progress...
              </p>

              <div v-else-if="mealProgressError">
                <p class="text-danger" role="alert">
                  {{ mealProgressError }}
                </p>

                <button
                  type="button"
                  class="btn dashboard-outline btn-sm"
                  @click="loadMealProgress"
                >
                  Try again
                </button>
              </div>

              <div v-else-if="mealProgress">
                <div
                  class="d-flex justify-content-between align-items-end"
                >
                  <div>
                    <p class="text-muted small mb-1">
                      Meals completed
                    </p>

                    <p class="progress-total mb-0">
                      {{ mealProgress.completedMeals }} /
                      {{ mealProgress.totalMeals }}
                    </p>
                  </div>

                  <span class="text-muted small">
                    {{ mealProgress.percentage }}% complete
                  </span>
                </div>

                <div class="meal-progress-box mt-3">
                  <div
                    class="progress"
                    role="progressbar"
                    aria-label="Monthly meal-plan completion"
                    :aria-valuenow="mealProgress.percentage"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div
                      class="progress-bar"
                      :style="{
                        width: mealProgress.percentage + '%'
                      }"
                    ></div>
                  </div>

                  <p
                    v-if="mealProgress.totalMeals === 0"
                    class="text-muted small mt-3 mb-0"
                  >
                    No meals planned for this month yet.
                  </p>

                  <p
                    v-else
                    class="text-muted small mt-3 mb-0"
                  >
                    {{ mealProgress.completedMeals }} of
                    {{ mealProgress.totalMeals }}
                    planned meals completed this month.

                    <span v-if="mealProgress.skippedMeals > 0">
                      {{ mealProgress.skippedMeals }} skipped.
                    </span>
                  </p>
                </div>

                <RouterLink
                  to="/planner"
                  class="btn dashboard-outline btn-sm mt-3"
                >
                  View Meal Plan
                </RouterLink>
              </div>
            </div>
          </section>

          <!-- Your separate comments and likes cards -->
          <div class="mt-4">
            <DashboardAnalytics section="activity" />
          </div>
        </div>
      </div>

      <!-- Shortcuts to the other main pages -->
      <nav class="shortcut-grid" aria-label="Shortcuts">
        <RouterLink to="/pantry" class="shortcut">
          <span class="shortcut-icon material-symbols-outlined" aria-hidden="true">kitchen</span>
          <span>
            <span class="shortcut-title">Pantry</span>
            <span class="shortcut-text">Check what you have and what's expiring.</span>
          </span>
        </RouterLink>

        <RouterLink to="/recipes" class="shortcut">
          <span class="shortcut-icon material-symbols-outlined" aria-hidden="true">menu_book</span>
          <span>
            <span class="shortcut-title">Recipes</span>
            <span class="shortcut-text">Find something new to cook.</span>
          </span>
        </RouterLink>

        <RouterLink to="/community" class="shortcut">
          <span class="shortcut-icon material-symbols-outlined" aria-hidden="true">forum</span>
          <span>
            <span class="shortcut-title">Community</span>
            <span class="shortcut-text">See your comments and liked recipes.</span>
          </span>
        </RouterLink>
      </nav>
    </main>
  </div>
</template>

<style scoped>
.dashboard-page {
  color: var(--fft-text);
}

/* ---------- Greeting ---------- */
.dashboard-hero {
  margin-bottom: 28px;
}

.hero-date {
  margin: 0 0 4px;
  color: var(--fft-primary);
  font: 600 14px/20px 'Inter', sans-serif;
}

.dashboard-heading {
  margin: 0;
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: clamp(30px, 4vw, 40px);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.hero-line {
  margin: 8px 0 0;
  color: var(--fft-secondary-text);
  font: 400 17px/26px 'Inter', sans-serif;
}

/* ---------- Section break between "this week" and "this month" ---------- */
.section-head {
  margin: 48px 0 20px;
  padding-top: 28px;
  border-top: 1px solid var(--fft-surface-high);
}

.section-title {
  margin: 0;
  color: var(--fft-text);
  font: 600 22px/28px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
}

.section-sub {
  margin: 2px 0 0;
  color: var(--fft-muted);
  font-size: 14px;
  line-height: 20px;
}

/* Card headings: readable sentence case instead of tiny capitals */
.panel-label {
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
}

.month-label,
.period-label {
  color: var(--fft-muted);
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
}

.dashboard-card {
  background-color: var(--fft-card);
  border: 1px solid rgb(194 200 192 / 45%);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--fft-surface-high);
}

.panel-body {
  padding: 22px;
}

.recipe-image {
  display: block;
  width: 100%;
  height: 240px;
  object-fit: cover;
  border-radius: 8px;
}

.recipe-title {
  color: var(--fft-primary);
  font-family: 'Outfit', sans-serif;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
  text-decoration: none;
}

.recipe-title:hover {
  color: var(--fft-primary-hover);
}

.rank-badge {
  background-color: var(--fft-peach);
  color: var(--fft-peach-text);
  font-weight: 500;
}

.cuisine-badge {
  background-color: var(--fft-primary-light);
  color: var(--fft-primary-dark);
  font-weight: 500;
}

.recipe-meta {
  color: var(--fft-muted);
  font-size: 0.8rem;
}

.carousel-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--fft-surface-high);
}

.pause-button {
  color: var(--fft-muted);
}

.pause-button:hover {
  color: var(--fft-text);
  background-color: var(--fft-surface-low);
}

.progress-total {
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: 32px;
  font-weight: 500;
  line-height: 40px;
  letter-spacing: -0.01em;
}

.meal-progress-box {
  background-color: var(--fft-surface-low);
  padding: 16px;
  border-radius: 8px;
}

.progress {
  height: 7px;
  background-color: var(--fft-surface-high);
}

.progress-bar {
  background-color: var(--fft-primary);
}

/* ---------- Shortcuts ---------- */
.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 40px;
}

.shortcut {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid rgb(194 200 192 / 45%);
  border-radius: 16px;
  background: var(--fft-card);
  color: var(--fft-text);
  text-decoration: none;
  transition:
    border-color var(--dur-fast, 150ms),
    background-color var(--dur-fast, 150ms);
}

.shortcut:hover {
  border-color: var(--fft-primary);
  background: var(--fft-surface-low);
  color: var(--fft-text);
}

.shortcut:focus-visible {
  outline: 2px solid var(--fft-primary);
  outline-offset: 2px;
}

.shortcut-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--fft-primary-light);
  color: var(--fft-primary-dark);
  font-size: 22px;
}

.shortcut-title {
  display: block;
  font: 600 16px/22px 'Outfit', sans-serif;
}

.shortcut-text {
  display: block;
  color: var(--fft-muted);
  font-size: 13px;
  line-height: 18px;
}

@media (max-width: 767.98px) {
  .shortcut-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

.dashboard-button {
  --bs-btn-color: #FFFFFF;
  --bs-btn-bg: var(--fft-primary);
  --bs-btn-border-color: var(--fft-primary);

  --bs-btn-hover-color: #FFFFFF;
  --bs-btn-hover-bg: var(--fft-primary-hover);
  --bs-btn-hover-border-color: var(--fft-primary-hover);

  --bs-btn-active-color: #FFFFFF;
  --bs-btn-active-bg: var(--fft-primary-hover);
  --bs-btn-active-border-color: var(--fft-primary-hover);

  --bs-btn-disabled-color: #FFFFFF;
  --bs-btn-disabled-bg: var(--fft-primary);
  --bs-btn-disabled-border-color: var(--fft-primary);
}

.dashboard-outline {
  --bs-btn-color: var(--fft-primary);
  --bs-btn-border-color: var(--fft-border);

  --bs-btn-hover-color: var(--fft-primary-hover);
  --bs-btn-hover-bg: var(--fft-surface-low);
  --bs-btn-hover-border-color: var(--fft-primary);

  --bs-btn-active-color: var(--fft-primary-hover);
  --bs-btn-active-bg: var(--fft-surface-high);
  --bs-btn-active-border-color: var(--fft-primary);

  --bs-btn-disabled-color: var(--fft-muted);
  --bs-btn-disabled-border-color: var(--fft-border);
}
</style>