<template>
  <div class="container mt-5">
    <h1 class="text-success">
      Welcome to FoodForThought
    </h1>

    <p class="text-muted">
      Cook smarter. Waste less. Live healthier.
    </p>

    <div class="row mt-4">

      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">My Pantry</h5>
            <p class="card-text">
              Check the ingredients you have.
            </p>

            <RouterLink to="/pantry" class="btn btn-success">
              View Pantry
            </RouterLink>
          </div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">Recipes</h5>
            <p class="card-text">
              Find recipes based on your ingredients.
            </p>

            <RouterLink to="/recipes" class="btn btn-success">
              Browse Recipes
            </RouterLink>
          </div>
        </div>
      </div>

    </div>

  </div>
</template>