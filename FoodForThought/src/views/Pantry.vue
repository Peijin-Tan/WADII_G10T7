<script setup>
import { ref } from 'vue'

const pantry = ref([
  { name: 'Chicken', quantity: 500, unit: 'g' },
  { name: 'Rice', quantity: 2, unit: 'kg' },
  { name: 'Eggs', quantity: 6, unit: 'pieces' }
])

const ingredientName = ref('')
const ingredientQuantity = ref('')
const ingredientUnit = ref('pieces')

function addIngredient() {
  if (ingredientName.value === '' || ingredientQuantity.value === '') {
    return
  }

  pantry.value.push({
    name: ingredientName.value,
    quantity: ingredientQuantity.value,
    unit: ingredientUnit.value
  })

  ingredientName.value = ''
  ingredientQuantity.value = ''
  ingredientUnit.value = 'pieces'
}

function removeIngredient(index) {
  pantry.value.splice(index, 1)
}
</script>

<template>
  <div class="container mt-4">

    <h1 class="mb-4">My Pantry 🥕</h1>

    <!-- Add ingredient -->
    <div class="card p-4 mb-4">

      <h5>Add Ingredient</h5>

      <div class="row g-2">

        <div class="col-md-5">
          <input
            v-model="ingredientName"
            type="text"
            class="form-control"
            placeholder="Ingredient name"
          >
        </div>

        <div class="col-md-3">
          <input
            v-model="ingredientQuantity"
            type="number"
            class="form-control"
            placeholder="Quantity"
          >
        </div>

        <div class="col-md-2">
          <select
            v-model="ingredientUnit"
            class="form-select"
          >
            <option value="pieces">pieces</option>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">ml</option>
            <option value="L">L</option>
          </select>
        </div>

        <div class="col-md-2">
          <button
            @click="addIngredient"
            class="btn btn-success w-100"
          >
            Add
          </button>
        </div>

      </div>

    </div>

    <!-- Pantry list -->
    <div class="row">

      <div
        v-for="(item, index) in pantry"
        :key="index"
        class="col-md-4 mb-3"
      >

        <div class="card p-3">

          <h5>{{ item.name }}</h5>

          <p class="mb-2">
            {{ item.quantity }} {{ item.unit }}
          </p>

          <button
            @click="removeIngredient(index)"
            class="btn btn-outline-danger btn-sm"
          >
            Remove
          </button>

        </div>

      </div>

    </div>

  </div>
</template>