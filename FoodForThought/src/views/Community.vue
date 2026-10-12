<script setup>
import { ref, onMounted } from 'vue'

const posts = ref([])
const loading = ref(true)
const error = ref('')

async function loadPosts() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/posts')

    if (!response.ok) {
      throw new Error('Failed to retrieve posts')
    }

    posts.value = await response.json()
  } catch (err) {
    error.value = 'Unable to load posts. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(loadPosts)
</script>

<template>
  <div class="container mt-4">
    <h1>Community</h1>

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
          <p>{{ post.content }}</p>

          <img
            v-if="post.image"
            :src="post.image"
            alt="Shared meal"
            class="img-fluid mb-2"
          >

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
</template>