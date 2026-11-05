<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import axios from 'axios'
import { API_URL } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// Opened from the planner's Add Meal modal (/recipes/create?from=planner)?
// Then Save and Cancel take the user back to the planner, where the new recipe
// shows up in Add Meal, instead of the recipe list.
const backTo = route.query.from === 'planner' ? '/planner' : '/recipes'

// Basic recipe information
const title = ref('')
const image = ref('')
const imagePreview = ref('')
const imageUploading = ref(false)
const summary = ref('')
const cuisine = ref('Chinese')
const servings = ref(2)
const prepTime = ref(10)
const cookingTime = ref(15)

// Ingredients
const ingredients = ref([
  { name: '', amount: 1, unit: 'g' }
])

// Instructions
const instructions = ref([''])

// Dietary categories
const dietaryOptions = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Pescatarian',
  'Keto'
]

const dietaryCategories = ref([])

// Allergens
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

// Nutrition information
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

const nutrition = ref(
  nutritionOptions.map(item => ({
    name: item.name,
    amount: '',
    unit: item.unit
  }))
)

// Form status
const loading = ref(false)
const error = ref('')
const success = ref('')

// Add and remove ingredients
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

// Add and remove instructions
function addInstruction() {
  instructions.value.push('')
}

function removeInstruction(index) {
  instructions.value.splice(index, 1)
}

// Upload recipe image
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

  // Show image preview
  imagePreview.value = URL.createObjectURL(file)

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

  } catch (err) {
    console.error(err)

    image.value = ''
    imagePreview.value = ''

    error.value =
      err.response?.data?.message ||
      'Failed to upload image. Please try again.'

  } finally {
    imageUploading.value = false
  }
}

// Create recipe
async function createRecipe() {
  loading.value = true
  error.value = ''
  success.value = ''

  try {
    const recipeData = {
      title: title.value.trim(),
      image: image.value.trim(),
      summary: summary.value.trim(),
      cuisine: [cuisine.value.trim()],

      // Dietary categories
      dietaryCategories: dietaryCategories.value,

      servings: Number(servings.value),
      prepTime: Number(prepTime.value),
      cookingTime: Number(cookingTime.value),
      totalTime:
        Number(prepTime.value) + Number(cookingTime.value),

      // Ingredients
      ingredients: ingredients.value.map(item => ({
        name: item.name.trim(),
        amount: Number(item.amount),
        unit: item.unit.trim()
      })),

      // Instructions
      instructions: instructions.value.map(
        (description, index) => ({
          step: index + 1,
          description: description.trim()
        })
      ),

      // Nutrition information
      nutrition: nutrition.value
        .filter(item => item.amount !== '' && item.amount !== null)
        .map(item => ({
          name: item.name,
          amount: Number(item.amount),
          unit: item.unit
        })),

      // Allergens
      allergens: allergens.value,

      source: 'user',
      sourceUrl: ''
    }

    await axios.post(`${API_URL}/recipes`, recipeData, {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    success.value = 'Recipe created successfully!'
    await router.push(backTo)

  } catch (err) {
    console.error(err)

    error.value =
      err.response?.data?.message ||
      'Failed to create recipe. Please try again.'

  } finally {
    loading.value = false
  }
}
</script>


<template>
    <div class="fft-page">
  <div class="container mt-5 mb-5" style="max-width: 800px">
    <h1>Create a Recipe</h1>
    <p class="text-muted">
      Share your favourite recipe with others.
    </p>

    <form @submit.prevent="createRecipe">
      <div class="mb-3">
        <label class="form-label">Recipe title</label>
        <input
          v-model="title"
          class="form-control"
          required
          maxlength="150"
          placeholder="e.g. Chicken Fried Rice"
        />
      </div>

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
    Upload a JPG, PNG or WebP image. Maximum size: 5MB.
  </small>

  <!-- Image preview -->
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

  <div v-if="imageUploading" class="mt-2 text-muted">
    Uploading image...
  </div>

  <div v-if="image && !imageUploading" class="mt-2 text-success">
    Image uploaded successfully!
  </div>
</div>

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
          <option>Other</option>
        </select>
      </div>

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

<h4>Dietary Categories</h4>

<p class="text-muted">
  Select all dietary categories that apply to your recipe.
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
        This helps users avoid ingredients they are allergic to.
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

<h4>Nutrition Information</h4>

<p class="text-muted">
  Enter the nutritional values per serving.
  Leave fields blank if the information is unavailable.
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

<hr class="mt-4" />

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

      <div v-if="error" class="alert alert-danger">
        {{ error }}
      </div>

      <div v-if="success" class="alert alert-success">
        {{ success }}
      </div>

      <div class="d-flex gap-2">
        <button
          type="submit"
          class="btn btn-success"
          :disabled="loading || imageUploading || !image"
        >
          {{ loading ? 'Saving...' : 'Create Recipe' }}
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          @click="router.push(backTo)"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
  </div>
</template>
