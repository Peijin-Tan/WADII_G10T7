<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import { createApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import {
  buildPantryRequestItem,
  clampPantryRequestQuantity,
} from '@/utils/pantryRequest'
import { applyPantryQuantityChange } from '@/utils/pantryQuantity'

const auth = useAuthStore()
const router = useRouter()
const pantryApi = createApi('/pantry')

const activeTab = ref('comments')

const comments = ref([])
const likes = ref([])
const neighbours = ref([])
const pantryItems = ref([])
const selectedNeighbourId = ref('')
const selectedNeighbour = ref(null)
const selectedBorrowItems = ref([])
const pantryRequests = ref([])

const loadingComments = ref(false)
const loadingLikes = ref(false)
const pantryLoading = ref(false)

const commentsError = ref('')
const likesError = ref('')
const pantryError = ref('')
const actionError = ref('')
const success = ref('')
const pantryNotice = ref('')

const editingCommentId = ref('')
const editContent = ref('')

const busyCommentIds = ref([])
const busyLikeIds = ref([])

// Group your comments under their respective recipes.
const commentedRecipes = computed(() => {
  const groups = []

  for (const comment of comments.value) {
    const recipe = comment.recipeId

    const key = recipe
      ? recipe._id
      : 'unavailable-' + comment._id

    let group = groups.find(item => item.key === key)

    if (!group) {
      group = {
        key: key,
        recipe: recipe,
        comments: []
      }

      groups.push(group)
    }

    group.comments.push(comment)
  }

  return groups
})

// The detail page is your groupmate's feature.
// Enable links once a matching route exists.
const recipeDetailsReady = computed(() => {
  return router.getRoutes().some(route => {
    return /^\/recipes\/:[^/]+\/?$/.test(route.path)
  })
})

function recipeLink(recipe) {
  return '/recipes/' + recipe._id
}

function formatDate(value) {
  return new Date(value).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function requestConfig() {
  return {
    headers: {
      Authorization: `Bearer ${auth.token}`
    }
  }
}

function getErrorMessage(err, fallback) {
  if (err.response?.status === 401) {
    return 'Your login has expired. Please log in again.'
  }

  return err.response?.data?.message || fallback
}

async function loadComments() {
  if (!auth.token) return

  const token = auth.token

  loadingComments.value = true
  commentsError.value = ''

  try {
    const response = await axios.get(
      '/activity/comments',
      requestConfig()
    )

    if (token === auth.token) {
      comments.value = response.data
    }
  } catch (err) {
    if (token === auth.token) {
      commentsError.value = getErrorMessage(
        err,
        'Unable to load your comments.'
      )
    }
  } finally {
    if (token === auth.token) {
      loadingComments.value = false
    }
  }
}

async function loadLikes() {
  if (!auth.token) return

  const token = auth.token

  loadingLikes.value = true
  likesError.value = ''

  try {
    const response = await axios.get(
      '/activity/likes',
      requestConfig()
    )

    if (token === auth.token) {
      likes.value = response.data
    }
  } catch (err) {
    if (token === auth.token) {
      likesError.value = getErrorMessage(
        err,
        'Unable to load your liked recipes.'
      )
    }
  } finally {
    if (token === auth.token) {
      loadingLikes.value = false
    }
  }
}

async function loadPantryActivity() {
  if (!auth.token) {
    neighbours.value = []
    pantryItems.value = []
    selectedBorrowItems.value = []
    pantryRequests.value = []
    return
  }

  const token = auth.token
  pantryLoading.value = true
  pantryError.value = ''
  pantryNotice.value = ''

  try {
    const [friendsResponse, requestsResponse] = await Promise.all([
      pantryApi.get('/neighbours'),
      pantryApi.get('/requests'),
    ])

    if (token !== auth.token) return

    neighbours.value = friendsResponse.data.friends || []
    pantryRequests.value = requestsResponse.data.requests || []

    if (!selectedNeighbourId.value && neighbours.value.length > 0) {
      selectedNeighbourId.value = neighbours.value[0]._id
      await loadNeighbourPantry(neighbours.value[0]._id)
    } else if (!selectedNeighbourId.value) {
      selectedNeighbour.value = null
      pantryItems.value = []
    }
  } catch (err) {
    if (token === auth.token) {
      pantryError.value = getErrorMessage(err, 'Unable to load your neighbour pantry.')
    }
  } finally {
    if (token === auth.token) {
      pantryLoading.value = false
    }
  }
}

async function loadNeighbourPantry(friendId) {
  if (!friendId || !auth.token) return

  pantryLoading.value = true
  pantryError.value = ''
  pantryNotice.value = ''

  try {
    const response = await pantryApi.get(`/neighbours/${friendId}`)
    selectedNeighbourId.value = friendId
    selectedNeighbour.value = response.data.friend || null
    pantryItems.value = response.data.items || []
    selectedBorrowItems.value = []
  } catch (err) {
    selectedNeighbour.value = null
    pantryItems.value = []
    pantryError.value = getErrorMessage(err, 'Unable to load this neighbour pantry.')
  } finally {
    pantryLoading.value = false
  }
}

function toggleBorrowItem(item) {
  const id = item._id || item.id || item.itemId
  const existing = selectedBorrowItems.value.find(
    (selected) => (selected.itemId || selected._id || selected.id) === id
  )

  if (existing) {
    selectedBorrowItems.value = selectedBorrowItems.value.filter(
      (selected) => (selected.itemId || selected._id || selected.id) !== id
    )
    return
  }

  selectedBorrowItems.value.push(
    buildPantryRequestItem(item, clampPantryRequestQuantity(Number(item.quantity) || 1, 1))
  )
}

function updateBorrowQuantity(item, rawValue) {
  const id = item.itemId || item._id || item.id
  const safeValue = clampPantryRequestQuantity(
    Number(item.availableQuantity ?? item.quantity ?? 1) || 1,
    Number(rawValue) || 1
  )

  const existingIndex = selectedBorrowItems.value.findIndex(
    (selected) => (selected.itemId || selected._id || selected.id) === id
  )

  if (existingIndex === -1) {
    selectedBorrowItems.value.push(buildPantryRequestItem(item, safeValue))
    return
  }

  const nextItems = selectedBorrowItems.value.map((selected) => {
    const currentId = selected.itemId || selected._id || selected.id
    if (String(currentId) !== String(id)) {
      return selected
    }

    return {
      ...selected,
      quantity: safeValue,
      availableQuantity: Number(item.availableQuantity ?? item.quantity ?? safeValue),
      name: item.name || selected.name,
      unit: item.unit || selected.unit,
    }
  })

  selectedBorrowItems.value = nextItems
}

async function requestNeighbourAction(requestType = 'borrow') {
  if (!selectedNeighbourId.value || selectedBorrowItems.value.length === 0) {
    pantryNotice.value = 'Please select at least one item before sending this request.'
    return
  }

  try {
    const response = await pantryApi.post('/requests', {
      friendId: selectedNeighbourId.value,
      requestType,
      items: selectedBorrowItems.value.map((item) => buildPantryRequestItem(item, item.quantity)),
      message: `Please approve this ${requestType} request.`,
    })

    pantryNotice.value = response.data.message
    selectedBorrowItems.value = []
    await loadPantryActivity()
  } catch (err) {
    pantryNotice.value = getErrorMessage(err, 'Could not send this request.')
  }
}

async function updatePantryRequestStatus(requestId, status) {
  try {
    const response = await pantryApi.patch(`/requests/${requestId}`, { status })
    pantryNotice.value = response.data.message
    await loadPantryActivity()
  } catch (err) {
    pantryNotice.value = getErrorMessage(err, 'Could not update this request.')
  }
}

function loadActivity() {
  comments.value = []
  likes.value = []

  commentsError.value = ''
  likesError.value = ''
  pantryError.value = ''
  actionError.value = ''
  success.value = ''

  editingCommentId.value = ''
  editContent.value = ''

  busyCommentIds.value = []
  busyLikeIds.value = []

  loadingComments.value = false
  loadingLikes.value = false
  pantryLoading.value = false

  if (auth.token) {
    loadComments()
    loadLikes()
    loadPantryActivity()
  }
}

function startEdit(comment) {
  editingCommentId.value = comment._id
  editContent.value = comment.content

  actionError.value = ''
  success.value = ''
}

function cancelEdit() {
  editingCommentId.value = ''
  editContent.value = ''
}

async function saveComment(comment) {
  if (busyCommentIds.value.includes(comment._id)) return

  actionError.value = ''
  success.value = ''

  const content = editContent.value.trim()

  if (content === '' || content.length > 2000) {
    actionError.value = 'Comment must contain 1–2000 characters.'
    return
  }

  const token = auth.token
  busyCommentIds.value.push(comment._id)

  try {
    const response = await axios.put(
      '/activity/comments/' + comment._id,
      {
        content: content
      },
      requestConfig()
    )

    if (token !== auth.token) return

    const index = comments.value.findIndex(
      item => item._id === comment._id
    )

    if (index !== -1) {
      comments.value[index] = response.data
    }

    cancelEdit()
    success.value = 'Your comment was updated.'
  } catch (err) {
    if (token === auth.token) {
      actionError.value = getErrorMessage(
        err,
        'Unable to update your comment.'
      )
    }
  } finally {
    if (token === auth.token) {
      busyCommentIds.value = busyCommentIds.value.filter(
        id => id !== comment._id
      )
    }
  }
}

async function deleteComment(comment) {
  if (busyCommentIds.value.includes(comment._id)) return

  const confirmed = window.confirm(
    'Delete this comment? This cannot be undone.'
  )

  if (!confirmed) return

  actionError.value = ''
  success.value = ''

  const token = auth.token
  busyCommentIds.value.push(comment._id)

  try {
    await axios.delete(
      '/activity/comments/' + comment._id,
      requestConfig()
    )

    if (token !== auth.token) return

    comments.value = comments.value.filter(
      item => item._id !== comment._id
    )

    if (editingCommentId.value === comment._id) {
      cancelEdit()
    }

    success.value = 'Your comment was deleted.'
  } catch (err) {
    if (token === auth.token) {
      actionError.value = getErrorMessage(
        err,
        'Unable to delete your comment.'
      )
    }
  } finally {
    if (token === auth.token) {
      busyCommentIds.value = busyCommentIds.value.filter(
        id => id !== comment._id
      )
    }
  }
}

async function unlikeRecipe(like) {
  if (busyLikeIds.value.includes(like._id)) return

  actionError.value = ''
  success.value = ''

  const token = auth.token
  busyLikeIds.value.push(like._id)

  try {
    await axios.delete(
      '/activity/likes/' + like._id,
      requestConfig()
    )

    if (token !== auth.token) return

    likes.value = likes.value.filter(
      item => item._id !== like._id
    )

    success.value = 'Recipe removed from your likes.'
  } catch (err) {
    if (token === auth.token) {
      actionError.value = getErrorMessage(
        err,
        'Unable to unlike this recipe.'
      )
    }
  } finally {
    if (token === auth.token) {
      busyLikeIds.value = busyLikeIds.value.filter(
        id => id !== like._id
      )
    }
  }
}

onMounted(loadActivity)

// Clear and reload activity if the logged-in account changes.
watch(() => auth.token, loadActivity)
</script>

<template>
  <div class="fft-page">
    <main class="container py-4 text-start">
      <header class="mb-4">
        <h1 class="activity-heading">Your Activity</h1>
        <p class="text-muted">View your comments and likes.</p>
      </header>

      <!-- Login required -->
      <div
        v-if="!auth.token"
        class="bg-light rounded-4 p-5 text-center"
      >
        <h2 class="h5">Your activity belongs here</h2>

        <p class="text-muted">
          Log in to view your comments and liked recipes.
        </p>

        <RouterLink to="/login" class="btn activity-button">
          Log in
        </RouterLink>
      </div>

      <div v-else>
        <!-- Tabs -->
        <div class="d-flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            class="btn"
            :class="activeTab === 'comments'
              ? 'activity-button'
              : 'activity-outline'"
            :aria-pressed="activeTab === 'comments'"
            @click="activeTab = 'comments'"
          >
            My Comments
          </button>

          <button
            type="button"
            class="btn"
            :class="activeTab === 'likes'
              ? 'activity-button'
              : 'activity-outline'"
            :aria-pressed="activeTab === 'likes'"
            @click="activeTab = 'likes'"
          >
            My Liked Recipes
          </button>

          <button
            type="button"
            class="btn"
            :class="activeTab === 'pantry'
              ? 'activity-button'
              : 'activity-outline'"
            :aria-pressed="activeTab === 'pantry'"
            @click="activeTab = 'pantry'"
          >
            Neighbour Pantry
          </button>
        </div>

        <!-- Messages -->
        <div
          v-if="success"
          class="alert alert-success"
          role="status"
        >
          {{ success }}
        </div>

        <div
          v-if="actionError"
          class="alert alert-danger"
          role="alert"
        >
          {{ actionError }}
        </div>

        <p v-if="!recipeDetailsReady" class="text-muted small mb-4">
          Recipe details are coming soon. View Recipe links will become
          available once the recipe detail page is connected.
        </p>

        <!-- My Comments -->
        <section v-if="activeTab === 'comments'">
          <div
            class="d-flex justify-content-between align-items-center mb-3"
          >
            <h2 class="h4 mb-0">My Comments</h2>

            <span
              v-if="!loadingComments && !commentsError"
              class="text-muted small"
            >
              {{ comments.length }}
              {{ comments.length === 1 ? 'comment' : 'comments' }}
            </span>
          </div>

          <p
            v-if="loadingComments"
            class="text-muted"
            role="status"
          >
            Loading your comments...
          </p>

          <div
            v-else-if="commentsError"
            class="alert alert-danger"
            role="alert"
          >
            <p>{{ commentsError }}</p>

            <button
              type="button"
              class="btn activity-outline"
              @click="loadComments"
            >
              Try again
            </button>
          </div>

          <div
            v-else-if="comments.length === 0"
            class="bg-light rounded-4 p-5 text-center"
          >
            <h3 class="h5">No comments yet</h3>

            <p class="text-muted">
              Recipes you comment on will appear here.
            </p>

            <RouterLink to="/recipes" class="btn activity-button">
              Browse Recipes
            </RouterLink>
          </div>

          <div v-else class="row g-4">
            <div
              v-for="group in commentedRecipes"
              :key="group.key"
              class="col-12 col-lg-6"
            >
              <article class="card activity-card h-100">
                <!-- Clickable image when details are available -->
                <RouterLink
                  v-if="group.recipe && recipeDetailsReady"
                  :to="recipeLink(group.recipe)"
                >
                  <img
                    v-recipe-img="group.recipe.image"
                    :alt="group.recipe.title"
                    class="recipe-image card-img-top"
                  >
                </RouterLink>

                <img
                  v-else-if="group.recipe"
                  v-recipe-img="group.recipe.image"
                  :alt="group.recipe.title"
                  class="recipe-image card-img-top"
                >

                <div class="card-body p-4">
                  <h3 class="h5 recipe-title">
                    <RouterLink
                      v-if="group.recipe && recipeDetailsReady"
                      :to="recipeLink(group.recipe)"
                      class="recipe-title text-decoration-none"
                    >
                      {{ group.recipe.title }}
                    </RouterLink>

                    <span v-else>
                      {{ group.recipe?.title || 'Recipe no longer available' }}
                    </span>
                  </h3>

                  <div v-if="group.recipe" class="mb-3">
                    <span
                      v-for="name in group.recipe.cuisine"
                      :key="name"
                      class="badge cuisine-badge me-1 mb-1"
                    >
                      {{ name }}
                    </span>
                  </div>

                  <!-- Your comments on this recipe -->
                  <div
                    v-for="comment in group.comments"
                    :key="comment._id"
                    class="comment-entry"
                  >
                    <p class="text-muted small mb-2">
                      {{ formatDate(comment.createdAt) }}

                      <span
                        v-if="comment.updatedAt !== comment.createdAt"
                      >
                        · Edited
                      </span>
                    </p>

                    <!-- Edit form -->
                    <form
                      v-if="editingCommentId === comment._id"
                      @submit.prevent="saveComment(comment)"
                    >
                      <label
                        :for="'comment-' + comment._id"
                        class="form-label"
                      >
                        Edit your comment
                      </label>

                      <textarea
                        :id="'comment-' + comment._id"
                        v-model="editContent"
                        class="form-control mb-2"
                        rows="3"
                        maxlength="2000"
                        required
                        :disabled="busyCommentIds.includes(comment._id)"
                      ></textarea>

                      <div class="d-flex gap-2">
                        <button
                          type="submit"
                          class="btn activity-button btn-sm"
                          :disabled="busyCommentIds.includes(comment._id)"
                        >
                          {{ busyCommentIds.includes(comment._id)
                            ? 'Saving...'
                            : 'Save Changes' }}
                        </button>

                        <button
                          type="button"
                          class="btn activity-outline btn-sm"
                          :disabled="busyCommentIds.includes(comment._id)"
                          @click="cancelEdit"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>

                    <!-- Comment text and actions -->
                    <div v-else>
                      <p class="preserve-lines">
                        {{ comment.content }}
                      </p>

                      <div class="d-flex gap-2">
                        <button
                          type="button"
                          class="btn activity-outline btn-sm"
                          :disabled="busyCommentIds.includes(comment._id)"
                          @click="startEdit(comment)"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          class="btn btn-outline-danger btn-sm"
                          :disabled="busyCommentIds.includes(comment._id)"
                          @click="deleteComment(comment)"
                        >
                          {{ busyCommentIds.includes(comment._id)
                            ? 'Deleting...'
                            : 'Delete' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <RouterLink
                    v-if="group.recipe && recipeDetailsReady"
                    :to="recipeLink(group.recipe)"
                    class="btn activity-outline mt-3"
                  >
                    View Recipe
                  </RouterLink>

                  <button
                    v-else-if="group.recipe"
                    type="button"
                    class="btn activity-outline mt-3"
                    disabled
                  >
                    View Recipe · Coming soon
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        <!-- My Liked Recipes -->
        <section v-else-if="activeTab === 'likes'">
          <div
            class="d-flex justify-content-between align-items-center mb-3"
          >
            <h2 class="h4 mb-0">My Liked Recipes</h2>

            <span
              v-if="!loadingLikes && !likesError"
              class="text-muted small"
            >
              {{ likes.length }}
              {{ likes.length === 1 ? 'like' : 'likes' }}
            </span>
          </div>

          <p
            v-if="loadingLikes"
            class="text-muted"
            role="status"
          >
            Loading your liked recipes...
          </p>

          <div
            v-else-if="likesError"
            class="alert alert-danger"
            role="alert"
          >
            <p>{{ likesError }}</p>

            <button
              type="button"
              class="btn activity-outline"
              @click="loadLikes"
            >
              Try again
            </button>
          </div>

          <div
            v-else-if="likes.length === 0"
            class="bg-light rounded-4 p-5 text-center"
          >
            <h3 class="h5">No liked recipes yet</h3>

            <p class="text-muted">
              Recipes you like will appear here.
            </p>

            <RouterLink to="/recipes" class="btn activity-button">
              Browse Recipes
            </RouterLink>
          </div>

          <div v-else class="row g-4">
            <div
              v-for="like in likes"
              :key="like._id"
              class="col-12 col-md-6 col-lg-4"
            >
              <article class="card activity-card h-100">
                <RouterLink
                  v-if="like.recipe && recipeDetailsReady"
                  :to="recipeLink(like.recipe)"
                >
                  <img
                    v-recipe-img="like.recipe.image"
                    :alt="like.recipe.title"
                    class="recipe-image card-img-top"
                  >
                </RouterLink>

                <img
                  v-else-if="like.recipe"
                  v-recipe-img="like.recipe.image"
                  :alt="like.recipe.title"
                  class="recipe-image card-img-top"
                >

                <div class="card-body p-4 d-flex flex-column">
                  <h3 class="h5 recipe-title">
                    <RouterLink
                      v-if="like.recipe && recipeDetailsReady"
                      :to="recipeLink(like.recipe)"
                      class="recipe-title text-decoration-none"
                    >
                      {{ like.recipe.title }}
                    </RouterLink>

                    <span v-else>
                      {{ like.recipe?.title || 'Recipe unavailable' }}
                    </span>
                  </h3>

                  <p
                    v-if="like.recipe?.totalTime != null"
                    class="text-muted small"
                  >
                    {{ like.recipe.totalTime }} minutes
                  </p>

                  <div v-if="like.recipe" class="mb-3">
                    <span
                      v-for="name in like.recipe.cuisine"
                      :key="name"
                      class="badge cuisine-badge me-1 mb-1"
                    >
                      {{ name }}
                    </span>
                  </div>

                  <p class="text-muted small">
                    Liked {{ formatDate(like.createdAt) }}
                  </p>

                  <p v-if="!like.recipe" class="text-muted small">
                    This recipe has been removed or is not stored
                    in the recipe collection.
                  </p>

                  <div class="d-flex flex-wrap gap-2 mt-auto">
                    <RouterLink
                      v-if="like.recipe && recipeDetailsReady"
                      :to="recipeLink(like.recipe)"
                      class="btn activity-outline"
                    >
                      View Recipe
                    </RouterLink>

                    <button
                      v-else-if="like.recipe"
                      type="button"
                      class="btn activity-outline"
                      disabled
                    >
                      View Recipe · Coming soon
                    </button>

                    <button
                      type="button"
                      class="btn activity-button"
                      :disabled="busyLikeIds.includes(like._id)"
                      @click="unlikeRecipe(like)"
                    >
                      {{ busyLikeIds.includes(like._id)
                        ? 'Removing...'
                        : 'Unlike' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'pantry'" class="row g-4">
          <div class="col-12 col-lg-5">
            <div class="card activity-card h-100">
              <div class="card-body p-4">
                <h2 class="h4 mb-3">Neighbour Pantry</h2>

                <div v-if="pantryLoading" class="text-muted">Loading pantry...</div>
                <div v-else-if="pantryError" class="alert alert-danger">{{ pantryError }}</div>

                <div v-else-if="neighbours.length === 0" class="text-muted">
                  You have no neighbour pantry access yet.
                </div>

                <div v-else class="list-group list-group-flush">
                  <button
                    v-for="friend in neighbours"
                    :key="friend._id"
                    type="button"
                    class="list-group-item list-group-item-action text-start"
                    :class="selectedNeighbourId === friend._id ? 'active' : ''"
                    @click="loadNeighbourPantry(friend._id)"
                  >
                    <strong>{{ friend.name || 'Neighbour' }}</strong>
                    <div class="small text-muted">{{ friend.email }}</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12 col-lg-7">
            <div class="card activity-card h-100">
              <div class="card-body p-4">
                <div v-if="selectedNeighbour" class="mb-3">
                  <h3 class="h5 mb-1">{{ selectedNeighbour.name }}'s pantry</h3>
                  <p class="text-muted small mb-0">Borrow requests stay within your accepted friends.</p>
                </div>

                <div v-if="pantryNotice" class="alert alert-success mb-3">{{ pantryNotice }}</div>

                <div v-if="pantryLoading" class="text-muted">Loading ingredients...</div>

                <div v-else-if="!selectedNeighbour" class="text-muted">
                  Select a neighbour to view their pantry.
                </div>

                <div v-else-if="pantryItems.length === 0" class="text-muted">
                  This pantry has no available items right now.
                </div>

                <div v-else class="d-grid gap-3">
                  <div
                    v-for="item in pantryItems"
                    :key="item._id || item.id"
                    class="border rounded-4 p-3"
                  >
                    <div class="d-flex justify-content-between align-items-start gap-3">
                      <div>
                        <strong>{{ item.name }}</strong>
                        <div class="small text-muted">
                          {{ item.quantity }} {{ item.unit }} · Expires {{ item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'No date' }}
                        </div>
                      </div>

                      <button
                        type="button"
                        class="btn btn-sm"
                        :class="selectedBorrowItems.some((selected) => (selected.itemId || selected._id || selected.id) === (item._id || item.id)) ? 'activity-button' : 'activity-outline'"
                        @click="toggleBorrowItem(item)"
                      >
                        {{ selectedBorrowItems.some((selected) => (selected.itemId || selected._id || selected.id) === (item._id || item.id)) ? 'Selected' : 'Select' }}
                      </button>
                    </div>

                    <div v-if="selectedBorrowItems.some((selected) => (selected.itemId || selected._id || selected.id) === (item._id || item.id))" class="mt-3">
                      <label class="form-label small mb-1">Requested quantity</label>
                      <input
                        :value="selectedBorrowItems.find((selected) => (selected.itemId || selected._id || selected.id) === (item._id || item.id))?.quantity || 1"
                        type="number"
                        min="1"
                        :max="Number(item.quantity) || 1"
                        class="form-control"
                        @input="updateBorrowQuantity({
                          itemId: item._id || item.id,
                          name: item.name,
                          quantity: selectedBorrowItems.find((selected) => (selected.itemId || selected._id || selected.id) === (item._id || item.id))?.quantity || 1,
                          availableQuantity: Number(item.quantity) || 1,
                          unit: item.unit,
                        }, $event.target.value)"
                      >
                    </div>
                  </div>
                </div>

                <div v-if="selectedBorrowItems.length > 0" class="mt-4 border rounded-4 p-3 bg-light">
                  <h3 class="h6 mb-3">Borrow request</h3>
                  <ul class="mb-3 ps-3">
                    <li v-for="selected in selectedBorrowItems" :key="selected.itemId || selected._id || selected.id">
                      {{ selected.name }} — {{ selected.quantity }} {{ selected.unit }}
                    </li>
                  </ul>
                  <button type="button" class="btn activity-button" @click="requestNeighbourAction('borrow')">
                    Send Borrow Request
                  </button>
                </div>

                <div v-if="pantryRequests.length > 0" class="mt-4">
                  <h3 class="h6 mb-3">Pending requests</h3>
                  <div v-for="request in pantryRequests" :key="request._id" class="border rounded-4 p-3 mb-2">
                    <div class="fw-semibold">{{ request.requestType }} request from {{ request.requester?.name || 'Someone' }}</div>
                    <div class="small text-muted mb-2">{{ request.items.map((entry) => `${entry.name} × ${entry.quantity}`).join(', ') }}</div>
                    <div class="d-flex gap-2">
                      <button type="button" class="btn btn-sm btn-success" @click="updatePantryRequestStatus(request._id, 'approved')">Approve</button>
                      <button type="button" class="btn btn-sm btn-outline-danger" @click="updatePantryRequestStatus(request._id, 'rejected')">Reject</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.activity-heading {
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: 32px;
  font-weight: 600;
  line-height: 40px;
  letter-spacing: -0.01em;
}

.activity-card {
  background-color: var(--fft-card);
  border: 1px solid rgb(194 200 192 / 40%);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.recipe-title {
  color: var(--fft-primary);
  font-family: 'Outfit', sans-serif;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}

.recipe-title a:hover {
  color: var(--fft-primary-hover);
}

.recipe-image {
  display: block;
  width: 100%;
  height: 220px;
  object-fit: cover;
}

.cuisine-badge {
  background-color: var(--fft-primary-light);
  color: var(--fft-primary-dark);
  font-family: 'Inter', sans-serif;
  font-weight: 500;
}

.preserve-lines {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment-entry {
  border-top: 1px solid var(--fft-surface-high);
  padding-top: 16px;
  margin-top: 16px;
}

.activity-button {
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

.activity-outline {
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