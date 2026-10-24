<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const stats = ref({
  totalUsers: 0,
  totalRecipes: 0,
  totalComments: 0,
  totalAdmins: 0,
  totalRegularUsers: 0
})

const comments = ref([])
const users = ref([])
const commentsLoading = ref(true)
const commentsError = ref('')
const usersLoading = ref(false)
const usersError = ref('')
const showUsers = ref(false)
const deletingCommentId = ref(null)
const deletingUserId = ref(null)
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
  if (!auth.token) {
    error.value = 'Admin login required to view dashboard statistics.'
    loading.value = false
    return
  }

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

async function loadComments() {
  commentsLoading.value = true
  commentsError.value = ''

  try {
    const response = await axios.get('http://localhost:8000/comments')
    comments.value = response.data
  } catch (err) {
    console.error(err)
    commentsError.value = 'Unable to load comments for moderation.'
  } finally {
    commentsLoading.value = false
  }
}

async function loadUsers() {
  if (!auth.token) {
    usersError.value = 'Admin login required to view users.'
    return
  }

  usersLoading.value = true
  usersError.value = ''
  showUsers.value = true

  try {
    const response = await axios.get('http://localhost:8000/users', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    users.value = response.data
  } catch (err) {
    console.error(err)
    usersError.value = err.response?.data?.message || 'Unable to load users.'
  } finally {
    usersLoading.value = false
  }
}

async function deleteUser(userId) {
  if (!auth.token) {
    usersError.value = 'Admin login required to delete users.'
    return
  }

  const userToDelete = users.value.find(user => user._id === userId)
  if (!userToDelete) return

  if (userToDelete._id === auth.user?._id) {
    usersError.value = 'You cannot delete your own admin account.'
    return
  }

  if (!confirm(`Delete ${userToDelete.name || userToDelete.email}?`)) return

  deletingUserId.value = userId

  try {
    await axios.delete(`http://localhost:8000/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    users.value = users.value.filter(user => user._id !== userId)

    if (stats.value?.totalUsers) {
      stats.value.totalUsers = Math.max(stats.value.totalUsers - 1, 0)
    }

    if (stats.value?.totalRegularUsers && userToDelete.role === 'user') {
      stats.value.totalRegularUsers = Math.max(stats.value.totalRegularUsers - 1, 0)
    }

    if (stats.value?.totalAdmins && userToDelete.role === 'admin') {
      stats.value.totalAdmins = Math.max(stats.value.totalAdmins - 1, 0)
    }
  } catch (err) {
    console.error(err)
    usersError.value = err.response?.data?.message || 'Unable to delete user.'
  } finally {
    deletingUserId.value = null
  }
}

async function deleteComment(commentId) {
  if (!auth.token) {
    commentsError.value = 'Admin login required to delete comments.'
    return
  }

  if (!confirm('Are you sure you want to delete this comment?')) return

  deletingCommentId.value = commentId

  try {
    await axios.delete(`http://localhost:8000/comments/${commentId}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    comments.value = comments.value.filter(comment => comment._id !== commentId)

    if (stats.value?.totalComments) {
      stats.value.totalComments = Math.max(stats.value.totalComments - 1, 0)
    }
  } catch (err) {
    console.error(err)
    commentsError.value = err.response?.data?.message || 'Unable to delete comment.'
  } finally {
    deletingCommentId.value = null
  }
}

onMounted(() => {
  loadStats()
  loadComments()
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
        <div class="card border-0 shadow-sm h-100 cursor-pointer" @click="loadUsers()" role="button" tabindex="0" @keydown.enter.prevent="loadUsers()" @keydown.space.prevent="loadUsers()" style="cursor: pointer;">
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
            <p class="text-muted mb-2">Comments</p>
            <h3 class="fw-bold mb-0">{{ stats.totalComments }}</h3>
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

    <div v-if="showUsers" class="card border-0 shadow-sm mt-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <h5 class="card-title mb-0">User List</h5>
          <button class="btn btn-sm btn-outline-secondary" @click="showUsers = false">Hide list</button>
        </div>

        <p v-if="usersError" class="text-danger mb-3">{{ usersError }}</p>

        <div v-if="usersLoading" class="text-center py-3">
          <div class="spinner-border spinner-border-sm text-success" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <div v-else-if="users.length === 0" class="text-muted">No users found.</div>

        <div v-else class="list-group list-group-flush">
          <div v-for="user in users" :key="user._id" class="list-group-item px-0">
            <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
              <div>
                <div class="fw-semibold">{{ user.name }}</div>
                <div class="text-muted small">{{ user.email }}</div>
                <span class="badge mt-2" :class="user.role === 'admin' ? 'bg-primary' : 'bg-success-subtle text-success-emphasis'">
                  {{ user.role === 'admin' ? 'Admin' : 'User' }}
                </span>
              </div>

              <button
                class="btn btn-outline-danger btn-sm"
                :disabled="deletingUserId === user._id || user._id === auth.user?._id"
                @click="deleteUser(user._id)"
              >
                {{ deletingUserId === user._id ? 'Deleting...' : user._id === auth.user?._id ? 'Current Admin' : 'Delete User' }}
              </button>
            </div>
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
                <span>Total comments</span>
                <strong>{{ stats.totalComments }}</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="card border-0 shadow-sm mt-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <h5 class="card-title mb-0">Current Comments</h5>
          <span class="badge bg-success-subtle text-success-emphasis">{{ comments.length }} active</span>
        </div>

        <p v-if="commentsError" class="text-danger mb-3">{{ commentsError }}</p>

        <div v-if="commentsLoading" class="text-center py-3">
          <div class="spinner-border spinner-border-sm text-success" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <div v-else-if="comments.length === 0" class="text-muted">
          No comments currently available.
        </div>

        <div v-else class="list-group list-group-flush">
          <div v-for="comment in comments" :key="comment._id" class="list-group-item px-0">
            <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div>
                <div class="fw-semibold">{{ comment.userName || comment.userId?.name || 'Unknown user' }}</div>
                <div class="text-muted small">{{ new Date(comment.createdAt).toLocaleString() }}</div>
                <div class="text-muted small mt-1">Recipe: {{ comment.recipeName || comment.recipeId?.title || 'Unknown recipe' }}</div>
                <p class="mb-2 mt-2">{{ comment.content }}</p>
              </div>

              <button
                class="btn btn-outline-danger btn-sm"
                :disabled="deletingCommentId === comment._id"
                @click="deleteComment(comment._id)"
              >
                {{ deletingCommentId === comment._id ? 'Deleting...' : 'Delete Comment' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
