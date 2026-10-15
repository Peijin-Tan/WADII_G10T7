<script setup>
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const auth = useAuthStore()
const route = useRoute()

// Tabs and recipe expansion
const activeTab = ref('community')
const expandedPostIds = ref([])

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
const cuisine = ref([])

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

// Likes
const likedPostIds = ref([])
const likingPostIds = ref([])
const loadingLikes = ref(false)
const likeError = ref('')

// Other users' recipe posts
const communityPosts = computed(() => {
  return posts.value.filter(post => {
    return post.recipeId &&
      post.userId?._id !== auth.user?._id
  })
})

// Logged-in user's posts
const myPosts = computed(() => {
  return posts.value.filter(post => {
    return auth.user &&
      post.userId?._id === auth.user._id
  })
})

const displayedPosts = computed(() => {
  if (activeTab.value === 'mine') {
    return myPosts.value
  }

  return communityPosts.value
})

function toggleRecipe(postId) {
  const index = expandedPostIds.value.indexOf(postId)

  if (index === -1) {
    expandedPostIds.value.push(postId)
  } else {
    expandedPostIds.value.splice(index, 1)
  }
}

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
  cuisine.value = []

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

  if (
    content.value.trim() === '' ||
    content.value.trim().length > 2000
  ) {
    postError.value = 'Post content must contain 1–2000 characters.'
    return
  }

  if (
    title.value.trim() === '' ||
    summary.value.trim() === '' ||
    image.value.trim() === ''
  ) {
    postError.value =
      'Enter a recipe title, description, and picture URL or path.'
    return
  }

  if (cuisine.value.length === 0) {
    postError.value = 'Please select at least one cuisine'
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
      postError.value =
        'Each ingredient needs a name, positive amount, and unit.'
      return
    }
  }

  for (const instruction of instructions.value) {
    if (instruction.description.trim() === '') {
      postError.value = 'Please complete every instruction step.'
      return
    }
  }

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
      title: title.value,
      summary: summary.value,
      image: image.value,
      cuisine: cuisine.value,
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
    activeTab.value = 'mine'
  } catch (err) {
    if (err.response?.status === 401) {
      auth.logout()
      likedPostIds.value = []
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
  likeError.value = ''

  if (!auth.token) return

  loadingLikes.value = true

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
      likeError.value = 'Please log in again to like posts.'
    } else {
      likeError.value = 'Unable to load your likes.'
    }
  } finally {
    loadingLikes.value = false
  }
}

