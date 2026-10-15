<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const topRecipes = ref([])
const currentIndex = ref(0)
const loadingRecipes = ref(true)
const recipesError = ref('')

const currentRecipe = computed(() => {
  return topRecipes.value[currentIndex.value]
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
  <div class="container mt-5">
    <h1 class="text-success">
      Welcome to FoodForThought
    </h1>

    <p class="text-muted">
      Cook smarter. Waste less. Live healthier.
    </p>
        <!-- New analytics section -->
    <div class="row g-4 mt-2">

      <!-- Left: top recipes -->
      <div class="col-12 col-lg-5">
        <div class="card h-100 shadow-sm">
          <div class="card-body">
            <h2 class="h5 fw-bold">Most liked recipes this month</h2>

            <p class="text-muted small">
              The community's most-liked recipes.
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
                class="btn btn-outline-success"
                @click="loadTopRecipes"
              >
                Try again
              </button>
            </div>

            <p v-else-if="topRecipes.length === 0">
              No liked recipes this month yet.
            </p>

            <div v-else aria-roledescription="carousel">
              <div aria-live="polite" aria-atomic="true">
                <RouterLink
                  :to="{
                    path: '/community',
                    query: { postId: currentRecipe.postId }
                  }"
                >
                  <img
                    v-if="currentRecipe.image"
                    :src="currentRecipe.image"
                    :alt="currentRecipe.title"
                    class="recipe-image rounded mb-3"
                  >
                </RouterLink>

                <span class="badge bg-success mb-2">
                  Rank #{{ currentIndex + 1 }}
                </span>

                <h3 class="h5">
                  <RouterLink
                    :to="{
                      path: '/community',
                      query: { postId: currentRecipe.postId }
                    }"
                    class="text-success text-decoration-none"
                  >
                    {{ currentRecipe.title }}
                  </RouterLink>
                </h3>

                <div class="mb-2">
                  <span
                    v-for="cuisine in currentRecipe.cuisine"
                    :key="cuisine"
                    class="badge bg-success me-2 mb-1"
                  >
                    {{ cuisine }}
                  </span>
                </div>

                <p class="text-muted small">
                  {{ currentRecipe.likeCount }}
                  {{ currentRecipe.likeCount > 1 ? 'likes' : 'like' }} this month

                  <span v-if="currentRecipe.totalTime != null">
                    · {{ currentRecipe.totalTime }} minutes
                  </span>
                </p>
              </div>

              <div
                v-if="topRecipes.length > 1"
                class="d-flex justify-content-between align-items-center"
              >
                <button
                  type="button"
                  class="btn btn-outline-success btn-sm"
                  @click="previousRecipe"
                >
                  Previous
                </button>

                <span class="text-muted small">
                  {{ currentIndex + 1 }} / {{ topRecipes.length }}
                </span>

                <button
                  type="button"
                  class="btn btn-outline-success btn-sm"
                  @click="nextRecipe"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: meal-plan progress placeholder -->
      <div class="col-12 col-lg-7">
        <div class="card h-100 shadow-sm">
          <div class="card-body">
            <h2 class="h5 fw-bold">Your meal-plan progress</h2>

            <p class="text-muted">
              Track the meals you complete this month.
            </p>

            <div class="bg-light rounded p-4 mt-4">
              <div class="d-flex justify-content-between mb-3">
                <span class="fw-semibold">Monthly completion</span>
                <span class="text-muted">— / — meals</span>
              </div>

              <div
                class="progress"
                aria-label="Meal-plan progress not available yet"
              >
                <div class="progress-bar bg-success w-0"></div>
              </div>

              <p class="text-muted small mt-3 mb-0">
                Meal-plan progress will appear here once connected.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>

    <div class="row g-4 mt-4">

      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">My Pantry</h5>
            <p class="card-text">
              Check the ingredients you have.
            </p>

            <RouterLink to="/pantry" class="btn btn-success">
              View Pantry
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">Recipes</h5>
            <p class="card-text">
              Find recipes based on your ingredients.
            </p>

            <RouterLink to="/recipes" class="btn btn-success">
              Browse Recipes
            </RouterLink>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">Community</h5>

            <p class="card-text">
              Discover meals shared by the community.
            </p>

            <RouterLink to="/community" class="btn btn-success">
              View Community
            </RouterLink>
          </div>
        </div>
      </div>

    </div>

  </div>
</template>
<style scoped>
.recipe-image {
  width: 100%;
  height: 240px;
  object-fit: cover;
}
</style>