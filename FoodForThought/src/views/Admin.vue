<template>
  <div class="container mt-5">
    <h1>Admin Area</h1>
    <p>Only users with role <strong>admin</strong> can see this.</p>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
onMounted(() => {})
</script>

<style scoped>
h1 { color: #111 }
</style>
