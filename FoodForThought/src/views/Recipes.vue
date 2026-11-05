<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { API_URL } from '@/services/api'
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
const lastQuery = ref('') // the search shown in "4 results for …"
const sortBy = ref('shortest')
const pantryIngredients = ref([])
const pantryMatchMode = ref(false)
const pantryLoading = ref(false)
const pantryError = ref('')

// Line above the grid, e.g. "3 recipes" or "4 results for "chicken""
const resultLabel = computed(() => {
  if (pantryMatchMode.value) {
    const count = pantryMatchedRecipes.value.length
    return `${count} ${count === 1 ? 'recipe' : 'recipes'} using pantry ingredients`
  }

  const count = recipes.value.length

  if (searchMode.value) {
    return `${count} ${count === 1 ? 'result' : 'results'} for "${lastQuery.value}"`
  }

  return `${count} ${count === 1 ? 'recipe' : 'recipes'}`
})

function clearSearch() {
  search.value = ''
  pantryMatchMode.value = false
  fetchRecipes()
}

async function fetchRecipes() {
  loading.value = true
  error.value = ''
  searchMode.value = false

  try {
    const config = auth.token
      ? {
          headers: {
            Authorization: `Bearer ${auth.token}`
          }
        }
      : {}

    const response = await axios.get(`${API_URL}/recipes`, config)
    recipes.value = response.data.data
  } catch (err) {
    console.error(err)
    error.value = 'Failed to load saved recipes.'
  } finally {
    loading.value = false
  }
}


