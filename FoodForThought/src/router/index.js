import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Dashboard from '../views/Dashboard.vue'
import Pantry from '../views/Pantry.vue'
import Recipes from '../views/Recipes.vue'
import RecipeDetail from '../views/RecipeDetail.vue'
import NotFound from '../components/Error/NotFound.vue'

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
      component: Dashboard,
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      redirect: '/admindashboard'
    },
    {
      // Admin-only page: the beforeEach guard below checks meta.requiresAdmin
      path: '/admindashboard',
      name: 'admindashboard',
      component: () => import('../views/admindashboard.vue'),
      meta: { requiresAdmin: true }
    },
    {
      path: '/pantry',
      name: 'pantry',
      component: Pantry,
      meta: { requiresAuth: true }
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/Profile.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('../views/ChangePassword.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/recipes',
      name: 'recipes',
      component: Recipes
    },
    {
      path: '/recipes/:id',
      name: 'recipe-detail',
      component: RecipeDetail
    },
    {
      // Edit a recipe: its author or an admin (EditRecipe.vue checks, and so does PUT /recipes/:id)
      path: '/recipes/:id/edit',
      name: 'edit-recipe',
      component: () => import('../views/EditRecipe.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/recipes/create',
      component: () => import('../views/CreateRecipe.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/preferences',
      name: 'dietary-preferences',
      component: () => import('../views/DietaryPreferences.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/planner',
      name: 'planner',
      component: () => import('../views/Planner.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/shoppinglist',
      name: 'shoppinglist',
      component: () => import('../views/ShoppingList.vue'),
      meta: { requiresAuth: true }
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
    },
    {
      path: '/community',
      name: 'community',
      component: () => import('../views/Community.vue')
    },
    {
      // Catch-all: any unknown URL shows the NotFound page
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound
    }
  ],
})

// Returning a path redirects there; returning nothing lets the navigation continue.
router.beforeEach((to) => {
  const auth = useAuthStore()

  // Pages that only make sense when logged in (meta.requiresAuth): guests go to the login page
  // (?redirect= brings them back here after logging in)
  if (to.meta.requiresAuth && !auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin) {
    if (!auth.user) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (auth.user.role !== 'admin') {
      return '/home'
    }
  }
})

export default router
