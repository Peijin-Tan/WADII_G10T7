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
      component: Dashboard
    },
    {
      path: '/admin',
      redirect: '/admindashboard'
    },
    {
      path: '/admindashboard',
      name: 'admindashboard',
      component: () => import('../views/admindashboard.vue'),
      meta: { requiresAdmin: true }
    },
    {
      path: '/pantry',
      name: 'pantry',
      component: Pantry
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/Profile.vue')
    },
    {
      path: '/recipes',
      name: 'recipes',
      component: Recipes,
      meta: { public: true }
    },
    {
      path: '/recipes/:id/edit',
      name: 'edit-recipe',
      component: () => import('../views/EditRecipe.vue')
    },
    {
      path: '/recipes/create',
      component: () => import('../views/CreateRecipe.vue')
    },
    {
      path: '/recipes/:id',
      name: 'recipe-detail',
      component: RecipeDetail,
      meta: { public: true }
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('../views/ChangePassword.vue')
    },
    {
      path: '/preferences',
      name: 'dietary-preferences',
      component: () => import('../views/DietaryPreferences.vue')
    },
    {
      path: '/planner',
      name: 'planner',
      component: () => import('../views/Planner.vue')
    },
    {
      path: '/shoppinglist',
      name: 'shoppinglist',
      component: () => import('../views/ShoppingList.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../components/Auth/login.vue'),
      meta: { public: true, guestOnly: true }
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../components/Auth/register.vue'),
      meta: { public: true, guestOnly: true }
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../components/Auth/home.vue'),
      meta: { public: true }
    },
    {
      path: '/community',
      name: 'community',
      component: () => import('../views/Community.vue')
    },
    {
      path: '/community/post/:id',
      name: 'community-recipe',
      component: () => import('@/views/CommunityRecipe.vue'),
      meta: { public: true }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
      meta: { public: true }
    }
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (auth.token && tokenExpired(auth.token)) auth.logout()
  const loggedIn = Boolean(auth.token)

  if (!to.meta.public && !loggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && loggedIn) {
    return auth.user?.role === 'admin' ? '/admindashboard' : '/dashboard'
  }

  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return '/home'
  }
})

function tokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export default router