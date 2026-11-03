<script setup>
/* Create Recipe (/recipes/create, logged-in users only).
   The form itself is components/RecipeForm.vue (shared with Edit Recipe); this page saves it with POST /recipes.
   Opened from the planner's Add Meal modal as /recipes/create?from=planner, Save and Cancel go back to the planner. */
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import RecipeForm from '@/components/RecipeForm.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const fromPlanner = route.query.from === 'planner'
const backTo = fromPlanner ? '/planner' : '/recipes'

const saving = ref(false)
const error = ref('')

async function createRecipe(recipeData) {
  saving.value = true
  error.value = ''
  try {
    await axios.post('/api/recipes', recipeData, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    await router.push(backTo)
  } catch (err) {
    console.error(err)
    error.value = err.response?.data?.message || 'Failed to create recipe. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="fp">
    <div class="fp-wrap rf-wrap">
      <RouterLink :to="backTo" class="fp-back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {{ fromPlanner ? 'Weekly plan' : 'Recipes' }}
      </RouterLink>

      <header class="fp-head">
        <p class="fp-eyebrow">Community recipe</p>
        <h1 class="fp-title">Create a Recipe</h1>
        <p class="fp-lede">
          Share a dish you make at home. Once it's saved, everyone can find it on Recipes and add it to their
          weekly plan.
        </p>
      </header>

      <RecipeForm
        submit-label="Create Recipe"
        :saving="saving"
        :error="error"
        :cancel-to="backTo"
        @submit="createRecipe"
        @dismiss-error="error = ''"
      />
    </div>
  </main>
</template>

<style scoped>
.rf-wrap {
  width: min(1100px, 100% - 32px);
}
</style>
