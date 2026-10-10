<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const handleSubmit = () => {
  router.push('/dashboard')
}
</script>

<template>
  <div class="container mt-5">
    <div class="col-12 mt-5">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Login</h5>
          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label for="loginEmail" class="form-label">Email address</label>
              <input type="email" class="form-control" id="loginEmail" required>
            </div>
            <div class="mb-3">
              <label for="loginPassword" class="form-label">Password</label>
              <input type="password" class="form-control" id="loginPassword" required>
            </div>
            <button type="submit" class="btn btn-primary">Login</button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>