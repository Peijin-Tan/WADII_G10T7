<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

// Community feed
const posts = ref([])
const loading = ref(true)
const error = ref('')

// Create-post form
const content = ref('')
const image = ref('')
const tagsText = ref('')
const submitting = ref(false)
const postError = ref('')
const success = ref('')

// Retrieve posts from the backend
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

// Send a new post to the backend
async function createPost() {
  if (submitting.value) return

  postError.value = ''
  success.value = ''

  if (!auth.token) {
    postError.value = 'Please log in before posting.'
    return
  }

  if (content.value.trim() === '') {
    postError.value = 'Please enter some content.'
    return
  }

  // Convert comma-separated text into an array
  const tags = []

  for (const value of tagsText.value.split(',')) {
    const tag = value.trim().toLowerCase()

    if (tag !== '' && !tags.includes(tag)) {
      tags.push(tag)
    }
  }

  const data = {
    content: content.value.trim(),
    image: image.value.trim(),
    recipeId: null,
    tags: tags
  }

  submitting.value = true

  try {
    await axios.post('/posts', data, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    // Clear the form after successful creation
    content.value = ''
    image.value = ''
    tagsText.value = ''
    success.value = 'Your post was created!'

    // Retrieve the updated feed
    await loadPosts()
  } catch (err) {
    postError.value =
      err.response?.data?.message || 'Unable to create your post.'
  } finally {
    submitting.value = false
  }
}

onMounted(loadPosts)
</script>

<template>
  <div class="container mt-4">
    <h1>Community</h1>

    <!-- Create-post form -->
    <div v-if="auth.user" class="card mb-4">
      <div class="card-body">
        <h5>Create a post</h5>
        <p>Posting as {{ auth.user.name }}</p>

        <form @submit.prevent="createPost">
          <div class="mb-3">
            <label for="postContent" class="form-label">
              Share your meal
            </label>

            <textarea
              id="postContent"
              v-model="content"
              class="form-control"
              rows="4"
              maxlength="2000"
              placeholder="What did you cook today?"
              required
            ></textarea>
          </div>

          <div class="mb-3">
            <label for="postImage" class="form-label">
              Image URL or path (optional)
            </label>

            <input
              id="postImage"
              v-model="image"
              type="text"
              class="form-control"
              placeholder="/img/chicken-rice.jpg"
            >
          </div>

          <div class="mb-3">
            <label for="postTags" class="form-label">
              Tags (optional, separated by commas)
            </label>

            <input
              id="postTags"
              v-model="tagsText"
              type="text"
              class="form-control"
              placeholder="home-cooked, high-protein"
            >
          </div>

          <p v-if="postError" class="text-danger" role="alert">
            {{ postError }}
          </p>

          <p v-if="success" class="text-success" role="status">
            {{ success }}
          </p>

          <button
            type="submit"
            class="btn btn-success"
            :disabled="submitting"
          >
            {{ submitting ? 'Posting...' : 'Create Post' }}
          </button>
        </form>
      </div>
    </div>

    <p v-else>
      <RouterLink to="/login">Log in</RouterLink>
      to share a post.
    </p>

    <!-- Community feed -->
    <p v-if="loading">Loading posts...</p>

    <div v-else-if="error">
      <p class="text-danger">{{ error }}</p>
      <button class="btn btn-primary" @click="loadPosts">
        Try again
      </button>
    </div>

    <p v-else-if="posts.length === 0">No posts yet.</p>

    <div v-else>
      <div
        v-for="post in posts"
        :key="post._id"
        class="card mb-3"
      >
        <div class="card-body">
          <h5 class="card-title">
            {{ post.userId?.name || 'Unknown user' }}
          </h5>

          <p class="text-muted small">
            {{ new Date(post.createdAt).toLocaleString() }}
          </p>

          <p class="post-content">{{ post.content }}</p>

          <img
            v-if="post.image"
            :src="post.image"
            alt="Shared meal"
            class="img-fluid mb-2"
          >

          <div>
            <span
              v-for="tag in post.tags"
              :key="tag"
              class="badge bg-success me-2"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.post-content {
  white-space: pre-wrap;
}
</style>