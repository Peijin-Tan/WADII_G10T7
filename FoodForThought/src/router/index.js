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
      // Admin-only page: the beforeEach guard below checks meta.requiresAdmin
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
      path: '/recipes/create',
      component: () => import('../views/CreateRecipe.vue')
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
      path: '/community/post/:id',
      name: 'community-recipe',
      component: () => import('@/views/CommunityRecipe.vue')
    },
    {
      // Catch-all: any unknown URL shows the NotFound page
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound
    }
  ],
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()

  if (to.meta.requiresAdmin) {
    if (!auth.user) {
      return next('/login')
    }

    if (auth.user.role !== 'admin') {
      return next('/home')
    }
  }

  next()
})

export default router