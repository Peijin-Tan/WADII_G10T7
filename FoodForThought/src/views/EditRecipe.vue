
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { API_URL } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const recipeId = route.params.id

const title = ref('')
const image = ref('')
const imagePreview = ref('')
const summary = ref('')
const cuisine = ref('Chinese')
const servings = ref(2)
const prepTime = ref(10)
const cookingTime = ref(15)

const ingredients = ref([])
const instructions = ref([])

const dietaryOptions = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Pescatarian',
  'Keto'
]

const dietaryCategories = ref([])

const allergenOptions = [
  'Peanuts',
  'Tree Nuts',
  'Milk',
  'Eggs',
  'Soy',
  'Wheat',
  'Fish',
  'Shellfish',
  'Sesame'
]

const allergens = ref([])

const nutritionOptions = [
  { name: 'Calories', unit: 'kcal' },
  { name: 'Protein', unit: 'g' },
  { name: 'Carbohydrates', unit: 'g' },
  { name: 'Fat', unit: 'g' },
  { name: 'Saturated Fat', unit: 'g' },
  { name: 'Fiber', unit: 'g' },
  { name: 'Sugar', unit: 'g' },
  { name: 'Sodium', unit: 'mg' }
]

const nutrition = ref([])

const loading = ref(false)
const loadingRecipe = ref(true)
const imageUploading = ref(false)
const error = ref('')
const success = ref('')

// Retrieve existing recipe
async function fetchRecipe() {
  loadingRecipe.value = true
  error.value = ''

  try {
    const response = await axios.get(`${API_URL}/recipes/${recipeId}`)
    const recipe = response.data.data

    // Check that the logged-in user owns this recipe
    if (
      !auth.user ||
      String(recipe.createdBy?._id || recipe.createdBy) !==
        String(auth.user._id || auth.user.id)
    ) {
      error.value = 'You do not have permission to edit this recipe.'
      return
    }

    title.value = recipe.title || ''
    image.value = recipe.image || ''
    imagePreview.value = recipe.image || ''
    summary.value = recipe.summary || ''
    cuisine.value = recipe.cuisine?.[0] || 'Chinese'

    servings.value = recipe.servings || 2
    prepTime.value = recipe.prepTime ?? 0
    cookingTime.value = recipe.cookingTime ?? 0

    ingredients.value = (recipe.ingredients || []).map(item => ({
      name: item.name,
      amount: item.amount,
      unit: item.unit
    }))

    instructions.value = (recipe.instructions || [])
      .sort((a, b) => a.step - b.step)
      .map(item => item.description)

    dietaryCategories.value = recipe.dietaryCategories || []
    allergens.value = recipe.allergens || []

    nutrition.value = nutritionOptions.map(option => {
      const existing = (recipe.nutrition || []).find(
        item => item.name === option.name
      )

      return {
        name: option.name,
        amount: existing ? existing.amount : '',
        unit: option.unit
      }
    })

    if (ingredients.value.length === 0) {
      ingredients.value.push({ name: '', amount: 1, unit: 'g' })
    }

    if (instructions.value.length === 0) {
      instructions.value.push('')
    }

  } catch (err) {
    console.error(err)
    error.value =
      err.response?.data?.message ||
      'Failed to retrieve recipe.'
  } finally {
    loadingRecipe.value = false
  }
}

// Upload replacement image
async function uploadImage(event) {
  const file = event.target.files[0]

  if (!file) return

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ]

  if (!allowedTypes.includes(file.type)) {
    error.value = 'Please upload a JPG, PNG or WebP image.'
    event.target.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    error.value = 'Image size must not exceed 5MB.'
    event.target.value = ''
    return
  }

  error.value = ''
  imageUploading.value = true

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await axios.post(
      `${API_URL}/recipes/upload-image`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      }
    )

    image.value = response.data.imageUrl
    imagePreview.value = URL.createObjectURL(file)

  } catch (err) {
    console.error(err)
    error.value =
      err.response?.data?.message ||
      'Failed to upload image.'

  } finally {
    imageUploading.value = false
  }
}

function addIngredient() {
  ingredients.value.push({
    name: '',
    amount: 1,
    unit: 'g'
  })
}

function removeIngredient(index) {
  ingredients.value.splice(index, 1)
}

function addInstruction() {
  instructions.value.push('')
}

function removeInstruction(index) {
  instructions.value.splice(index, 1)
}