async function toggleLike(post) {
  likeError.value = ''

  if (!auth.token) {
    likeError.value = 'Please log in to like posts.'
    return
  }

  if (
    loadingLikes.value ||
    likingPostIds.value.includes(post._id)
  ) {
    return
  }

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

async function openLinkedPost() {
  const postId = route.query.postId

  if (typeof postId !== 'string') return

  const post = posts.value.find(post => post._id === postId)

  if (!post) return

  // Select the tab containing this post.
  if (post.userId?._id === auth.user?._id) {
    activeTab.value = 'mine'
  } else {
    activeTab.value = 'community'
  }

  // Show the full recipe.
  if (!expandedPostIds.value.includes(postId)) {
    expandedPostIds.value.push(postId)
  }

  // Wait for Vue to display it before scrolling.
  await nextTick()

  const postElement = document.getElementById('post-' + postId)

  if (postElement) {
    postElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }
}

onMounted(async () => {
  await loadPosts()
  await loadMyLikes()
  await openLinkedPost()
})
</script>

<template>
  <div class="container py-4">
    <!-- Heading -->
    <div class="mb-4">
      <h1 class="fw-bold">Our cooking community</h1>
      <p class="text-muted">
        Discover homemade recipes, share your favourites, and inspire others.
      </p>
    </div>

    <!-- Navigation -->
    <div class="d-flex flex-wrap gap-2 mb-4">
      <button
        type="button"
        class="btn"
        :class="activeTab === 'community'
          ? 'btn-success'
          : 'btn-outline-success'"
        :aria-pressed="activeTab === 'community'"
        @click="activeTab = 'community'"
      >
        Community Recipes
      </button>

      <button
        type="button"
        class="btn"
        :class="activeTab === 'mine'
          ? 'btn-success'
          : 'btn-outline-success'"
        :aria-pressed="activeTab === 'mine'"
        @click="activeTab = 'mine'"
      >
        My Posts
      </button>

      <button
        type="button"
        class="btn"
        :class="activeTab === 'create'
          ? 'btn-success'
          : 'btn-outline-success'"
        :aria-pressed="activeTab === 'create'"
        @click="activeTab = 'create'"
      >
        + Create Post
      </button>
    </div>

    <!-- Messages -->
    <div v-if="success" class="alert alert-success" role="status">
      {{ success }}
    </div>

    <div v-if="postError" class="alert alert-danger" role="alert">
      {{ postError }}
    </div>

    <div v-if="likeError" class="alert alert-danger" role="alert">
      {{ likeError }}
    </div>

    <!-- Create Post -->
    <div v-if="activeTab === 'create'">
      <div v-if="!auth.user" class="bg-light rounded-4 p-5 text-center">
        <h5>Share your homemade recipe</h5>
        <p class="text-muted">Log in to create a post.</p>
        <RouterLink to="/login" class="btn btn-success">
          Log in
        </RouterLink>
      </div>

      <div v-else class="card border-0 shadow-sm rounded-4">
        <div class="card-body p-4">
          <h2 class="h4">Share a homemade recipe</h2>
          <p class="text-muted">Posting as {{ auth.user.name }}</p>

          <form @submit.prevent="createPost">
            <fieldset :disabled="submitting">
              <h3 class="h6 mt-4">Your post</h3>

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
                  placeholder="What makes this recipe special?"
                  required
                ></textarea>
              </div>

              <div class="mb-4">
                <label for="postTags" class="form-label">
                  Tags (optional)
                </label>
                <input
                  id="postTags"
                  v-model="tagsText"
                  class="form-control"
                  placeholder="home-cooked, meal-prep"
                >
                <div class="form-text">Separate tags with commas.</div>
              </div>

              <hr>
              <h3 class="h6 mt-4">Recipe overview</h3>

              <div class="mb-3">
                <label for="recipeTitle" class="form-label">
                  Recipe title
                </label>
                <input
                  id="recipeTitle"
                  v-model="title"
                  class="form-control"
                  placeholder="Homemade Chicken Rice"
                  required
                >
              </div>

              <div class="mb-3">
                <label for="recipeSummary" class="form-label">
                  Description
                </label>
                <textarea
                  id="recipeSummary"
                  v-model="summary"
                  class="form-control"
                  rows="3"
                  required
                ></textarea>
              </div>
              <div class="mb-3">
                <p class="form-label">Cuisine — select at least one</p>

                <div class="d-flex flex-wrap gap-3">
                  <div
                    v-for="option in [
                      'Chinese', 'Malay', 'Indian', 'Japanese',
                      'Korean', 'Thai', 'Vietnamese', 'Italian',
                      'Western', 'Other'
                    ]"
                    :key="option"
                    class="form-check"
                  >
                    <input
                      :id="'cuisine-' + option"
                      v-model="cuisine"
                      :value="option"
                      type="checkbox"
                      class="form-check-input"
                    >

                    <label
                      :for="'cuisine-' + option"
                      class="form-check-label"
                    >
                      {{ option }}
                    </label>
                  </div>
                </div>
              </div>

              <div class="mb-3">
                <label for="recipeImage" class="form-label">
                  Picture URL or path
                </label>
                <input
                  id="recipeImage"
                  v-model="image"
                  class="form-control"
                  placeholder="/img/chicken_rice.jpg"
                  required
                >
                <div class="form-text">
                  Enter a link or path to an existing image.
                </div>
              </div>

              <div class="row g-3 mb-4">
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

              <hr>
              <h3 class="h6 mt-4">Ingredients</h3>

              <div
                v-for="(ingredient, index) in ingredients"
                :key="index"
                class="row g-2 mb-3"
              >
                <div class="col-md-5">
                  <label :for="'ingredientName' + index" class="form-label">
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
                  <label :for="'ingredientAmount' + index" class="form-label">
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
                  <label :for="'ingredientUnit' + index" class="form-label">
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
                + Add ingredient
              </button>

              <hr>
              <h3 class="h6 mt-4">Instructions</h3>

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
                class="btn btn-outline-success mb-4"
                @click="addStep"
              >
                + Add step
              </button>

              <div class="border-top pt-3">
                <button type="submit" class="btn btn-success">
                  {{ submitting ? 'Sharing...' : 'Share Recipe' }}
                </button>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </div>

    <!-- Community Recipes / My Posts -->
    <div v-else>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h4 mb-0">
          {{ activeTab === 'mine' ? 'My posts' : 'Community recipes' }}
        </h2>

        <span v-if="!loading && !error" class="text-muted small">
          {{ displayedPosts.length }} posts
        </span>
      </div>

      <div
        v-if="activeTab === 'mine' && !auth.user"
        class="bg-light rounded-4 p-5 text-center"
      >
        <h5>Your recipes belong here</h5>
        <p class="text-muted">Log in to see your posts.</p>
        <RouterLink to="/login" class="btn btn-success">
          Log in
        </RouterLink>
      </div>

      <p v-else-if="loading" class="text-muted">
        Loading posts...
      </p>

      <div v-else-if="error" class="alert alert-danger" role="alert">
        <p>{{ error }}</p>
        <button class="btn btn-outline-danger" @click="loadPosts">
          Try again
        </button>
      </div>

      <div
        v-else-if="displayedPosts.length === 0"
        class="bg-light rounded-4 p-5 text-center"
      >
        <h5>
          {{ activeTab === 'mine'
            ? "You haven't shared a post yet"
            : 'No community recipes yet' }}
        </h5>
        <p class="text-muted">
          Share something delicious to get started.
        </p>
        <button
          class="btn btn-success"
          @click="activeTab = 'create'"
        >
          Create a post
        </button>
      </div>

      <div v-else class="row g-4">
        <div
          v-for="post in displayedPosts"
          :key="post._id"
          :id="'post-' + post._id"
          class="col-12 col-lg-6"
        >
        
          <article
            class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden"
          >
            <img
              v-if="post.recipeId?.image || post.image"
              :src="post.recipeId?.image || post.image"
              :alt="post.recipeId?.title || 'Shared meal'"
              class="card-img-top object-fit-cover"
              style="height: 240px;"
            >

            <div class="card-body p-4">
              <p class="text-muted small mb-2">
                {{ post.userId?.name || 'Unknown user' }}
                · {{ new Date(post.createdAt).toLocaleDateString() }}
              </p>

              <h3 class="h5 fw-bold">
                {{ post.recipeId?.title || 'Community post' }}
              </h3>
              <div v-if="post.recipeId?.cuisine?.length" class="mb-2">
                <span
                  v-for="cuisineName in post.recipeId.cuisine"
                  :key="cuisineName"
                  class="badge bg-success me-2"
                >
                  {{ cuisineName }}
                </span>
              </div>

              <p style="white-space: pre-wrap;">{{ post.content }}</p>

              <p v-if="post.recipeId" class="text-muted small">
                {{ post.recipeId.servings }} servings
                · {{ post.recipeId.totalTime }} minutes
              </p>

              <div class="mb-3">
                <span
                  v-for="tag in post.tags"
                  :key="tag"
                  class="badge rounded-pill text-bg-light me-1 mb-1"
                >
                  {{ tag }}
                </span>
              </div>

              <div class="d-flex flex-wrap gap-2">
                <button
                  v-if="post.recipeId"
                  type="button"
                  class="btn btn-outline-success"
                  :aria-expanded="expandedPostIds.includes(post._id)"
                  @click="toggleRecipe(post._id)"
                >
                  {{ expandedPostIds.includes(post._id)
                    ? 'Hide recipe'
                    : 'View recipe' }}
                </button>

                <button
                  v-if="auth.user"
                  type="button"
                  class="btn"
                  :class="likedPostIds.includes(post._id)
                    ? 'btn-success'
                    : 'btn-outline-secondary'"
                  :disabled="loadingLikes || likingPostIds.includes(post._id)"
                  @click="toggleLike(post)"
                >
                  {{ likedPostIds.includes(post._id) ? 'Unlike' : 'Like' }}
                  · {{ post.likeCount ?? 0 }}
                </button>

                <span v-else class="align-self-center text-muted small">
                  {{ post.likeCount ?? 0 }} likes ·
                  <RouterLink to="/login">Log in to like</RouterLink>
                </span>
              </div>

              <!-- Expanded recipe -->
              <div
                v-if="post.recipeId && expandedPostIds.includes(post._id)"
                class="border-top mt-4 pt-3"
              >
                <p style="white-space: pre-wrap;">
                  {{ post.recipeId.summary }}
                </p>

                <h4 class="h6">Ingredients</h4>
                <ul>
                  <li
                    v-for="(ingredient, index) in post.recipeId.ingredients"
                    :key="index"
                  >
                    {{ ingredient.amount }} {{ ingredient.unit }}
                    {{ ingredient.name }}
                  </li>
                </ul>

                <h4 class="h6">Instructions</h4>
                <ol>
                  <li
                    v-for="instruction in post.recipeId.instructions"
                    :key="instruction.step"
                    class="mb-2"
                    style="white-space: pre-wrap;"
                  >
                    {{ instruction.description }}
                  </li>
                </ol>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>