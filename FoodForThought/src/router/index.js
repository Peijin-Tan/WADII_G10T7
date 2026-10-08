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
      name: 'Dashboard',
      component: Dashboard
    },

    {
      path: '/pantry',
      name: 'Pantry',
      component: Pantry
    },

    {
      path: '/recipes',
      name: 'Recipes',
      component: Recipes
    },
    {
      path: '/admin',
      name: 'Admin',
      component: () => import('../views/Admin.vue')
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('../components/Auth/login.vue')
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('../components/Auth/register.vue')
    },
    {
      path: '/home',
      name: 'Home',
      component: () => import('../components/Auth/home.vue')
    }
  ],
})

// simple route guard: block dashboard unless logged in, and protect admin by role
router.beforeEach((to, from, next) => {
  const userRaw = localStorage.getItem('user')
  const user = userRaw ? JSON.parse(userRaw) : null

  if (to.path === '/dashboard' && !user) return next('/login')
  if (to.path === '/admin' && (!user || user.role !== 'admin')) return next('/home')
  next()
})

export default router
