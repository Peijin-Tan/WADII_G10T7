<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  recipeId: {
    type: String,
    required: true
  }
})

const auth = useAuthStore()

const comments = ref([])
const content = ref('')

const loading = ref(false)
const submitting = ref(false)

const loadError = ref('')
const submitError = ref('')
const success = ref('')

const editingCommentId = ref('')
const editContent = ref('')
const busyCommentIds = ref([])
// Prevent old requests from updating a different recipe or account.
let requestVersion = 0

function requestConfig() {
  return {
    headers: {
      Authorization: `Bearer ${auth.token}`
    }
  }
}

function errorMessage(err, fallback) {
  if (err.response?.status === 401) {
    return 'Your login has expired. Please log in again.'
  }

  return err.response?.data?.message || fallback
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

async function loadComments() {
  if (!auth.token) return

  const version = ++requestVersion

  loading.value = true
  loadError.value = ''

  try {
    const response = await axios.get(
      '/activity/recipes/' + props.recipeId + '/comments',
      requestConfig()
    )

    if (version !== requestVersion) return

    comments.value = response.data
  } catch (err) {
    if (version !== requestVersion) return

    loadError.value = errorMessage(
      err,
      'Unable to load comments.'
    )
  } finally {
    if (version === requestVersion) {
      loading.value = false
    }
  }
}

async function submitComment() {
  if (
    submitting.value ||
    loading.value ||
    loadError.value
  ) {
    return
  }

  submitError.value = ''
  success.value = ''

  if (!auth.token) {
    submitError.value = 'Please log in to comment.'
    return
  }

  const cleanedContent = content.value.trim()

  if (
    cleanedContent === '' ||
    cleanedContent.length > 2000
  ) {
    submitError.value =
      'Comment must contain 1–2000 characters.'
    return
  }

  const version = requestVersion

  submitting.value = true

  try {
    const response = await axios.post(
      '/activity/recipes/' + props.recipeId + '/comments',
      {
        content: cleanedContent
      },
      requestConfig()
    )

    if (version !== requestVersion) return

    comments.value.unshift(response.data)
    content.value = ''

    success.value =
      'Comment added!'
  } catch (err) {
    if (version !== requestVersion) return

    submitError.value = errorMessage(
      err,
      'Unable to add your comment.'
    )
  } finally {
    if (version === requestVersion) {
      submitting.value = false
    }
  }
}

function isMyComment(comment) {
  return (
    auth.user?._id &&
    comment.userId?._id === auth.user._id
  )
}

function startEdit(comment) {
  editingCommentId.value = comment._id
  editContent.value = comment.content

  submitError.value = ''
  success.value = ''
}

function cancelEdit() {
  editingCommentId.value = ''
  editContent.value = ''
}

async function saveComment(comment) {
  if (
    !isMyComment(comment) ||
    busyCommentIds.value.includes(comment._id)
  ) {
    return
  }

  submitError.value = ''
  success.value = ''

  const cleanedContent = editContent.value.trim()

  if (
    cleanedContent === '' ||
    cleanedContent.length > 2000
  ) {
    submitError.value =
      'Comment must contain 1–2000 characters.'
    return
  }

  const version = requestVersion
  busyCommentIds.value.push(comment._id)

  try {
    const response = await axios.put(
      '/activity/comments/' + comment._id,
      {
        content: cleanedContent
      },
      requestConfig()
    )

    if (version !== requestVersion) return

    // Keep the populated author information already displayed.
    comment.content = response.data.content
    comment.updatedAt = response.data.updatedAt

    cancelEdit()
    success.value = 'Your comment was updated.'
  } catch (err) {
    if (version !== requestVersion) return

    submitError.value = errorMessage(
      err,
      'Unable to update your comment.'
    )
  } finally {
    if (version === requestVersion) {
      busyCommentIds.value = busyCommentIds.value.filter(
        id => id !== comment._id
      )
    }
  }
}

async function deleteComment(comment) {
  if (
    !isMyComment(comment) ||
    busyCommentIds.value.includes(comment._id)
  ) {
    return
  }

  const confirmed = window.confirm('Delete this comment?')

  if (!confirmed) return

  submitError.value = ''
  success.value = ''

  const version = requestVersion
  busyCommentIds.value.push(comment._id)

  try {
    await axios.delete(
      '/activity/comments/' + comment._id,
      requestConfig()
    )

    if (version !== requestVersion) return

    comments.value = comments.value.filter(
      item => item._id !== comment._id
    )

    if (editingCommentId.value === comment._id) {
      cancelEdit()
    }

    success.value = 'Your comment was deleted.'
  } catch (err) {
    if (version !== requestVersion) return

    submitError.value = errorMessage(
      err,
      'Unable to delete your comment.'
    )
  } finally {
    if (version === requestVersion) {
      busyCommentIds.value = busyCommentIds.value.filter(
        id => id !== comment._id
      )
    }
  }
}

// Load comments initially and whenever the recipe or login changes.
watch(
  [() => props.recipeId, () => auth.token],
  () => {
    requestVersion++

    comments.value = []
    content.value = ''

    loadError.value = ''
    submitError.value = ''
    success.value = ''
    editingCommentId.value = ''
    editContent.value = ''
    busyCommentIds.value = []

    loading.value = false
    submitting.value = false

    if (auth.token) {
      loadComments()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  requestVersion++
})
</script>

<template>
  <section
    id="comments"
    class="recipe-comments mt-5"
    aria-labelledby="comments-heading"
  >
    <div
      class="d-flex flex-wrap justify-content-between
             align-items-center gap-2 mb-4"
    >
      <h2 id="comments-heading" class="h4 mb-0">
        Comments
      </h2>

      <RouterLink
        v-if="auth.token"
        to="/community"
        class="comments-link"
      >
        Manage my comments
      </RouterLink>
    </div>

    <p v-if="!auth.token" class="text-muted mb-0">
      <RouterLink to="/login" class="comments-link">
        Log in
      </RouterLink>
      to read and add comments.
    </p>

    <template v-else>
      <p
        v-if="success"
        class="alert alert-success"
        role="status"
      >
        {{ success }}
      </p>

      <p
        v-if="submitError"
        class="alert alert-danger"
        role="alert"
      >
        {{ submitError }}
      </p>

      <form
        class="mb-4"
        @submit.prevent="submitComment"
      >
        <label
          for="recipe-comment"
          class="form-label"
        >
          Share your thoughts on this recipe
        </label>

        <textarea
          id="recipe-comment"
          v-model="content"
          class="form-control"
          rows="3"
          maxlength="2000"
          required
          :disabled="submitting"
          placeholder="Have you tried it? Share a tip or ask a question."
        ></textarea>

        <div
          class="d-flex justify-content-between
                 align-items-center gap-3 mt-2"
        >
          <span class="text-muted small">
            {{ content.length }} / 2000
          </span>

          <button
            type="submit"
            class="btn comment-button"
            :disabled="
              submitting ||
              loading ||
              !!loadError ||
              !content.trim()
            "
          >
            {{ submitting ? 'Posting...' : 'Post Comment' }}
          </button>
        </div>
      </form>

      <p
        v-if="loading"
        class="text-muted"
        role="status"
      >
        Loading comments...
      </p>

      <div
        v-else-if="loadError"
        class="alert alert-danger"
        role="alert"
      >
        <p>{{ loadError }}</p>

        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="loadComments"
        >
          Try again
        </button>
      </div>

      <p
        v-else-if="comments.length === 0"
        class="text-muted mb-0"
      >
        No comments yet. Be the first to share your thoughts.
      </p>

      <div v-else>
        <p class="text-muted small">
          {{ comments.length }}
          {{ comments.length === 1 ? 'comment' : 'comments' }}
        </p>

        <article
        v-for="comment in comments"
        :key="comment._id"
        class="comment-entry"
        >
        <div
            class="d-flex flex-wrap justify-content-between
                align-items-center gap-2 mb-2"
        >
            <span class="fw-semibold">
            {{ comment.userId?.name || 'Deleted user' }}
            </span>

            <span class="text-muted small">
            {{ formatDate(comment.createdAt) }}

            <span v-if="comment.updatedAt !== comment.createdAt">
                · Edited
            </span>
            </span>
        </div>

        <!-- Editing your comment -->
        <form
            v-if="editingCommentId === comment._id && isMyComment(comment)"
            @submit.prevent="saveComment(comment)"
        >
            <label
            :for="'edit-comment-' + comment._id"
            class="form-label"
            >
            Edit your comment
            </label>

            <textarea
            :id="'edit-comment-' + comment._id"
            v-model="editContent"
            class="form-control"
            rows="3"
            maxlength="2000"
            required
            :disabled="busyCommentIds.includes(comment._id)"
            ></textarea>

            <div class="d-flex gap-2 mt-2">
            <button
                type="submit"
                class="btn comment-button btn-sm"
                :disabled="
                busyCommentIds.includes(comment._id) ||
                !editContent.trim()
                "
            >
                {{ busyCommentIds.includes(comment._id)
                ? 'Saving...'
                : 'Save Changes' }}
            </button>

            <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="busyCommentIds.includes(comment._id)"
                @click="cancelEdit"
            >
                Cancel
            </button>
            </div>
        </form>

        <!-- Displaying the comment -->
            <template v-else>
                <p class="comment-content mb-0">
                {{ comment.content }}
                </p>

                <div
                v-if="isMyComment(comment)"
                class="d-flex gap-2 mt-3"
                >
                <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
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
            </template>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.recipe-comments {
  padding: 24px;
  border: 1px solid rgb(194 200 192 / 40%);
  border-radius: 16px;
  background-color: var(--fft-card, #FFFFFF);
  color: var(--fft-text, #1A1C18);
  font-family: 'Inter', sans-serif;
  scroll-margin-top: 100px;
}

.recipe-comments h2 {
  font-family: 'Outfit', sans-serif;
}

.comments-link {
  color: var(--fft-primary, #32533C);
}

.comments-link:hover {
  color: var(--fft-primary-hover, #4A6B53);
}

.comment-entry {
  padding: 20px 0;
  border-top: 1px solid var(--fft-surface-high, #E8E9E2);
}

.comment-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment-button {
  --bs-btn-color: #FFFFFF;
  --bs-btn-bg: var(--fft-primary, #32533C);
  --bs-btn-border-color: var(--fft-primary, #32533C);

  --bs-btn-hover-color: #FFFFFF;
  --bs-btn-hover-bg: var(--fft-primary-hover, #4A6B53);
  --bs-btn-hover-border-color: var(--fft-primary-hover, #4A6B53);

  --bs-btn-active-color: #FFFFFF;
  --bs-btn-active-bg: var(--fft-primary-hover, #4A6B53);
  --bs-btn-active-border-color: var(--fft-primary-hover, #4A6B53);

  --bs-btn-disabled-color: #FFFFFF;
  --bs-btn-disabled-bg: var(--fft-primary, #32533C);
  --bs-btn-disabled-border-color: var(--fft-primary, #32533C);
}
</style>