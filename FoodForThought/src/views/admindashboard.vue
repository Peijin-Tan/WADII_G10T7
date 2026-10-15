<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const stats = ref({
  totalUsers: 0,
  totalRecipes: 0,
  totalCommunityPosts: 0,
  totalAdmins: 0,
  totalRegularUsers: 0
})

const posts = ref([])
const postsLoading = ref(true)
const postsError = ref('')
const deletingPostId = ref(null)
const loading = ref(true)
const error = ref('')

const regularUserShare = computed(() => {
  if (!stats.value.totalUsers) return 0
  return Math.round((stats.value.totalRegularUsers / stats.value.totalUsers) * 100)
})

const adminShare = computed(() => {
  if (!stats.value.totalUsers) return 0
  return Math.round((stats.value.totalAdmins / stats.value.totalUsers) * 100)
})

async function loadStats() {
  try {
    loading.value = true
    error.value = ''

    const response = await axios.get('http://localhost:8000/admin/stats', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })
    stats.value = response.data
  } catch (err) {
    console.error(err)
    error.value = err.response?.data?.message || 'Unable to load dashboard statistics.'
  } finally {
    loading.value = false
  }
}

async function loadPosts() {
  postsLoading.value = true
  postsError.value = ''

  try {
    const response = await axios.get('http://localhost:8000/posts')
    posts.value = response.data
  } catch (err) {
    console.error(err)
    postsError.value = 'Unable to load community posts for moderation.'
  } finally {
    postsLoading.value = false
  }
}

async function deletePost(postId) {
  if (!auth.token) {
    postsError.value = 'Admin login required to delete posts.'
    return
  }

  deletingPostId.value = postId

  try {
    await axios.delete(`http://localhost:8000/posts/${postId}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    posts.value = posts.value.filter(post => post._id !== postId)
    stats.value.totalCommunityPosts = Math.max(stats.value.totalCommunityPosts - 1, 0)
  } catch (err) {
    console.error(err)
    postsError.value = err.response?.data?.message || 'Unable to delete post.'
  } finally {
    deletingPostId.value = null
  }
}

onMounted(() => {
  loadStats()
  loadPosts()
})
</script>

<template>
  <div class="container py-5">
    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
      <div>
        <p class="text-uppercase text-muted mb-1 fw-semibold" style="letter-spacing: 0.08em; font-size: 0.76rem;">
          Overview
        </p>
        <h2 class="mb-0">Admin Dashboard</h2>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-success" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else class="row g-4">
      <div class="col-12 col-md-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <p class="text-muted mb-2">Total Users</p>
            <h3 class="fw-bold mb-0">{{ stats.totalUsers }}</h3>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <p class="text-muted mb-2">Total Recipes</p>
            <h3 class="fw-bold mb-0">{{ stats.totalRecipes }}</h3>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <p class="text-muted mb-2">Community Posts</p>
            <h3 class="fw-bold mb-0">{{ stats.totalCommunityPosts }}</h3>
          </div>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <p class="text-muted mb-2">Admin Accounts</p>
            <h3 class="fw-bold mb-0">{{ stats.totalAdmins }}</h3>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4 mt-1">
      <div class="col-12 col-lg-6">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <h5 class="card-title mb-3">User Breakdown</h5>

            <div class="mb-3">
              <div class="d-flex justify-content-between mb-1">
                <span>Regular Users</span>
                <strong>{{ stats.totalRegularUsers }}</strong>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar bg-success" :style="{ width: regularUserShare + '%' }"></div>
              </div>
            </div>

            <div>
              <div class="d-flex justify-content-between mb-1">
                <span>Admins</span>
                <strong>{{ stats.totalAdmins }}</strong>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar bg-primary" :style="{ width: adminShare + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-6">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body">
            <h5 class="card-title mb-3">Quick Summary</h5>

            <ul class="list-group list-group-flush">
              <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                <span>Total users</span>
                <strong>{{ stats.totalUsers }}</strong>
              </li>
              <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                <span>Total recipes</span>
                <strong>{{ stats.totalRecipes }}</strong>
              </li>
              <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                <span>Community posts</span>
                <strong>{{ stats.totalCommunityPosts }}</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm mt-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <h5 class="card-title mb-0">Post Moderation Queue</h5>
          <span class="badge bg-warning text-dark">{{ posts.length }} to review</span>
        </div>

        <p v-if="postsError" class="text-danger mb-3">{{ postsError }}</p>

        <div v-if="postsLoading" class="text-center py-3">
          <div class="spinner-border spinner-border-sm text-success" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <div v-else-if="posts.length === 0" class="text-muted">
          No community posts currently need moderation.
        </div>

        <div v-else class="list-group list-group-flush">
          <div v-for="post in posts" :key="post._id" class="list-group-item px-0">
            <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div>
                <div class="fw-semibold">{{ post.userId?.name || 'Unknown user' }}</div>
                <div class="text-muted small">{{ new Date(post.createdAt).toLocaleString() }}</div>
                <p class="mb-2 mt-2">{{ post.content }}</p>

                <div v-if="post.tags?.length" class="d-flex flex-wrap gap-2">
                  <span v-for="tag in post.tags" :key="tag" class="badge bg-success-subtle text-success-emphasis">
                    {{ tag }}
                  </span>
                </div>
              </div>

              <button
                class="btn btn-outline-danger btn-sm"
                :disabled="deletingPostId === post._id"
                @click="deletePost(post._id)"
              >
                {{ deletingPostId === post._id ? 'Deleting...' : 'Delete Post' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
