<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

// Community feed
const posts = ref([])
const loading = ref(true)
const error = ref('')

// Post details
const content = ref('')
const tagsText = ref('')

// Recipe details
const title = ref('')
const summary = ref('')
const image = ref('')
const servings = ref(1)
const prepTime = ref(0)
const cookingTime = ref(0)

const ingredients = ref([
  { name: '', amount: 1, unit: '' }
])

const instructions = ref([
  { description: '' }
])

// Form status
const submitting = ref(false)
const postError = ref('')
const success = ref('')

//Like details
const likedPostIds = ref([])
const likingPostIds = ref([])
const likeError = ref('')

function addIngredient() {
  ingredients.value.push({
    name: '',
    amount: 1,
    unit: ''
  })
}

function removeIngredient(index) {
  if (ingredients.value.length > 1) {
    ingredients.value.splice(index, 1)
  }
}

function addStep() {
  instructions.value.push({
    description: ''
  })
}

function removeStep(index) {
  if (instructions.value.length > 1) {
    instructions.value.splice(index, 1)
  }
}

function resetForm() {
  content.value = ''
  tagsText.value = ''
  title.value = ''
  summary.value = ''
  image.value = ''
  servings.value = 1
  prepTime.value = 0
  cookingTime.value = 0

  ingredients.value = [
    { name: '', amount: 1, unit: '' }
  ]

  instructions.value = [
    { description: '' }
  ]
}

async function loadPosts() {
  loading.value = true
  error.value = ''

  try {
    const response = await axios.get('/posts')
    posts.value = response.data
  } catch (err) {
    error.value = 'Unable to load posts. Please try again.'
  } finally {
    loading.value = false
  }
}

