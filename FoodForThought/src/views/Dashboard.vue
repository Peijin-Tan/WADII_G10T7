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
    if (!loadingRecipes.value && topRecipes.value.length > 1) {
      nextRecipe()
    }
  }, 5000)
})

onUnmounted(() => {
  clearInterval(carouselTimer)
})
</script>

<template>
  <div class="container mt-5 mb-5 text-start">
    <h1 class="dashboard-heading">
      Welcome to FoodForThought
    </h1>

    <p class="text-muted">
      Cook smarter. Waste less. Live healthier.
    </p>

    <h3 class="text-muted">{{ currentMonth }}</h3>

    <div class="row g-4 mt-2">

      <!-- LEFT: recipe carousel and trending cuisines -->
      <div class="col-12 col-lg-5">
        <section class="card shadow-sm">
          <div class="card-body">
            <h2 class="h5 fw-bold">Most Liked Recipes</h2>

            <p class="text-muted small">
              The community's most-liked recipes of the month.
            </p>

            <p v-if="loadingRecipes" role="status">
              Loading recipes...
            </p>

            <div v-else-if="recipesError">
              <p class="text-danger" role="alert">
                {{ recipesError }}
              </p>

              <button
                type="button"
                class="btn dashboard-button"
                @click="loadTopRecipes"
              >
                Try again
              </button>
            </div>

            <p v-else-if="topRecipes.length === 0" class="text-muted">
              No liked recipes this month yet.
            </p>

            <div v-else aria-roledescription="carousel">
              <div aria-live="polite" aria-atomic="true">

                <!-- Clickable recipe picture -->
                <RouterLink
                  :to="'/community/post/' + currentRecipe.postId"
                >
                  <img
                    v-if="currentRecipe.image"
                    :src="currentRecipe.image"
                    :alt="currentRecipe.title"
                    class="recipe-image rounded mb-3"
                  >
                </RouterLink>

                <div>
                  <span class="badge rank-badge mb-2">
                    Rank #{{ currentIndex + 1 }}
                  </span>
                </div>

                <!-- Clickable recipe title -->
                <h3 class="h5">
                  <RouterLink
                    :to="'/community/post/' + currentRecipe.postId"
                    class="recipe-title text-decoration-none"
                  >
                    {{ currentRecipe.title }}
                  </RouterLink>
                </h3>

                <div class="mb-2">
                  <span
                    v-for="cuisine in currentRecipe.cuisine"
                    :key="cuisine"
                    class="badge cuisine-badge me-2 mb-1"
                  >
                    {{ cuisine }}
                  </span>
                </div>

                <p class="text-muted small">
                  {{ currentRecipe.likeCount }}
                  {{ currentRecipe.likeCount === 1 ? 'like' : 'likes' }}
                  this month

                  <span v-if="currentRecipe.totalTime != null">
                    · {{ currentRecipe.totalTime }} minutes
                  </span>
                </p>
              </div>

              <!-- Carousel controls -->
              <div
                v-if="topRecipes.length > 1"
                class="d-flex justify-content-between align-items-center"
              >
                <button
                  type="button"
                  class="btn dashboard-button btn-sm"
                  aria-label="Previous recipe"
                  @click="previousRecipe"
                >
                  Previous
                </button>

                <span class="text-muted small">
                  {{ currentIndex + 1 }} / {{ topRecipes.length }}
                </span>

                <button
                  type="button"
                  class="btn dashboard-button btn-sm"
                  aria-label="Next recipe"
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

      <!-- RIGHT: meal progress and community activity -->
      <div class="col-12 col-lg-7">
        <section class="card shadow-sm">
          <div class="card-body">
            <h2 class="h5 fw-bold">Your Meal-Plan Progress</h2>

            <p class="text-muted">
              Track the meals you complete this month.
            </p>

            <div class="meal-progress-box rounded p-3 mt-3">
              <div class="d-flex justify-content-between mb-3">
                <span class="fw-semibold">Monthly completion</span>
                <span class="text-muted">— / — meals</span>
              </div>

              <div
                class="progress"
                aria-label="Meal-plan progress not available yet"
              >
                <div class="progress-bar bg-secondary w-0"></div>
              </div>

              <p class="text-muted small mt-3 mb-0">
                Meal-plan progress will appear here once connected.
              </p>
            </div>
          </div>
        </section>

        <div class="mt-4">
          <DashboardAnalytics section="activity" />
        </div>
      </div>

    </div>

    <!-- Bottom navigation cards -->
    <div class="row g-4 mt-4">

      <div class="col-12 col-md-4">
        <div class="card h-100">
          <div class="card-body d-flex flex-column">
            <h2 class="h5">My Pantry</h2>

            <p class="card-text">
              Check the ingredients you have.
            </p>

            <RouterLink
              to="/pantry"
              class="btn dashboard-button mt-auto align-self-start"
            >
              View Pantry
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-4">
        <div class="card h-100">
          <div class="card-body d-flex flex-column">
            <h2 class="h5">Recipes</h2>

            <p class="card-text">
              Find recipes based on your ingredients.
            </p>

            <RouterLink
              to="/recipes"
              class="btn dashboard-button mt-auto align-self-start"
            >
              Browse Recipes
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-4">
        <div class="card h-100">
          <div class="card-body d-flex flex-column">
            <h2 class="h5">Community</h2>

            <p class="card-text">
              Discover meals shared by the community.
            </p>

            <RouterLink
              to="/community"
              class="btn dashboard-button mt-auto align-self-start"
            >
              View Community
            </RouterLink>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dashboard-heading {
  color: #426873;
}

.recipe-image {
  display: block;
  width: 100%;
  height: 240px;
  object-fit: cover;
}

.recipe-title {
  font-size: 20px;
  font-weight: semi-bold;
  color: #4B8A6C;
}

.recipe-title:hover {
  color: #386850;
}

.rank-badge {
  background-color: #F6C7B3;
  color: #49372F;
}

.cuisine-badge {
  background-color: #DCECE9;
  color: #304D52;
}

.meal-progress-box {
  background-color: #F5F5F5;
}

.progress-bar {
  background-color: #82B2C0;
}

.dashboard-button {
  --bs-btn-color: #ffffff;
  --bs-btn-bg: #4B8A6C;
  --bs-btn-border-color: #4B8A6C;
  --bs-btn-hover-color: #ffffff;
  --bs-btn-hover-bg: #386850;
  --bs-btn-hover-border-color: #386850;
  --bs-btn-active-color: #ffffff;
  --bs-btn-active-bg: #386850;
  --bs-btn-active-border-color: #386850;
  --bs-btn-disabled-color: #ffffff;
  --bs-btn-disabled-bg: #4B8A6C;
  --bs-btn-disabled-border-color: #4B8A6C;
}
</style>