// Save updated recipe
async function updateRecipe() {
  loading.value = true
  error.value = ''
  success.value = ''

  try {
    if (!image.value) {
      error.value = 'Please upload a recipe photo.'
      return
    }

    const recipeData = {
      title: title.value.trim(),
      image: image.value,
      summary: summary.value.trim(),
      cuisine: [cuisine.value.trim()],
      dietaryCategories: dietaryCategories.value,

      servings: Number(servings.value),
      prepTime: Number(prepTime.value),
      cookingTime: Number(cookingTime.value),
      totalTime:
        Number(prepTime.value) + Number(cookingTime.value),

      ingredients: ingredients.value.map(item => ({
        name: item.name.trim(),
        amount: Number(item.amount),
        unit: item.unit.trim()
      })),

      instructions: instructions.value.map(
        (description, index) => ({
          step: index + 1,
          description: description.trim()
        })
      ),

      nutrition: nutrition.value
        .filter(item => item.amount !== '' && item.amount !== null)
        .map(item => ({
          name: item.name,
          amount: Number(item.amount),
          unit: item.unit
        })),

      allergens: allergens.value
    }

    await axios.put(
      `${API_URL}/recipes/${recipeId}`,
      recipeData,
      {
        headers: {
          Authorization: `Bearer ${auth.token}`
        }
      }
    )

    success.value = 'Recipe updated successfully!'

    await router.push(`/recipes/${recipeId}`)

  } catch (err) {
    console.error(err)

    error.value =
      err.response?.data?.message ||
      'Failed to update recipe. Please try again.'

  } finally {
    loading.value = false
  }
}

onMounted(fetchRecipe)
</script>