async function searchRecipes() {
  const searchTerm = search.value.trim()
  pantryMatchMode.value = false

  if (!searchTerm) {
    await fetchRecipes()
    return
  }

  loading.value = true
  error.value = ''
  searchMode.value = true
  lastQuery.value = search.value.trim()

  try {
    const config = auth.token
      ? {
          headers: {
            Authorization: `Bearer ${auth.token}`
          }
        }
      : {}

    const [savedResponse, spoonacularResponse] = await Promise.all([
      // Search MongoDB recipes, including user-created recipes
      axios.get(`${API_URL}/recipes`, auth.token
        ? {
            headers: {
              Authorization: `Bearer ${auth.token}`
            }
          }
        : {}
      ),

      // Search Spoonacular recipes
      axios.get(`${API_URL}/recipes/search`, {
        params: {
          query: searchTerm
        }
      })
    ])

    const savedRecipes = savedResponse.data.data
    const externalRecipes = spoonacularResponse.data.data

    // Filter community recipes by title
    const matchingSavedRecipes = savedRecipes.filter(recipe =>
      recipe.title?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Prevent duplicate recipes from Spoonacular
    const savedTitles = new Set(
      matchingSavedRecipes.map(recipe =>
        recipe.title.trim().toLowerCase()
      )
    )

    const uniqueExternalRecipes = externalRecipes.filter(recipe =>
      !savedTitles.has(recipe.title.trim().toLowerCase())
    )

    // Display matching community recipes + external recipes
    recipes.value = [
      ...matchingSavedRecipes,
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

    const likeUrl = `${API_URL}/recipes/${getRecipeKey(recipe)}/like`

    if (isLiked(recipe)) {
      response = await axios.delete(likeUrl, config)
    } else {
      response = await axios.post(likeUrl, {}, config)
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
    console.error('Like error:', err.response?.data || err)

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

    const response = await axios.get(`${API_URL}/recipes/liked`, {
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

const sortedRecipes = computed(() => {
  const list = pantryMatchMode.value
    ? [...pantryMatchedRecipes.value]
    : [...recipes.value]

  if (sortBy.value === 'matches') {
    return list.sort((a, b) => b.matchCount - a.matchCount)
  }

  if (sortBy.value === 'shortest') {
    return list.sort(
      (a, b) => (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity)
    )
  }

  if (sortBy.value === 'longest') {
    return list.sort(
      (a, b) => (b.totalTime ?? 0) - (a.totalTime ?? 0)
    )
  }

  if (sortBy.value === 'serving-low') {
    return list.sort(
      (a, b) => (a.servings ?? Infinity) - (b.servings ?? Infinity)
    )
  }

  if (sortBy.value === 'serving-high') {
    return list.sort(
      (a, b) => (b.servings ?? 0) - (a.servings ?? 0)
    )
  }

  return list
})

async function togglePantryMatch() {
  if (!pantryMatchMode.value) {
    await loadPantryIngredients()

    if (pantryError.value) return

    pantryMatchMode.value = true
    sortBy.value = 'matches'
  } else {
    pantryMatchMode.value = false
    sortBy.value = 'shortest'
  }
}

async function loadPantryIngredients() {
  pantryLoading.value = true
  pantryError.value = ''

  try {
    const token = auth.token

    const { data } = await axios.get(`${API_URL}/pantry/`, {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    })

    pantryIngredients.value = (data.items || [])
      .filter(item => item.quantity > 0)
      .map(item => item.name.trim().toLowerCase())
  } catch (err) {
    pantryError.value = 'Could not load your pantry ingredients.'
    console.error(err)
  } finally {
    pantryLoading.value = false
  }
}

// Convert ingredient names into a consistent format
function normalizeIngredient(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

// Extract ingredient names from a recipe
function getRecipeIngredients(recipe) {
  return (recipe.ingredients || [])
    .map(ingredient => {
      if (typeof ingredient === 'string') return ingredient

      return ingredient.name ||
        ingredient.ingredient ||
        ingredient.original ||
        ingredient.description ||
        ''
    })
    .map(normalizeIngredient)
    .filter(Boolean)
}

// Calculate matching pantry ingredients
function getMatchingIngredients(recipe) {
  const pantrySet = new Set(
    pantryIngredients.value.map(normalizeIngredient)
  )

  return getRecipeIngredients(recipe).filter(ingredient =>
    pantrySet.has(ingredient)
  )
}

// Match only existing community recipes
const pantryMatchedRecipes = computed(() => {
  return recipes.value
    .filter(recipe => recipe.source !== 'spoonacular')
    .map(recipe => ({
      ...recipe,
      matchedIngredients: getMatchingIngredients(recipe),
      matchCount: getMatchingIngredients(recipe).length,
    }))
    .filter(recipe => recipe.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
})

onMounted(() => {
  fetchRecipes()
  loadMyLikes()
})
</script>

<template>
  <div class="fft-page">
    <main class="container recipes-page py-4 py-lg-5 text-start">
      <header class="rp-head">
        <div>
          <h1 class="rp-title">Recipes</h1>
          <p class="rp-lede">
            Search for something to cook, or browse what the community has shared.
          </p>
        </div>

        <RouterLink to="/recipes/create" class="rp-btn rp-btn-primary">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Create recipe
        </RouterLink>
      </header>

      <!-- Search -->
      <form class="rp-search" role="search" @submit.prevent="searchRecipes">
        <span class="material-symbols-outlined rp-search-icon" aria-hidden="true">search</span>
        <label for="recipe-search" class="visually-hidden">Search recipes</label>
        <input
          id="recipe-search"
          v-model="search"
          type="search"
          class="rp-search-input"
          placeholder="Try chicken, laksa or tofu"
          autocomplete="off"
        />
        <button
          v-if="search"
          type="button"
          class="rp-clear"
          aria-label="Clear search"
          @click="clearSearch"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
        <button type="submit" class="rp-btn rp-btn-primary" :disabled="loading">
          Search
        </button>
      </form>

      <div class="pantry-match-section">
      <button
        class="pantry-match-btn"
        @click="togglePantryMatch"
      >
        {{ pantryMatchMode ? 'Show All Recipes' : 'Find Recipes Using Pantry' }}
      </button>

      <p v-if="pantryError" class="error-message">
        {{ pantryError }}
      </p>
    </div>

      <p v-if="likeMessage" class="rp-notice" role="alert">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        {{ likeMessage }}
      </p>

      <!-- Loading: placeholder cards in the shape of the real ones -->
      <div v-if="loading" class="rp-grid" aria-busy="true" aria-label="Loading recipes">
        <div v-for="n in 6" :key="n" class="rp-card" aria-hidden="true">
          <div class="rp-media rp-skeleton"></div>
          <div class="rp-skeleton rp-skeleton-line"></div>
          <div class="rp-skeleton rp-skeleton-line is-short"></div>
        </div>
      </div>

      <div v-else-if="error" class="rp-empty" role="alert">
        <span class="material-symbols-outlined rp-empty-icon" aria-hidden="true">cloud_off</span>
        <h2 class="rp-empty-title">{{ error }}</h2>
        <p>Check your connection, then try again.</p>
        <button type="button" class="rp-btn rp-btn-outline" @click="searchMode ? searchRecipes() : fetchRecipes()">
          Try again
        </button>
      </div>

      <div v-else-if="recipes.length === 0" class="rp-empty">
        <span class="material-symbols-outlined rp-empty-icon" aria-hidden="true">search_off</span>
        <template v-if="searchMode">
          <h2 class="rp-empty-title">No recipes match "{{ lastQuery }}"</h2>
          <p>Try a single ingredient, like "egg" or "rice".</p>
          <button type="button" class="rp-btn rp-btn-outline" @click="clearSearch">Show all recipes</button>
        </template>
        <template v-else>
          <h2 class="rp-empty-title">No recipes yet</h2>
          <p>Share the first one with the community.</p>
          <RouterLink to="/recipes/create" class="rp-btn rp-btn-primary">Create recipe</RouterLink>
        </template>
      </div>

      <template v-else>
        <div class="rp-toolbar">
        <p class="rp-count" aria-live="polite">{{ resultLabel }}</p>
        <div class="sort-container">
        <p class="sort-label">Sort by</p>

        <select v-model="sortBy">
          <template v-if="pantryMatchMode">
            <option value="matches">Most ingredients matched</option>
            <option value="shortest">Shortest time</option>
            <option value="longest">Longest time</option>
            <option value="serving-low">Lowest servings</option>
            <option value="serving-high">Highest servings</option>
          </template>

          <template v-else>
            <option value="shortest">Shortest time</option>
            <option value="longest">Longest time</option>
            <option value="serving-low">Lowest servings</option>
            <option value="serving-high">Highest servings</option>
          </template>
        </select>
      </div>
      </div>

        <ul class="rp-grid">
          <li
            v-for="recipe in sortedRecipes"
            :key="recipe._id || recipe.externalId"
            class="rp-card"
          >
            <div class="rp-media">
              <img
                v-recipe-img="recipe.image"
                :alt="''"
                loading="lazy"
              />


              <span v-if="recipe.totalTime" class="rp-time">
                <span class="material-symbols-outlined" aria-hidden="true">schedule</span>
                {{ recipe.totalTime }} min
              </span>

              <!-- Like (community recipes only). Sits above the card link. -->
              <button
                v-if="recipe.source !== 'spoonacular'"
                type="button"
                class="rp-like"
                :class="{ 'is-liked': isLiked(recipe) }"
                :aria-pressed="isLiked(recipe)"
                :aria-label="`${isLiked(recipe) ? 'Unlike' : 'Like'} ${recipe.title}`"
                :disabled="loadingLikes || likingRecipeIds.includes(getRecipeKey(recipe))"
                @click="toggleLike(recipe)"
              >
                <span class="material-symbols-outlined" aria-hidden="true">favorite</span>
              </button>
            </div>

            <div class="rp-body">
              <p class="rp-source" :class="recipe.source === 'spoonacular' ? 'is-web' : 'is-community'">
                {{ recipe.source === 'spoonacular' ? 'From Spoonacular' : 'Community recipe' }}
              </p>

              <!-- The title link covers the whole card (see .rp-link::after) -->
              <h2 class="rp-name">
                <RouterLink
                  v-if="recipe.source !== 'spoonacular'"
                  :to="getRecipeLink(recipe)"
                  class="rp-link"
                >
                  {{ recipe.title }}
                </RouterLink>
                <a
                  v-else-if="recipe.sourceUrl"
                  :href="recipe.sourceUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="rp-link"
                >
                  {{ recipe.title }}
                  <span class="material-symbols-outlined rp-external" aria-hidden="true">open_in_new</span>
                  <span class="visually-hidden">(opens the original recipe in a new tab)</span>
                </a>
                <span v-else>{{ recipe.title }}</span>
              </h2>

              <p class="rp-sub">
                <span v-if="recipe.cuisine?.length">{{ recipe.cuisine.join(', ') }}</span>
                <span v-if="recipe.source !== 'spoonacular'">
                  by {{ recipe.createdBy?.name || 'a community member' }}
                </span>
              </p>

                <div v-if="pantryMatchMode" class="pantry-match-badge">
                <strong>
                  {{ recipe.matchCount }} pantry ingredients matched
                </strong>

                <small>
                  {{ recipe.matchedIngredients.join(', ') }}
                </small>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </main>
  </div>
</template>

<style scoped>
.recipes-page {
  color: var(--fft-text);
}

/* ---------- Header ---------- */
.rp-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.rp-title {
  margin: 0;
  font: 600 clamp(30px, 4vw, 40px) / 1.15 'Outfit', sans-serif;
  letter-spacing: -0.02em;
}

.rp-lede {
  max-width: 52ch;
  margin: 8px 0 0;
  color: var(--fft-secondary-text);
  font-size: 16px;
  line-height: 24px;
}

/* ---------- Buttons ---------- */
.rp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 11px 18px;
  font: 600 14px/20px 'Inter', sans-serif;
  text-decoration: none;
  transition:
    background-color var(--dur-fast, 150ms),
    border-color var(--dur-fast, 150ms),
    transform var(--dur-press, 160ms) var(--ease-out, ease);
}

.rp-btn .material-symbols-outlined {
  font-size: 20px;
}

.rp-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.rp-btn:focus-visible {
  outline: 2px solid var(--fft-primary);
  outline-offset: 2px;
}

.rp-btn-primary {
  background: var(--fft-primary);
  color: #fff;
}

.rp-btn-primary:hover:not(:disabled) {
  background: var(--fft-primary-hover);
  color: #fff;
}

.rp-btn-primary:disabled {
  opacity: 0.6;
}

.rp-btn-outline {
  border-color: var(--fft-border);
  background: var(--fft-card);
  color: var(--fft-primary);
}

.rp-btn-outline:hover {
  border-color: var(--fft-primary);
  color: var(--fft-primary);
}

/* ---------- Search ---------- */
.rp-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--fft-border);
  border-radius: 16px;
  background: var(--fft-card);
  box-shadow: 0 1px 2px rgb(26 28 24 / 4%);
  transition: border-color var(--dur-fast, 150ms), box-shadow var(--dur-fast, 150ms);
}

.rp-search:focus-within {
  border-color: var(--fft-primary);
  box-shadow: 0 0 0 4px rgb(50 83 60 / 12%);
}

.rp-search-icon {
  color: var(--fft-muted);
  font-size: 22px;
}

.rp-search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 8px 0;
  background: transparent;
  color: var(--fft-text);
  font: 400 16px/24px 'Inter', sans-serif;
  outline: none;
}

.rp-search-input::placeholder {
  color: var(--fft-muted);
}

/* Hide the browser's own clear "x" (we have our own) */
.rp-search-input::-webkit-search-cancel-button {
  appearance: none;
}

.rp-clear {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: var(--fft-surface-low);
  color: var(--fft-secondary-text);
}

.rp-clear:hover {
  background: var(--fft-surface-high);
}

.rp-clear .material-symbols-outlined {
  font-size: 18px;
}

.rp-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 0;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--fft-peach);
  color: var(--fft-peach-text);
  font-size: 14px;
}

.rp-count {
  margin: 28px 0 16px;
  color: var(--fft-muted);
  font-size: 14px;
  line-height: 20px;
}

/* ---------- Grid of recipes ---------- */
.rp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 32px 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* div.rp-grid is the loading state */
div.rp-grid {
  margin-top: 64px;
}

/* Photo-led cards: no box around them, the photo carries the card */
.rp-card {
  position: relative;
  display: flex;
  flex-direction: column;
}

.rp-media {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 16px;
  background: var(--fft-surface-high);
}

.rp-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s var(--ease-out, ease);
}

.rp-card:hover .rp-media img {
  transform: scale(1.04);
}

.rp-time {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px 4px 8px;
  border-radius: 9999px;
  background: rgb(255 255 255 / 92%);
  color: var(--fft-text);
  font: 600 12px/18px 'Inter', sans-serif;
}

.rp-time .material-symbols-outlined {
  font-size: 16px;
}

.rp-like {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2; /* above the stretched title link */
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 92%);
  color: var(--fft-secondary-text);
  box-shadow: 0 2px 8px rgb(26 28 24 / 14%);
  transition:
    color var(--dur-fast, 150ms),
    transform var(--dur-press, 160ms) var(--ease-out, ease);
}

.rp-like .material-symbols-outlined {
  font-size: 22px;
  transition: font-variation-settings 0.2s;
}

.rp-like:hover:not(:disabled) {
  color: #c2414b;
}

.rp-like:active:not(:disabled) {
  transform: scale(0.9);
}

.rp-like:disabled {
  cursor: wait;
}

.rp-like.is-liked {
  color: #c2414b;
}

.rp-like.is-liked .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

.rp-like:focus-visible {
  outline: 2px solid var(--fft-primary);
  outline-offset: 2px;
}

.rp-body {
  padding: 14px 2px 0;
}

.rp-source {
  display: inline-block;
  margin: 0 0 6px;
  padding: 1px 8px;
  border-radius: 6px;
  font: 600 11px/18px 'Inter', sans-serif;
}

.rp-source.is-community {
  background: var(--fft-primary-light);
  color: var(--fft-primary-dark);
}

.rp-source.is-web {
  background: var(--fft-peach);
  color: var(--fft-peach-text);
}

.rp-name {
  margin: 0;
  font: 600 19px/25px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
  color: var(--fft-text);
}

.rp-link {
  color: inherit;
  text-decoration: none;
}

/* Makes the whole card clickable while keeping one real link for screen readers */
.rp-link::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
}

