import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Pantry from '../views/Pantry.vue'
import Recipes from '../views/Recipes.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/home'
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
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../components/Auth/login.vue')
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../components/Auth/register.vue')
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../components/Auth/home.vue')
    }
  ],
})

export default router
