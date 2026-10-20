<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
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

let carouselTimer

onMounted(() => {
  loadTopRecipes()

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
            <p v-if="loadingRecipes" class="text-muted" role="status">
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
                :to="'/community/post/' + currentRecipe.postId"
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
                  :to="'/community/post/' + currentRecipe.postId"
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
        <section class="dashboard-card">
          <div class="panel-header">
            <h2 class="panel-label mb-0">
              Your meal-plan progress
            </h2>

            <span class="period-label">This month</span>
          </div>

          <div class="panel-body">
            <div class="d-flex justify-content-between align-items-end">
              <div>
                <p class="text-muted small mb-1">Meals completed</p>
                <p class="progress-total mb-0">— / —</p>
              </div>

              <span class="text-muted small">Not connected yet</span>
            </div>

            <div class="meal-progress-box mt-3">
              <div
                class="progress"
                aria-label="Meal-plan progress not available yet"
              ></div>

              <p class="text-muted small mt-3 mb-0">
                Your monthly progress will appear once meal-plan
                tracking is connected.
              </p>
            </div>
          </div>
        </section>

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
</template>

<style scoped>
.dashboard-page {
  color: #303833;
}

.page-label,
.panel-label {
  color: #66716B;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dashboard-heading {
  color: #303D38;
  font-size: clamp(1.5rem, 3vw, 1.9rem);
  font-weight: 500;
  letter-spacing: -0.035em;
}

.month-label,
.period-label {
  color: #7B847E;
  font-size: 0.75rem;
}

.dashboard-card {
  background-color: #FFFFFF;
  border: 1px solid #E6E8E7;
  border-radius: 14px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid #EFF1EF;
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
  color: #4B8A6C;
  font-size: 1.2rem;
  font-weight: 500;
  line-height: 1.4;
  text-decoration: none;
}

.recipe-title:hover {
  color: #386850;
}

.rank-badge {
  background-color: #F6C7B3;
  color: #49372F;
  font-weight: 500;
}

.cuisine-badge {
  background-color: #DCECE9;
  color: #304D52;
  font-weight: 500;
}

.recipe-meta {
  color: #78817B;
  font-size: 0.8rem;
}

.carousel-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #EFF1EF;
}

.pause-button {
  color: #66716B;
  font-size: 0.75rem;
}

.pause-button:hover {
  background-color: #F2F5F3;
}

.progress-total {
  font-size: 1.8rem;
  font-weight: 400;
  letter-spacing: -0.04em;
}

.meal-progress-box {
  background-color: #F5F5F5;
  padding: 16px;
  border-radius: 8px;
}

.progress {
  height: 7px;
  background-color: #E3E6E4;
}

.navigation-title {
  font-size: 1rem;
  font-weight: 500;
}

.dashboard-button {
  --bs-btn-color: #FFFFFF;
  --bs-btn-bg: #4B8A6C;
  --bs-btn-border-color: #4B8A6C;
  --bs-btn-hover-color: #FFFFFF;
  --bs-btn-hover-bg: #386850;
  --bs-btn-hover-border-color: #386850;
  --bs-btn-active-color: #FFFFFF;
  --bs-btn-active-bg: #386850;
  --bs-btn-active-border-color: #386850;
}

.dashboard-outline {
  --bs-btn-color: #4B8A6C;
  --bs-btn-border-color: #CFDCD4;
  --bs-btn-hover-color: #386850;
  --bs-btn-hover-bg: #F0F5F2;
  --bs-btn-hover-border-color: #4B8A6C;
  --bs-btn-active-color: #386850;
  --bs-btn-active-bg: #E5EEE8;
  --bs-btn-active-border-color: #4B8A6C;
}
</style>