.rp-card:hover .rp-link {
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 4px;
}

.rp-link:focus-visible {
  outline: none;
}

.rp-link:focus-visible::after {
  outline: 2px solid var(--fft-primary);
  outline-offset: 4px;
  border-radius: 18px;
}

.rp-external {
  font-size: 16px;
  vertical-align: -2px;
  color: var(--fft-muted);
}

.rp-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
  margin: 4px 0 0;
  color: var(--fft-muted);
  font-size: 14px;
  line-height: 20px;
}

/* ---------- Empty / error ---------- */
.rp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 40px;
  padding: 48px 24px;
  border: 1px dashed var(--fft-border);
  border-radius: 20px;
  text-align: center;
  color: var(--fft-secondary-text);
}

.rp-empty-icon {
  margin-bottom: 8px;
  font-size: 40px;
  color: var(--fft-muted);
}

.rp-empty-title {
  margin: 0 0 4px;
  font: 600 20px/28px 'Outfit', sans-serif;
  color: var(--fft-text);
}

/* ---------- Loading placeholders ---------- */
.rp-skeleton {
  background: linear-gradient(90deg, var(--fft-surface-low) 25%, var(--fft-surface-high) 50%, var(--fft-surface-low) 75%);
  background-size: 200% 100%;
  animation: rp-shimmer 1.2s linear infinite;
}

