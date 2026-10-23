
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import RecipeComments from '@/components/RecipeComments.vue'

const route = useRoute()
const router = useRouter()

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

function goBack() {
  router.push('/recipes')
}

onMounted(fetchRecipe)
</script>

<template>
  <div class="container py-5">
    <button
      class="btn btn-outline-secondary mb-4"
      @click="goBack"
    >
      &larr; Back to Recipes
    </button>

    <div v-if="loading" class="text-center py-5">
      <div
        class="spinner-border text-success"
        role="status"
      ></div>
      <p class="mt-3">Loading recipe...</p>
    </div>

    <div v-else-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <div v-else-if="recipe">
      <!-- Recipe heading -->
      <div class="row g-4 mb-5">
        <div class="col-md-6">
          <img
            :src="recipe.image"
            :alt="recipe.title"
            class="img-fluid rounded shadow-sm recipe-image"
          />
        </div>

        <div class="col-md-6">
          <span
            class="badge mb-3"
            :class="recipe.source === 'spoonacular'
              ? 'text-bg-primary'
              : 'text-bg-success'"
          >
            {{ recipe.source === 'spoonacular'
              ? 'Spoonacular'
              : 'Community Recipe' }}
          </span>

          <h1 class="mb-3">{{ recipe.title }}</h1>

          <p class="text-muted">
            {{ recipe.summary || 'No description available.' }}
          </p>

          <hr />

          <div class="row g-3">
            <div class="col-6">
              <strong>Prep Time</strong>
              <p>{{ recipe.prepTime ?? 'N/A' }} minutes</p>
            </div>

            <div class="col-6">
              <strong>Cooking Time</strong>
              <p>{{ recipe.cookingTime ?? 'N/A' }} minutes</p>
            </div>

            <div class="col-6">
              <strong>Total Time</strong>
              <p>{{ recipe.totalTime ?? 'N/A' }} minutes</p>
            </div>

            <div class="col-6">
              <strong>Servings</strong>
              <p>{{ recipe.servings ?? 'N/A' }}</p>
            </div>
          </div>

          <div v-if="recipe.cuisine?.length" class="mb-3">
            <strong>Cuisine:</strong>
            {{ recipe.cuisine.join(', ') }}
          </div>

          <div
            v-if="recipe.dietaryCategories?.length"
            class="mb-3"
          >
            <strong>Dietary Categories:</strong>
            <span
              v-for="diet in recipe.dietaryCategories"
              :key="diet"
              class="badge text-bg-light border ms-1"
            >
              {{ diet }}
            </span>
          </div>
        </div>
      </div>

      <!-- Ingredients -->
      <section class="mb-5">
        <h2 class="mb-3">Ingredients</h2>

        <div class="card">
          <ul class="list-group list-group-flush">
            <li
              v-for="(ingredient, index) in recipe.ingredients"
              :key="index"
              class="list-group-item"
            >
              <span class="fw-medium">
                {{ ingredient.name }}
              </span>

              <span class="text-muted ms-2">
                {{ ingredient.amount }} {{ ingredient.unit }}
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Instructions -->
      <section class="mb-5">
        <h2 class="mb-3">Cooking Instructions</h2>

        <div
          v-if="recipe.instructions?.length"
          class="d-flex flex-column gap-3"
        >
          <div
            v-for="(instruction, index) in recipe.instructions"
            :key="index"
            class="card"
          >
            <div class="card-body d-flex gap-3">
              <span class="badge text-bg-success step-number">
                {{ instruction.step ?? index + 1 }}
              </span>

              <p class="mb-0">
                {{ instruction.description }}
              </p>
            </div>
          </div>
        </div>

        <p v-else class="text-muted">
          No cooking instructions available.
        </p>
      </section>

      <!-- Nutrition -->
      <section v-if="recipe.nutrition?.length" class="mb-5">
        <h2 class="mb-3">Nutrition Information</h2>

        <div class="card">
          <ul class="list-group list-group-flush">
            <li
              v-for="(item, index) in recipe.nutrition"
              :key="index"
              class="list-group-item d-flex justify-content-between"
            >
              <span>{{ item.name }}</span>
              <span>
                {{ item.amount ?? 'N/A' }}
                {{ item.unit || '' }}
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Allergens -->
      <section v-if="recipe.allergens?.length" class="mb-4">
        <h2 class="mb-3">Allergens</h2>

        <span
          v-for="allergen in recipe.allergens"
          :key="allergen"
          class="badge text-bg-warning me-2"
        >
          {{ allergen }}
        </span>
      </section>

      <div v-if="recipe.sourceUrl" class="mt-4">
        <a
          :href="recipe.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-outline-primary"
        >
          View Original Recipe
        </a>
      </div>
      <RecipeComments
        :key="recipe._id"
        :recipe-id="recipe._id"
      />
    </div>
  </div>
</template>

<style scoped>
.recipe-image {
  width: 100%;
  max-height: 450px;
  object-fit: cover;
}

.step-number {
  min-width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