async function createPost() {
  if (submitting.value) return

  postError.value = ''
  success.value = ''

  if (!auth.token) {
    postError.value = 'Please log in before posting.'
    return
  }

  if (content.value.trim() === '') {
    postError.value = 'Please enter your post content.'
    return
  }

  if (
    title.value.trim() === '' ||
    summary.value.trim() === '' ||
    image.value.trim() === ''
  ) {
    postError.value = 'Enter a recipe title, description, and picture URL or path.'
    return
  }

  if (!Number.isInteger(servings.value) || servings.value < 1) {
    postError.value = 'Servings must be a positive whole number.'
    return
  }

  if (
    !Number.isFinite(prepTime.value) ||
    prepTime.value < 0 ||
    !Number.isFinite(cookingTime.value) ||
    cookingTime.value < 0
  ) {
    postError.value = 'Enter valid preparation and cooking times.'
    return
  }

  for (const ingredient of ingredients.value) {
    if (
      ingredient.name.trim() === '' ||
      !Number.isFinite(ingredient.amount) ||
      ingredient.amount <= 0 ||
      ingredient.unit.trim() === ''
    ) {
      postError.value = 'Each ingredient needs a name, positive amount, and unit.'
      return
    }
  }

  for (const instruction of instructions.value) {
    if (instruction.description.trim() === '') {
      postError.value = 'Please complete every instruction step.'
      return
    }
  }

  // Convert comma-separated tags into an array
  const tags = []

  for (const value of tagsText.value.split(',')) {
    const tag = value.trim().toLowerCase()

    if (tag !== '' && !tags.includes(tag)) {
      tags.push(tag)
    }
  }

  const data = {
    content: content.value.trim(),
    tags: tags,
    recipe: {
      title: title.value.trim(),
      summary: summary.value.trim(),
      image: image.value.trim(),
      servings: servings.value,
      prepTime: prepTime.value,
      cookingTime: cookingTime.value,
      ingredients: ingredients.value,
      instructions: instructions.value
    }
  }

  submitting.value = true

  try {
    await axios.post('/posts', data, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    resetForm()
    success.value = 'Your recipe post was created!'
    await loadPosts()
  } catch (err) {
    if (err.response?.status === 401) {
      auth.logout()
      postError.value = 'Your login has expired. Please log in again.'
    } else {
      postError.value =
        err.response?.data?.message || 'Unable to create your recipe post.'
    }
  } finally {
    submitting.value = false
  }
}

async function loadMyLikes() {
  likedPostIds.value = []

  if (!auth.token) return

  try {
    const response = await axios.get('/posts/liked', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    likedPostIds.value = response.data
  } catch (err) {
    if (err.response?.status === 401) {
      auth.logout()
    } else {
      likeError.value = 'Unable to load your likes.'
    }
  }
}

async function toggleLike(post) {
  likeError.value = ''

  if (!auth.token) {
    likeError.value = 'Please log in to like posts.'
    return
  }

  if (likingPostIds.value.includes(post._id)) return

  likingPostIds.value.push(post._id)

  const config = {
    headers: {
      Authorization: `Bearer ${auth.token}`
    }
  }

  try {
    let response

    if (likedPostIds.value.includes(post._id)) {
      response = await axios.delete(
        `/posts/${post._id}/like`,
        config
      )
    } else {
      response = await axios.post(
        `/posts/${post._id}/like`,
        {},
        config
      )
    }

    post.likeCount = response.data.likeCount

    const index = likedPostIds.value.indexOf(post._id)

    if (response.data.liked) {
      if (index === -1) {
        likedPostIds.value.push(post._id)
      }
    } else if (index !== -1) {
      likedPostIds.value.splice(index, 1)
    }
  } catch (err) {
    if (err.response?.status === 401) {
      auth.logout()
      likedPostIds.value = []
      likeError.value = 'Please log in again to like posts.'
    } else {
      likeError.value =
        err.response?.data?.message || 'Unable to update your like.'
    }
  } finally {
    const index = likingPostIds.value.indexOf(post._id)

    if (index !== -1) {
      likingPostIds.value.splice(index, 1)
    }
  }
}
onMounted(async () => {
  await loadPosts()
  await loadMyLikes()
})
</script>

<template>
  <div class="container my-4">
    <h1>Community</h1>
    <p class="text-muted">
      Share your homemade recipes and discover what others are cooking.
    </p>

    <p v-if="postError" class="text-danger" role="alert">
      {{ postError }}
    </p>

    <p v-if="success" class="text-success" role="status">
      {{ success }}
    </p>

    <!-- Create a recipe post -->
    <div v-if="auth.user" class="card mb-4">
      <div class="card-body">
        <h5 class="card-title">Share a homemade recipe</h5>
        <p class="text-muted">Posting as {{ auth.user.name }}</p>

        <form @submit.prevent="createPost">
          <fieldset :disabled="submitting">
            <div class="mb-3">
              <label for="postContent" class="form-label">
                Your message
              </label>
              <textarea
                id="postContent"
                v-model="content"
                class="form-control"
                rows="3"
                maxlength="2000"
                placeholder="Tell us about your recipe!"
                required
              ></textarea>
            </div>

            <div class="mb-3">
              <label for="postTags" class="form-label">
                Tags (optional)
              </label>
              <input
                id="postTags"
                v-model="tagsText"
                type="text"
                class="form-control"
                placeholder="home-cooked, meal-prep"
              >
              <div class="form-text">Separate tags with commas.</div>
            </div>

            <h5 class="mt-4">Recipe details</h5>

            <div class="mb-3">
              <label for="recipeTitle" class="form-label">
                Recipe title
              </label>
              <input
                id="recipeTitle"
                v-model="title"
                type="text"
                class="form-control"
                placeholder="Homemade Chicken Rice"
                required
              >
            </div>

            <div class="mb-3">
              <label for="recipeSummary" class="form-label">
                Recipe description
              </label>
              <textarea
                id="recipeSummary"
                v-model="summary"
                class="form-control"
                rows="3"
                placeholder="Describe the dish."
                required
              ></textarea>
            </div>

            <div class="mb-3">
              <label for="recipeImage" class="form-label">
                Recipe picture URL or path
              </label>
              <input
                id="recipeImage"
                v-model="image"
                type="text"
                class="form-control"
                placeholder="/img/chicken_rice.jpg"
                required
              >
              <div class="form-text">
                Enter an image URL or a path to an existing image.
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-4">
                <label for="recipeServings" class="form-label">
                  Servings
                </label>
                <input
                  id="recipeServings"
                  v-model.number="servings"
                  type="number"
                  min="1"
                  step="1"
                  class="form-control"
                  required
                >
              </div>

              <div class="col-md-4">
                <label for="recipePrepTime" class="form-label">
                  Prep time (minutes)
                </label>
                <input
                  id="recipePrepTime"
                  v-model.number="prepTime"
                  type="number"
                  min="0"
                  step="any"
                  class="form-control"
                  required
                >
              </div>

              <div class="col-md-4">
                <label for="recipeCookingTime" class="form-label">
                  Cooking time (minutes)
                </label>
                <input
                  id="recipeCookingTime"
                  v-model.number="cookingTime"
                  type="number"
                  min="0"
                  step="any"
                  class="form-control"
                  required
                >
              </div>
            </div>

            <h6>Ingredients</h6>

            <div
              v-for="(ingredient, index) in ingredients"
              :key="index"
              class="row g-2 mb-3"
            >
              <div class="col-md-5">
                <label
                  :for="'ingredientName' + index"
                  class="form-label"
                >
                  Ingredient {{ index + 1 }}
                </label>
                <input
                  :id="'ingredientName' + index"
                  v-model="ingredient.name"
                  class="form-control"
                  placeholder="Chicken"
                  required
                >
              </div>

              <div class="col-md-2">
                <label
                  :for="'ingredientAmount' + index"
                  class="form-label"
                >
                  Amount
                </label>
                <input
                  :id="'ingredientAmount' + index"
                  v-model.number="ingredient.amount"
                  type="number"
                  min="0.000001"
                  step="any"
                  class="form-control"
                  required
                >
              </div>

              <div class="col-md-3">
                <label
                  :for="'ingredientUnit' + index"
                  class="form-label"
                >
                  Unit
                </label>
                <input
                  :id="'ingredientUnit' + index"
                  v-model="ingredient.unit"
                  class="form-control"
                  placeholder="g, cups, pieces"
                  required
                >
              </div>

              <div class="col-md-2 d-flex align-items-end">
                <button
                  type="button"
                  class="btn btn-outline-danger"
                  :disabled="ingredients.length === 1"
                  @click="removeIngredient(index)"
                >
                  Remove
                </button>
              </div>
            </div>

            <button
              type="button"
              class="btn btn-outline-success mb-4"
              @click="addIngredient"
            >
              Add ingredient
            </button>

            <h6>Instructions</h6>

            <div
              v-for="(instruction, index) in instructions"
              :key="index"
              class="mb-3"
            >
              <label :for="'recipeStep' + index" class="form-label">
                Step {{ index + 1 }}
              </label>
              <textarea
                :id="'recipeStep' + index"
                v-model="instruction.description"
                class="form-control mb-2"
                rows="2"
                required
              ></textarea>

              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                :disabled="instructions.length === 1"
                @click="removeStep(index)"
              >
                Remove step
              </button>
            </div>

            <button
              type="button"
              class="btn btn-outline-success mb-3"
              @click="addStep"
            >
              Add step
            </button>

            <div>
              <button type="submit" class="btn btn-success">
                {{ submitting ? 'Posting...' : 'Share Recipe' }}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>

    <p v-else>
      <RouterLink to="/login">Log in</RouterLink>
      to share your homemade recipe.
    </p>

    <!-- Community feed -->
    <h2 class="h4">Community posts</h2>

    <p v-if="likeError" class="text-danger" role="alert">
      {{ likeError }}
    </p>

    <p v-if="loading">Loading posts...</p>

    <div v-else-if="error">
      <p class="text-danger" role="alert">{{ error }}</p>
      <button class="btn btn-primary" @click="loadPosts">
        Try again
      </button>
    </div>

    <p v-else-if="posts.length === 0">
      No posts yet. Be the first to share a recipe!
    </p>

    <div v-else>
      <div
        v-for="post in posts"
        :key="post._id"
        class="card mb-4"
      >
        <div class="card-body">
          <h5 class="card-title">
            {{ post.userId?.name || 'Unknown user' }}
          </h5>

          <p class="text-muted small">
            {{ new Date(post.createdAt).toLocaleString() }}
          </p>

          <p class="preserve-lines">{{ post.content }}</p>

          <!-- Image belonging to an older text-only post -->
          <img
            v-if="post.image"
            :src="post.image"
            alt="Shared meal"
            class="recipe-image mb-3"
          >

          <div class="mb-2">
            <span
              v-for="tag in post.tags"
              :key="tag"
              class="badge bg-success me-2"
            >
              {{ tag }}
            </span>
          </div>

          <!-- Linked recipe -->
          <div
            v-if="post.recipeId && typeof post.recipeId === 'object'"
            class="border-top mt-3 pt-3"
          >
            <h5>{{ post.recipeId.title }}</h5>

            <img
              v-if="post.recipeId.image"
              :src="post.recipeId.image"
              :alt="post.recipeId.title"
              class="recipe-image mb-3"
            >

            <p class="preserve-lines">{{ post.recipeId.summary }}</p>

            <p class="text-muted">
              Servings: {{ post.recipeId.servings }}
              · Prep: {{ post.recipeId.prepTime }} minutes
              · Cooking: {{ post.recipeId.cookingTime }} minutes
            </p>

            <h6>Ingredients</h6>
            <ul>
              <li
                v-for="(ingredient, index) in post.recipeId.ingredients"
                :key="index"
              >
                {{ ingredient.amount }} {{ ingredient.unit }}
                {{ ingredient.name }}
              </li>
            </ul>

            <h6>Instructions</h6>
            <ol>
              <li
                v-for="instruction in post.recipeId.instructions"
                :key="instruction.step"
                class="preserve-lines mb-2"
              >
                {{ instruction.description }}
              </li>
            </ol>
          </div>

          <!-- Like / unlike -->
          <div class="border-top mt-3 pt-3">
            <button
              v-if="auth.user"
              type="button"
              class="btn"
              :class="likedPostIds.includes(post._id)
                ? 'btn-success'
                : 'btn-outline-success'"
              :disabled="likingPostIds.includes(post._id)"
              @click="toggleLike(post)"
            >
              {{ likedPostIds.includes(post._id) ? 'Unlike' : 'Like' }}
              · {{ post.likeCount ?? 0 }}
            </button>

            <span v-else class="text-muted">
              {{ post.likeCount ?? 0 }} likes ·
              <RouterLink to="/login">Log in to like</RouterLink>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preserve-lines {
  white-space: pre-wrap;
}

.recipe-image {
  display: block;
  max-width: 100%;
  max-height: 400px;
  object-fit: contain;
}
</style>