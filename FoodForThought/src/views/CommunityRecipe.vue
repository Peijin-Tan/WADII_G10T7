<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()

const post = ref(null)
const loading = ref(true)
const error = ref('')
const unavailable = ref(false)

async function loadPost() {
  loading.value = true
  error.value = ''
  unavailable.value = false
  post.value = null

  try {
    const response = await axios.get(
      `/posts/${route.params.id}`
    )

    post.value = response.data
  } catch (err) {
    if (err.response?.status === 404) {
      unavailable.value = true
      error.value = 'This post is no longer available.'
    } else if (err.response?.status === 400) {
      unavailable.value = true
      error.value = 'This post link is invalid.'
    } else {
      error.value = 'Unable to load this recipe. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadPost)
</script>

<template>
  <main class="container py-4 mb-5 text-start">
    <RouterLink
      to="/community"
      class="back-link d-inline-block mb-4"
    >
      ← Back to Community
    </RouterLink>

    <!-- Loading -->
    <p v-if="loading" class="text-muted" role="status">
      Loading recipe...
    </p>

    <!-- Error or deleted post -->
    <div v-else-if="error" class="alert alert-warning" role="alert">
      <p class="mb-2">{{ error }}</p>

      <button
        v-if="!unavailable"
        type="button"
        class="btn recipe-button"
        @click="loadPost"
      >
        Try again
      </button>
    </div>

    <!-- Post has no linked recipe -->
    <div
      v-else-if="!post?.recipeId"
      class="alert alert-info"
    >
      Recipe details are no longer available for this post.
    </div>

    <!-- Recipe details -->
    <div v-else class="row g-4 g-lg-5">

      <!-- Left: title, picture and overview -->
      <div class="col-12 col-lg-5">
        <h1 class="recipe-heading">
          {{ post.recipeId.title }}
        </h1>

        <p class="text-muted small">
          Shared by {{ post.userId?.name || 'Former user' }}
          · {{ new Date(post.createdAt).toLocaleDateString() }}
        </p>

        <div class="mb-3">
          <span
            v-for="cuisine in post.recipeId.cuisine"
            :key="cuisine"
            class="badge cuisine-badge me-2 mb-1"
          >
            {{ cuisine }}
          </span>
        </div>

        <img
          v-if="post.recipeId.image"
          :src="post.recipeId.image"
          :alt="post.recipeId.title"
          class="recipe-image rounded-4 mb-4"
        >

        <div class="recipe-overview rounded-4 p-3 mb-4">
          <div class="row g-3">
            <div class="col-6">
              <p class="text-muted small mb-1">Servings</p>
              <p class="fw-semibold mb-0">
                {{ post.recipeId.servings }}
              </p>
            </div>

            <div class="col-6">
              <p class="text-muted small mb-1">Total time</p>
              <p class="fw-semibold mb-0">
                {{ post.recipeId.totalTime }} minutes
              </p>
            </div>

            <div class="col-6">
              <p class="text-muted small mb-1">Preparation</p>
              <p class="fw-semibold mb-0">
                {{ post.recipeId.prepTime }} minutes
              </p>
            </div>

            <div class="col-6">
              <p class="text-muted small mb-1">Cooking</p>
              <p class="fw-semibold mb-0">
                {{ post.recipeId.cookingTime }} minutes
              </p>
            </div>
          </div>
        </div>

        <h2 class="h5">About This Recipe</h2>

        <p class="preserve-lines">
          {{ post.recipeId.summary }}
        </p>

        <div v-if="post.content" class="mt-4">
          <h2 class="h5">From The Cook</h2>
          <p class="preserve-lines">{{ post.content }}</p>
        </div>

        <div class="mt-3">
          <span
            v-for="tag in post.tags"
            :key="tag"
            class="badge rounded-pill tag-badge me-2 mb-1"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- Right: ingredients and cooking steps -->
      <div class="col-12 col-lg-7">
        <section class="card border-0 shadow-sm rounded-4 mb-4">
          <div class="card-body p-4">
            <h2 class="h4 section-heading mb-3">
              Ingredients
            </h2>

            <ul
              v-if="post.recipeId.ingredients?.length"
              class="list-group list-group-flush"
            >
              <li
                v-for="(ingredient, index) in post.recipeId.ingredients"
                :key="index"
                class="list-group-item px-0 py-3"
              >
                <span class="fw-semibold">
                  {{ ingredient.amount }} {{ ingredient.unit }}
                </span>
                {{ ingredient.name }}
              </li>
            </ul>

            <p v-else class="text-muted mb-0">
              No ingredients provided.
            </p>
          </div>
        </section>

        <section class="card border-0 shadow-sm rounded-4">
          <div class="card-body p-4">
            <h2 class="h4 section-heading mb-4">
              Cooking Steps
            </h2>

            <ol
              v-if="post.recipeId.instructions?.length"
              class="list-unstyled mb-0"
            >
              <li
                v-for="(instruction, index) in post.recipeId.instructions"
                :key="index"
                class="d-flex gap-3 mb-4"
              >
                <span class="step-number">
                  {{ index + 1 }}
                </span>

                <div>
                  <h3 class="h6 mb-2">
                    Step {{ index + 1 }}
                  </h3>

                  <p class="preserve-lines mb-0">
                    {{ instruction.description }}
                  </p>
                </div>
              </li>
            </ol>

            <p v-else class="text-muted mb-0">
              No cooking steps provided.
            </p>
          </div>
        </section>
      </div>

    </div>
  </main>
</template>

<style scoped>
.recipe-heading {
  color: #4B8A6C;
  font-size: 20px;
  font-weight: bold;
}

.section-heading {
  color: #426873;
}

.back-link {
  color: #4B8A6C;
  text-decoration: none;
}

.back-link:hover {
  color: #386850;
  text-decoration: underline;
}

.recipe-image {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
}

.recipe-overview {
  background-color: #F2EAE0;
}

.cuisine-badge {
  background-color: #DCECE9;
  color: #304D52;
}

.tag-badge {
  background-color: #F0E2C3;
  color: #49372F;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: #F6C7B3;
  color: #49372F;
  font-weight: 700;
}

.preserve-lines {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.recipe-button {
  --bs-btn-color: #ffffff;
  --bs-btn-bg: #4B8A6C;
  --bs-btn-border-color: #4B8A6C;
  --bs-btn-hover-color: #ffffff;
  --bs-btn-hover-bg: #386850;
  --bs-btn-hover-border-color: #386850;
}
</style>