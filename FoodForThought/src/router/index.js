import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Pantry from '../views/Pantry.vue'
import Recipes from '../views/Recipes.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard'
    },

    {
      path: '/dashboard',
      name: 'dashboard',
      component: Dashboard
    },

    {
      path: '/pantry',
      name: 'pantry',
      component: Pantry
    },

    {
      path: '/recipes',
      name: 'recipes',
      component: Recipes
    }
  ],
})

export default router
