
<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const displayName = computed(() => auth.user?.name || 'Guest')

const profileImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB3oG6XLP0L5HhXmr7nV_d_hl50ix4lGiZQ0kuDbP0XtRO1ipuH91kh8Yp7P_pTMQ7fcx3IaXa3zJgpBgg9G8tnEkxK9a4-fNTQ2PCs6G1-DmO1SyppBRpyQVNTPnihBYmU1wy97GDkuqG1mPpF4yuT5Fk3RjOeTAQ0_zSZ6jQP-g7-TSs1Er6zPZC9wADCJEnckhg_EdCUtQB46jPa0yb-JvKtvqoVsY-xFXz5i30'

const myRecipes = ref([])
const loadingRecipes = ref(false)
const recipeError = ref('')
const deletingRecipeId = ref(null)

// Retrieve recipes created by the logged-in user
async function fetchMyRecipes() {
  loadingRecipes.value = true
  recipeError.value = ''

  try {
    const response = await axios.get('/api/recipes/mine', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    myRecipes.value = response.data.data

  } catch (error) {
    console.error('Failed to retrieve my recipes:', error)

    recipeError.value =
      error.response?.data?.message ||
      'Failed to load your recipes.'

  } finally {
    loadingRecipes.value = false
  }
}

// Navigate to edit recipe page
function editRecipe(recipeId) {
  router.push(`/recipes/${recipeId}/edit`)
}

// Delete recipe
async function deleteRecipe(recipe) {
  const confirmed = window.confirm(
    'Are you sure you want to delete this recipe?'
  )

  if (!confirmed) return

  deletingRecipeId.value = recipe._id
  recipeError.value = ''

  try {
    await axios.delete(`/api/recipes/${recipe._id}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    // Remove deleted recipe from the displayed list
    myRecipes.value = myRecipes.value.filter(
      item => item._id !== recipe._id
    )

  } catch (error) {
    console.error('Failed to delete recipe:', error)

    recipeError.value =
      error.response?.data?.message ||
      'Failed to delete recipe.'

  } finally {
    deletingRecipeId.value = null
  }
}

function handleLogout() {
  auth.logout()
  router.push('/login')
}

onMounted(fetchMyRecipes)
</script>

<template>
  <div class="fft-page">
    <main class="profile-page">
      <div class="profile-container">

        <div class="profile-layout">

          <!-- Left: Profile Settings -->
          <section class="profile-card">

            <div class="profile-header">
              <img
                :src="profileImage"
                alt="User profile"
                class="profile-image"
              />

              <h1>{{ displayName }}</h1>
              <p class="text-muted">Manage your account</p>
            </div>

            <div class="profile-options">

              <RouterLink
                to="/preferences"
                class="profile-option"
              >
                <div class="option-icon">🥗</div>

                <div class="option-content">
                  <h2>Dietary Preferences</h2>
                  <p>
                    Manage your dietary preferences and food allergens.
                  </p>
                </div>

                <span class="option-arrow">›</span>
              </RouterLink>

              <RouterLink
                to="/change-password"
                class="profile-option"
              >
                <div class="option-icon">🔒</div>

                <div class="option-content">
                  <h2>Change Password</h2>
                  <p>
                    Update your account password.
                  </p>
                </div>

                <span class="option-arrow">›</span>
              </RouterLink>

            </div>

            <button
              type="button"
              class="profile-logout"
              @click="handleLogout"
            >
              Log Out
            </button>

          </section>

          <!-- Right: My Created Recipes -->
          <section class="recipes-card">

            <div class="recipes-header">
              <div>
                <h2>My Created Recipes</h2>
                <p>
                  Manage the recipes you have shared.
                </p>
              </div>

              <span class="recipe-count">
                {{ myRecipes.length }} recipes
              </span>
            </div>

            <div class="recipes-content">

              <!-- Loading -->
              <div
                v-if="loadingRecipes"
                class="empty-state"
              >
                Loading your recipes...
              </div>

              <!-- Error -->
              <div
                v-else-if="recipeError"
                class="alert alert-danger"
              >
                {{ recipeError }}
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger ms-2"
                  @click="fetchMyRecipes"
                >
                  Retry
                </button>
              </div>

              <!-- No recipes -->
              <div
                v-else-if="myRecipes.length === 0"
                class="empty-state"
              >
                <div class="empty-icon">🍽️</div>

                <h3>No recipes yet</h3>

                <p>
                  You haven't created any recipes.
                  Start sharing your favourite dishes!
                </p>

                <RouterLink
                  to="/recipes/create"
                  class="create-recipe-btn"
                >
                  + Create a Recipe
                </RouterLink>
              </div>

              <!-- Recipe list -->
              <div
                v-else
                class="recipe-list"
              >
                <div
                  v-for="recipe in myRecipes"
                  :key="recipe._id"
                  class="my-recipe-item"
                >

                  <img
                    :src="recipe.image"
                    :alt="recipe.title"
                    class="recipe-image"
                  />

                  <div class="recipe-info">
                    <h3>{{ recipe.title }}</h3>

                    <p class="recipe-cuisine">
                      {{ recipe.cuisine?.join(', ') || 'Other' }}
                    </p>

                    <div class="recipe-tags">
                      <span
                        v-for="diet in recipe.dietaryCategories || []"
                        :key="diet"
                        class="diet-tag"
                      >
                        {{ diet }}
                      </span>
                    </div>

                    <div class="recipe-actions">
                      <button
                        type="button"
                        class="edit-btn"
                        @click="editRecipe(recipe._id)"
                      >
                        <span>✏️</span> Edit
                      </button>

                      <button
                        type="button"
                        class="delete-btn"
                        :disabled="deletingRecipeId === recipe._id"
                        @click="deleteRecipe(recipe)"
                      >
                        <span>🗑️</span>
                        {{
                          deletingRecipeId === recipe._id
                            ? 'Deleting...'
                            : 'Delete'
                        }}
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>

          </section>

        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.profile-page {
  min-height: 70vh;
  padding: 48px 24px;
  background: #fafaf3;
  font-family: 'Inter', sans-serif;
}

.profile-container {
  max-width: 1150px;
  margin: 0 auto;
}

.profile-layout {
  display: grid;
  grid-template-columns: 0.85fr 1.5fr;
  gap: 28px;
  align-items: start;
}

/* Profile card */
.profile-card,
.recipes-card {
  padding: 30px;
  background: #fff;
  border: 1px solid #e8e9e2;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
}

.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-bottom: 28px;
}

.profile-image {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid #c7ecce;
  margin-bottom: 16px;
}

.profile-header h1 {
  margin: 0;
  color: #32533c;
  font-size: 26px;
  font-weight: 700;
}

.profile-header p {
  margin-top: 6px;
  font-size: 14px;
}

.profile-options {
  border-top: 1px solid #e8e9e2;
  border-bottom: 1px solid #e8e9e2;
}

.profile-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 6px;
  color: inherit;
  text-decoration: none;
  border-radius: 12px;
}

.profile-option:hover {
  background: #f4f4ed;
}

.option-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #e8f2e8;
  font-size: 22px;
}

.option-content {
  flex: 1;
}

.option-content h2 {
  margin: 0 0 5px;
  font-size: 15px;
  font-weight: 600;
  color: #32533c;
}

.option-content p {
  margin: 0;
  color: #727972;
  font-size: 12px;
  line-height: 1.5;
}

.option-arrow {
  color: #32533c;
  font-size: 25px;
}

.profile-logout {
  width: 100%;
  margin-top: 25px;
  padding: 13px 20px;
  border: 1px solid #dc2626;
  border-radius: 12px;
  background: #dc2626;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.profile-logout:hover {
  background: #b91c1c;
}

/* My created recipes */
.recipes-card {
  min-height: 400px;
}

.recipes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 22px;
  border-bottom: 1px solid #e8e9e2;
}

.recipes-header h2 {
  margin: 0;
  color: #32533c;
  font-size: 22px;
  font-weight: 700;
}

.recipes-header p {
  margin: 6px 0 0;
  color: #727972;
  font-size: 13px;
}

.recipe-count {
  padding: 6px 12px;
  background: #e8f2e8;
  color: #32533c;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.recipes-content {
  padding-top: 20px;
}

.recipe-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.my-recipe-item {
  display: flex;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid #e8e9e2;
}

.my-recipe-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.recipe-image {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: 12px;
  background: #f4f4ed;
}

.recipe-info {
  flex: 1;
  min-width: 0;
}

.recipe-info h3 {
  margin: 0 0 5px;
  color: #32533c;
  font-size: 17px;
  font-weight: 700;
}

.recipe-cuisine {
  margin: 0 0 8px;
  color: #727972;
  font-size: 12px;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}

.diet-tag {
  padding: 3px 9px;
  background: #e8f2e8;
  color: #32533c;
  border-radius: 20px;
  font-size: 10px;
}

.recipe-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.edit-btn,
.delete-btn {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.edit-btn {
  border: 1px solid #32533c;
  background: #32533c;
  color: white;
}

.edit-btn:hover {
  background: #4a6b53;
}

.delete-btn {
  border: 1px solid #dc2626;
  background: white;
  color: #dc2626;
}

.delete-btn:hover {
  background: #fef2f2;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Empty state */
.empty-state {
  padding: 55px 20px;
  text-align: center;
  color: #727972;
}

.empty-icon {
  font-size: 42px;
  margin-bottom: 12px;
}

.empty-state h3 {
  color: #32533c;
  font-size: 18px;
  font-weight: 700;
}

.empty-state p {
  font-size: 13px;
  line-height: 1.6;
}

.create-recipe-btn {
  display: inline-block;
  margin-top: 12px;
  padding: 10px 18px;
  background: #32533c;
  color: white;
  border-radius: 8px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

.create-recipe-btn:hover {
  background: #4a6b53;
  color: white;
}

@media (max-width: 768px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }

  .profile-page {
    padding: 28px 16px;
  }
}

@media (max-width: 480px) {
  .profile-card,
  .recipes-card {
    padding: 22px 18px;
  }

  .my-recipe-item {
    gap: 12px;
  }

  .recipe-image {
    width: 90px;
    height: 90px;
  }

  .recipes-header h2 {
    font-size: 19px;
  }
}
</style>
