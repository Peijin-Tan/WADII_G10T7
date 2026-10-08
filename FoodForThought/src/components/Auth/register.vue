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
          <h5 class="card-title">Register</h5>
          <form @submit.prevent="handleSubmit">
            <div class="mb-3">
              <label for="registerEmail" class="form-label">Email address</label>
              <input type="email" class="form-control" id="registerEmail" aria-describedby="emailHelp" required>
              <div id="emailHelp" class="form-text">We'll never share your email with anyone else.</div>
            </div>
            <div class="mb-3">
              <label for="registerPassword" class="form-label">Password</label>
              <input type="password" class="form-control" id="registerPassword" required>
            </div>
            <div class="mb-3 form-check">
              <input type="checkbox" class="form-check-input" id="exampleCheck1">
              <label class="form-check-label" for="exampleCheck1">Click if you're human</label>
            </div>
            <button type="submit" class="btn btn-primary">Register</button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>