<template>
  <div class="fft-page">
    <div class="container mt-5 mb-5" style="max-width: 800px">

      <div v-if="loadingRecipe" class="text-center py-5">
        Loading recipe...
      </div>

      <div v-else-if="error && !title" class="alert alert-danger">
        {{ error }}
        <div class="mt-3">
          <button
            type="button"
            class="btn btn-secondary"
            @click="router.push('/profile')"
          >
            Back to Profile
          </button>
        </div>
      </div>

      <template v-else>
        <h1>Edit Recipe</h1>
        <p class="text-muted">
          Update your recipe details below.
        </p>

        <form @submit.prevent="updateRecipe">

          <!-- Recipe title -->
          <div class="mb-3">
            <label class="form-label">Recipe title</label>
            <input
              v-model="title"
              class="form-control"
              required
              maxlength="150"
              placeholder="Recipe title"
            />
          </div>

          <!-- Recipe image -->
          <div class="mb-3">
            <label class="form-label">Recipe Photo</label>

            <input
              type="file"
              class="form-control"
              accept="image/jpeg,image/png,image/webp"
              @change="uploadImage"
              :disabled="imageUploading"
            />

            <small class="text-muted">
              Upload a new photo to replace the current one.
              JPG, PNG or WebP. Maximum 5MB.
            </small>

            <div v-if="imagePreview" class="mt-3">
              <img
                :src="imagePreview"
                alt="Recipe preview"
                style="
                  width: 100%;
                  max-width: 300px;
                  height: 200px;
                  object-fit: cover;
                  border-radius: 12px;
                "
              />
            </div>

            <p
              v-if="imageUploading"
              class="text-muted mt-2"
            >
              Uploading image...
            </p>
          </div>

          <!-- Description -->
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea
              v-model="summary"
              class="form-control"
              required
              rows="3"
              placeholder="Describe your recipe..."
            ></textarea>
          </div>

          <!-- Cuisine -->
          <div class="mb-3">
            <label class="form-label">Cuisine</label>
            <select v-model="cuisine" class="form-select" required>
              <option>Chinese</option>
              <option>Japanese</option>
              <option>Korean</option>
              <option>Italian</option>
              <option>Western</option>
              <option>Indian</option>
              <option>Malaysian</option>
              <option>Thai</option>
              <option>Other</option>
            </select>
          </div>

          <!-- Servings and time -->
          <div class="row">
            <div class="col-md-4 mb-3">
              <label class="form-label">Servings</label>
              <input
                v-model.number="servings"
                type="number"
                min="1"
                class="form-control"
                required
              />
            </div>

            <div class="col-md-4 mb-3">
              <label class="form-label">Prep time (min)</label>
              <input
                v-model.number="prepTime"
                type="number"
                min="0"
                class="form-control"
                required
              />
            </div>

            <div class="col-md-4 mb-3">
              <label class="form-label">Cooking time (min)</label>
              <input
                v-model.number="cookingTime"
                type="number"
                min="0"
                class="form-control"
                required
              />
            </div>
          </div>

          <hr />

          <!-- Ingredients -->
          <h4>Ingredients</h4>

          <div
            v-for="(ingredient, index) in ingredients"
            :key="index"
            class="row mb-2 align-items-center"
          >
            <div class="col-md-5">
              <input
                v-model="ingredient.name"
                class="form-control"
                placeholder="Ingredient name"
                required
              />
            </div>

            <div class="col-md-3">
              <input
                v-model.number="ingredient.amount"
                type="number"
                min="0.01"
                step="any"
                class="form-control"
                placeholder="Amount"
                required
              />
            </div>

            <div class="col-md-2">
              <input
                v-model="ingredient.unit"
                class="form-control"
                placeholder="Unit"
                required
              />
            </div>

            <div class="col-md-2">
              <button
                type="button"
                class="btn btn-outline-danger"
                :disabled="ingredients.length === 1"
                @click="removeIngredient(index)"
              >
                Remove
              </button>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-outline-success mt-2"
            @click="addIngredient"
          >
            + Add Ingredient
          </button>

          <hr class="mt-4" />

          <!-- Dietary categories -->
          <h4>Dietary Categories</h4>
          <p class="text-muted">
            Select all dietary categories that apply.
          </p>

          <div class="row mb-4">
            <div
              v-for="option in dietaryOptions"
              :key="option"
              class="col-md-4 col-6 mb-2"
            >
              <div class="form-check">
                <input
                  :id="'diet-' + option"
                  v-model="dietaryCategories"
                  class="form-check-input"
                  type="checkbox"
                  :value="option"
                />
                <label
                  class="form-check-label"
                  :for="'diet-' + option"
                >
                  {{ option }}
                </label>
              </div>
            </div>
          </div>

          <hr />

          <!-- Allergens -->
          <h4>Allergens</h4>
          <p class="text-muted">
            Select all allergens present in your recipe.
          </p>

          <div class="row mb-4">
            <div
              v-for="option in allergenOptions"
              :key="option"
              class="col-md-4 col-6 mb-2"
            >
              <div class="form-check">
                <input
                  :id="'allergen-' + option"
                  v-model="allergens"
                  class="form-check-input"
                  type="checkbox"
                  :value="option"
                />
                <label
                  class="form-check-label"
                  :for="'allergen-' + option"
                >
                  {{ option }}
                </label>
              </div>
            </div>
          </div>

          <hr />

          <!-- Nutrition -->
          <h4>Nutrition Information</h4>
          <p class="text-muted">
            Enter nutritional values per serving.
            Leave unavailable information blank.
          </p>

          <div class="row mb-4">
            <div
              v-for="(item, index) in nutrition"
              :key="item.name"
              class="col-md-6 mb-3"
            >
              <label
                :for="'nutrition-' + index"
                class="form-label"
              >
                {{ item.name }}
              </label>

              <div class="input-group">
                <input
                  :id="'nutrition-' + index"
                  v-model="item.amount"
                  type="number"
                  min="0"
                  step="any"
                  class="form-control"
                  :placeholder="'Enter ' + item.name.toLowerCase()"
                />

                <span class="input-group-text">
                  {{ item.unit }}
                </span>
              </div>
            </div>
          </div>

          <hr />

          <!-- Instructions -->
          <h4>Instructions</h4>

          <div
            v-for="(instruction, index) in instructions"
            :key="index"
            class="mb-3"
          >
            <label class="form-label">
              Step {{ index + 1 }}
            </label>

            <div class="d-flex gap-2">
              <textarea
                v-model="instructions[index]"
                class="form-control"
                rows="2"
                required
                placeholder="Describe this cooking step..."
              ></textarea>

              <button
                type="button"
                class="btn btn-outline-danger"
                :disabled="instructions.length === 1"
                @click="removeInstruction(index)"
              >
                Remove
              </button>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-outline-success mb-4"
            @click="addInstruction"
          >
            + Add Step
          </button>

          <!-- Messages -->
          <div v-if="error" class="alert alert-danger">
            {{ error }}
          </div>

          <div v-if="success" class="alert alert-success">
            {{ success }}
          </div>

          <!-- Actions -->
          <div class="d-flex gap-2">
            <button
              type="submit"
              class="btn btn-success"
              :disabled="loading || imageUploading || !image"
            >
              {{ loading ? 'Saving...' : 'Save Changes' }}
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              :disabled="loading"
              @click="router.push('/profile')"
            >
              Cancel
            </button>
          </div>

        </form>
      </template>
    </div>
  </div>
</template>
