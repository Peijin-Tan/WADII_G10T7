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

const auth = useAuthStore()

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

async function loadTopRecipes() {
  loadingRecipes.value = true
  recipesError.value = ''

  try {
    const response = await axios.get('/analytics', {
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
    const response = await axios.get(
      '/analytics/meal-progress',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

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
      <!-- Page heading -->
      <header class="mb-4">
        <p class="page-label mb-2">Your overview</p>

        <h1 class="dashboard-heading">
          Welcome to FoodForThought
        </h1>

        <div
          class="d-flex flex-wrap justify-content-between gap-2 mt-2"
        >
          <p class="text-muted mb-0">
            Cook smarter. Waste less. Live healthier.
          </p>

          <p class="month-label mb-0">
            {{ currentMonth }}
          </p>
        </div>
      </header>

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
                    v-if="currentRecipe.image"
                    :src="currentRecipe.image"
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

      <!-- Navigation cards -->
      <div class="row g-4 mt-2">
        <div class="col-12 col-md-4">
          <section class="dashboard-card h-100">
            <div class="panel-body d-flex flex-column h-100">
              <h2 class="navigation-title">My Pantry</h2>

              <p class="text-muted small">
                Check the ingredients you have.
              </p>

              <RouterLink
                to="/pantry"
                class="btn dashboard-button btn-sm mt-auto align-self-start"
              >
                View Pantry
              </RouterLink>
            </div>
          </section>
        </div>

        <div class="col-12 col-md-4">
          <section class="dashboard-card h-100">
            <div class="panel-body d-flex flex-column h-100">
              <h2 class="navigation-title">Recipes</h2>

              <p class="text-muted small">
                Find recipes based on your ingredients.
              </p>

              <RouterLink
                to="/recipes"
                class="btn dashboard-button btn-sm mt-auto align-self-start"
              >
                Browse Recipes
              </RouterLink>
            </div>
          </section>
        </div>

        <div class="col-12 col-md-4">
          <section class="dashboard-card h-100">
            <div class="panel-body d-flex flex-column h-100">
              <h2 class="navigation-title">Community</h2>

              <p class="text-muted small">
                Discover meals shared by the community.
              </p>

              <RouterLink
                to="/community"
                class="btn dashboard-button btn-sm mt-auto align-self-start"
              >
                View Community
              </RouterLink>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-page {
  color: var(--fft-text);
}

.page-label,
.panel-label {
  color: var(--fft-secondary-text);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.dashboard-heading {
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: 32px;
  font-weight: 600;
  line-height: 40px;
  letter-spacing: -0.01em;
}

.month-label,
.period-label {
  color: var(--fft-muted);
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
}

.dashboard-card {
  background-color: var(--fft-card);
  border: 1px solid rgb(194 200 192 / 40%);
  border-radius: 16px;
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

.navigation-title {
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
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