<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const recipes = ref([])
const search = ref('')
const loading = ref(false)
const error = ref('')
const searchMode = ref(false)
const auth = useAuthStore()
const likedRecipeIds = ref([])
const likeMessage = ref('')
const likingRecipeIds = ref([])
const loadingLikes = ref(true)

async function fetchRecipes() {
  loading.value = true
  error.value = ''
  searchMode.value = false

  try {
    const response = await axios.get('/api/recipes')
    recipes.value = response.data.data
  } catch (err) {
    console.error(err)
    error.value = 'Failed to load saved recipes.'
  } finally {
    loading.value = false
  }
}

async function searchRecipes() {
  if (!search.value.trim()) {
    await fetchRecipes()
    return
  }

  loading.value = true
  error.value = ''
  searchMode.value = true

  try {
    const [savedResponse, spoonacularResponse] = await Promise.all([
      axios.get('/api/recipes'),
      axios.get('/api/recipes/search', {
        params: { query: search.value.trim() }
      })
    ])

    const savedRecipes = savedResponse.data.data
    const externalRecipes = spoonacularResponse.data.data

    // Combine saved and external recipes, avoiding duplicate titles.
    const savedTitles = new Set(
      savedRecipes.map(recipe => recipe.title.toLowerCase())
    )

    const uniqueExternalRecipes = externalRecipes.filter(
      recipe => !savedTitles.has(recipe.title.toLowerCase())
    )

    recipes.value = [
      ...savedRecipes,
      ...uniqueExternalRecipes
    ]
  } catch (err) {
    console.error(err)
    error.value = 'Failed to search recipes. Please try again.'
  } finally {
    loading.value = false
  }
}

function getRecipeKey(recipe) {
  if (recipe.externalId != null) {
    return 'spoonacular-' + recipe.externalId
  }

  return 'recipe-' + recipe._id
}

function isLiked(recipe) {
  return likedRecipeIds.value.includes(getRecipeKey(recipe))
}

async function toggleLike(recipe) {
  likeMessage.value = ''

  if (!auth.token) {
    likeMessage.value = 'Please log in to like recipes.'
    return
  }

  const recipeKey = getRecipeKey(recipe)

  if (
    loadingLikes.value ||
    likingRecipeIds.value.includes(recipeKey)
  ) {
    return
  }

  likingRecipeIds.value.push(recipeKey)

  const config = {
    headers: {
      Authorization: `Bearer ${auth.token}`
    }
  }

  try {
    let response

    if (isLiked(recipe)) {
      response = await axios.delete(
        `/api/recipes/${recipeKey}/like`,
        config
      )
    } else {
      response = await axios.post(
        `/api/recipes/${recipeKey}/like`,
        {},
        config
      )
    }

    const index = likedRecipeIds.value.indexOf(recipeKey)

    if (response.data.liked) {
      if (index === -1) {
        likedRecipeIds.value.push(recipeKey)
      }
    } else if (index !== -1) {
      likedRecipeIds.value.splice(index, 1)
    }
  } catch (err) {
    likeMessage.value =
      err.response?.data?.message ||
      'Unable to update your like.'
  } finally {
    likingRecipeIds.value = likingRecipeIds.value.filter(
      key => key !== recipeKey
    )
  }
}

async function loadMyLikes() {
  loadingLikes.value = true
  likedRecipeIds.value = []
  likeMessage.value = ''

  try {
    if (!auth.token) return

    const response = await axios.get('/api/recipes/liked', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    likedRecipeIds.value = response.data
  } catch (err) {
    likeMessage.value =
      err.response?.data?.message ||
      'Unable to load your likes.'
  } finally {
    loadingLikes.value = false
  }
}

function getRecipeLink(recipe) {
  if (recipe._id) {
    return '/recipes/' + recipe._id
  }

  return '/recipes/external/' + recipe.externalId
}

onMounted(() => {
  fetchRecipes()
  loadMyLikes()
})
</script>

<template>
  <div class="container mt-5 mb-5">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h1>Recipes</h1>
        <p class="text-muted">
          Discover recipes or browse your saved recipes.
        </p>
      </div>

      <router-link
        to="/recipes/create"
        class="btn btn-success"
      >
        + Create Recipe
      </router-link>
    </div>

    <form class="d-flex gap-2 mb-4" @submit.prevent="searchRecipes">
      <input
        v-model="search"
        class="form-control"
        placeholder="Search recipes, e.g. chicken..."
      />

      <button
        type="submit"
        class="btn btn-primary"
        :disabled="loading"
      >
        Search
      </button>

      <button
        type="button"
        class="btn btn-outline-secondary"
        @click="search = ''; fetchRecipes()"
      >
        Clear
      </button>
    </form>

    <div v-if="likeMessage" class="alert alert-info" role="alert">
      {{ likeMessage }}
    </div>

    <div v-if="loading" class="text-center my-4">
      Loading recipes...
    </div>

    <div v-else-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <div v-else-if="recipes.length === 0" class="alert alert-info">
      No recipes found.
    </div>

    <div v-else class="row">
      <div
        v-for="recipe in recipes"
        :key="recipe._id || recipe.externalId"
        class="col-md-4 mb-4"
      >
        <div class="card h-100">
          <img
            :src="recipe.image"
            :alt="recipe.title"
            class="card-img-top"
            style="height: 200px; object-fit: cover"
          />

          <div class="card-body d-flex flex-column">
            <h5 class="card-title">{{ recipe.title }}</h5>

            <p class="text-muted">
              {{ recipe.totalTime || 'N/A' }} minutes
            </p>

            <p>
              <span
                class="badge"
                :class="recipe.source === 'spoonacular'
                  ? 'text-bg-primary'
                  : 'text-bg-success'"
              >
                {{ recipe.source === 'spoonacular'
                  ? 'Spoonacular'
                  : 'Community recipe' }}
              </span>
            </p>

            <p v-if="recipe.cuisine?.length">
              Cuisine: {{ recipe.cuisine.join(', ') }}
            </p>

            <a
              v-if="recipe.source === 'spoonacular' && recipe.sourceUrl"
              :href="recipe.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-outline-primary mt-auto"
            >
              View Original Recipe
            </a>

            <div
              v-if="recipe.source !== 'spoonacular'"
              class="d-flex gap-2 mt-3"
            >
              <RouterLink
                :to="getRecipeLink(recipe)"
                class="btn btn-outline-success"
              >
                View Recipe
              </RouterLink>

              <button
                type="button"
                class="btn"
                :class="isLiked(recipe)
                  ? 'btn-success'
                  : 'btn-outline-success'"
                :disabled="
                  loadingLikes ||
                  likingRecipeIds.includes(getRecipeKey(recipe))
                "
                @click="toggleLike(recipe)"
              >
                {{ isLiked(recipe) ? 'Unlike' : 'Like' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>