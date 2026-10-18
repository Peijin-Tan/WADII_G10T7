
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const title = ref('')
const image = ref('')
const summary = ref('')
const cuisine = ref('Chinese')
const servings = ref(2)
const prepTime = ref(10)
const cookingTime = ref(15)

const ingredients = ref([
  { name: '', amount: 1, unit: 'g' }
])

const instructions = ref([''])

const loading = ref(false)
const error = ref('')
const success = ref('')

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
      dietaryCategories: [],
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

      nutrition: [],
      allergens: [],
      source: 'user',
      sourceUrl: ''
    }

    await axios.post('/api/recipes', recipeData, {
    headers: {
      Authorization: `Bearer ${auth.token}`
    }
  })

    success.value = 'Recipe created successfully!'
    await router.push('/recipes')
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
        <label class="form-label">Image URL</label>
        <input
          v-model="image"
          type="url"
          class="form-control"
          required
          placeholder="https://example.com/recipe.jpg"
        />
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
          :disabled="loading"
        >
          {{ loading ? 'Saving...' : 'Create Recipe' }}
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          @click="router.push('/recipes')"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</template>