.rp-skeleton-line {
  height: 18px;
  margin-top: 14px;
  border-radius: 6px;
}

.rp-skeleton-line.is-short {
  width: 55%;
  margin-top: 8px;
}

@keyframes rp-shimmer {
  to { background-position: -200% 0; }
}

/* ---------- Phones ---------- */
@media (max-width: 575.98px) {
  .rp-head {
    flex-direction: column;
    align-items: stretch;
  }

  .rp-head .rp-btn {
    align-self: flex-start;
  }

  .rp-grid {
    gap: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rp-media img,
  .rp-like .material-symbols-outlined,
  .rp-skeleton {
    transition: none;
    animation: none;
  }

  .rp-card:hover .rp-media img {
    transform: none;
  }
}

.rp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rp-toolbar .rp-count {
  margin: 0;
}

.rp-sort {
  padding-top: 10px;
  padding-bottom: 10px;
  margin-top: 10px;
  margin-bottom: 10px;
  border: 1px solid var(--fft-border);
  border-radius: 12px;
  background: var(--fft-card);
  color: var(--fft-text);
  font-size: 14px;
  justify-content: space-around;
}

.sort-container {  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  margin-bottom: 10px;
}

.sort-label {
  margin: 0;
  font-size: 14px;
}

@media (max-width: 575.98px) {
  .rp-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}

.pantry-match-section {
  margin: 16px 0;
}

.pantry-match-btn {
  padding: 10px 16px;
  border: 1px solid #32533c;
  border-radius: 8px;
  background: #32533c;
  color: white;
  cursor: pointer;
}

.pantry-match-btn:hover {
  background: #26432f;
}

.pantry-match-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}


.pantry-match-badge {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #e5f0e6;
  color: #32533c;
  font-size: 12px;
}

.pantry-match-badge strong {
  font-weight: 600;
}

.pantry-match-badge small {
  font-size: 12px;
  line-height: 1.5;
  font-weight: 400;
}

</style>
