<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-success">
    <div class="container">

      <RouterLink
        to="/dashboard"
        class="navbar-brand"
      >
        🌱 FoodForThought
      </RouterLink>

      <div class="navbar-nav">

        <RouterLink
          to="/dashboard"
          class="nav-link"
        >
          Dashboard
        </RouterLink>

        <RouterLink
          to="/pantry"
          class="nav-link"
        >
          Pantry
        </RouterLink>

        <RouterLink
          to="/recipes"
          class="nav-link"
        >
          Recipes
        </RouterLink>

      </div>

    </div>
  </nav>

  <RouterView />
</template>

<style scoped>
h1 {
  font-weight: bold;
}
.navbar-nav {
  display: flex;
  flex-direction: row;
  gap: 24px;
}
</style>
