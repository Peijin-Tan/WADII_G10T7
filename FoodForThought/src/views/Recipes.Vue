<script setup>
const recipes = [
  {
    name: "Chicken Fried Rice",
    time: 20,
    match: 95
  },
  {
    name: "Chicken Rice Bowl",
    time: 25,
    match: 88
  },
  {
    name: "Egg Fried Rice",
    time: 15,
    match: 82
  }
]
</script>

<template>

  <div class="container mt-5">

    <h1>Recommended Recipes</h1>

    <p class="text-muted">
      Recipes based on your pantry.
    </p>

    <div class="row mt-4">

      <div
        v-for="recipe in recipes"
        :key="recipe.name"
        class="col-md-4 mb-3"
      >

        <div class="card">

          <div class="card-body">

            <h5 class="card-title">
              {{ recipe.name }}
            </h5>

            <p>
              ⏱ {{ recipe.time }} minutes
            </p>

            <p>
              🟢 {{ recipe.match }}% match
            </p>

            <button class="btn btn-success">
              View Recipe
            </button>

          </div>

        </div>

      </div>

    </div>

  </div>

</template>