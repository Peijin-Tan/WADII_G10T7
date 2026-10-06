<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const showMainNav = computed(() => !['/login', '/register', '/home'].includes(route.path))
</script>

<template>
  <nav v-if="showMainNav" class="navbar navbar-expand-lg navbar-dark bg-success">
    <div class="container">

      <RouterLink
        to="/home"
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
