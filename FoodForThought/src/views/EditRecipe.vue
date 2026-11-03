<script setup>
/* Edit Recipe (/recipes/:id/edit, logged-in users only).
   Opened from "My recipes" on the Recipes page, or the Edit button on a recipe you own.
   Its author or an admin can edit; PUT /recipes/:id checks this again on the server.
   The form is components/RecipeForm.vue (shared with Create Recipe). */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import RecipeForm from '@/components/RecipeForm.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const confirm = useConfirm()

const recipeId = route.params.id
const backTo = `/recipes/${recipeId}`
const headers = () => ({ Authorization: `Bearer ${auth.token}` })

const recipe = ref(null)
const loading = ref(true)
const loadError = ref('') // can't edit at all (not found / not yours)
const saving = ref(false)
const saveError = ref('')
const deleting = ref(false)

const isAdmin = computed(() => auth.user?.role === 'admin')
const isOwner = computed(() => String(recipe.value?.createdBy?._id || recipe.value?.createdBy || '') === String(auth.user?._id || ''))

async function fetchRecipe() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await axios.get(`/api/recipes/${recipeId}`)
    const data = response.data.data
    if (data.source === 'spoonacular') {
      loadError.value = 'Recipes saved from Spoonacular can\'t be edited.'
    } else {
      recipe.value = data
      if (!isOwner.value && !isAdmin.value) loadError.value = 'You can only edit recipes you created.'
    }
  } catch (err) {
    console.error(err)
    loadError.value = err.response?.status === 404 ? 'This recipe no longer exists.' : 'Failed to load the recipe. Please try again.'
  } finally {
    loading.value = false
  }
}

async function updateRecipe(recipeData) {
  saving.value = true
  saveError.value = ''
  try {
    await axios.put(`/api/recipes/${recipeId}`, recipeData, { headers: headers() })
    await router.push(backTo)
  } catch (err) {
    console.error(err)
    saveError.value = err.response?.data?.message || 'Failed to update recipe. Please try again.'
  } finally {
    saving.value = false
  }
}

async function deleteRecipe() {
  const ok = await confirm({
    title: `Delete "${recipe.value.title}"?`,
    message: "Its comments and likes are deleted too. Anyone who planned it will see \"Recipe no longer available\" in their planner. This can't be undone.",
    confirmText: 'Delete recipe',
  })
  if (!ok) return
  deleting.value = true
  saveError.value = ''
  try {
    await axios.delete(`/api/recipes/${recipeId}`, { headers: headers() })
    await router.push('/recipes')
  } catch (err) {
    console.error(err)
    saveError.value = err.response?.data?.message || 'Failed to delete recipe.'
  } finally {
    deleting.value = false
  }
}

onMounted(fetchRecipe)
</script>

<template>
  <main class="fp">
    <div class="fp-wrap rf-wrap">
      <RouterLink :to="loadError ? '/recipes' : backTo" class="fp-back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {{ loadError ? 'Recipes' : 'Back to recipe' }}
      </RouterLink>

      <div v-if="loading" class="fp-card fp-loading" role="status">
        <span class="fp-spinner" aria-hidden="true"></span>
        Loading recipe...
      </div>

      <div v-else-if="loadError" class="fp-card er-blocked" role="alert">
        <span class="fp-bubble fp-bubble--peach" aria-hidden="true"><span class="material-symbols-outlined">lock</span></span>
        <div>
          <h1 class="er-blocked-title">{{ loadError }}</h1>
          <p class="m-0">You can still view it, or create your own version.</p>
          <div class="fp-actions mt-3">
            <RouterLink v-if="recipe" :to="backTo" class="fp-btn fp-btn--ghost">View recipe</RouterLink>
            <RouterLink to="/recipes/create" class="fp-btn fp-btn--primary">Create a recipe</RouterLink>
          </div>
        </div>
      </div>

      <template v-else>
        <header class="fp-head">
          <p class="fp-eyebrow">{{ isOwner ? 'Your recipe' : 'Editing as admin' }}</p>
          <h1 class="fp-title">Edit recipe</h1>
          <p class="fp-lede">Changes show for everyone straight away, including in meal plans that use it.</p>
        </header>

        <RecipeForm
          :initial="recipe"
          submit-label="Save changes"
          :saving="saving"
          :error="saveError"
          :cancel-to="backTo"
          @submit="updateRecipe"
          @dismiss-error="saveError = ''"
        />

        <section class="fp-card er-danger" aria-labelledby="er-danger-title">
          <div>
            <h2 id="er-danger-title">Delete this recipe</h2>
            <p>Removes it for everyone, with its comments and likes.</p>
          </div>
          <button type="button" class="fp-btn fp-btn--danger" :disabled="deleting" @click="deleteRecipe">
            <span class="material-symbols-outlined" aria-hidden="true">delete</span>
            {{ deleting ? 'Deleting...' : 'Delete recipe' }}
          </button>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.rf-wrap {
  width: min(1100px, 100% - 32px);
}
.er-blocked {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.er-blocked-title {
  margin: 0 0 4px;
  font: 600 22px/30px 'Outfit', sans-serif;
}
.er-danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 40px;
  border-color: #f2c4c0;
}
.er-danger h2 {
  margin: 0;
  font: 600 18px/26px 'Outfit', sans-serif;
}
.er-danger p {
  margin: 2px 0 0;
  color: var(--fp-muted);
  font-size: 14px;
}
@media (min-width: 992px) {
  .er-danger {
    max-width: calc(100% - 344px); /* line up with the form column, not under the preview */
  }
}
</style>
