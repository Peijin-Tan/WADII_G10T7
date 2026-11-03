/*
 * v-recipe-img: shows a recipe photo, or our placeholder when there is no photo
 * or the photo fails to load (deleted upload, dead Spoonacular link, offline...).
 *
 * Usage (instead of :src):  <img v-recipe-img="recipe.image" :alt="recipe.title" />
 *
 * Registered globally in main.js, so it works in <script setup> and Options API files.
 * The placeholder is imported from src/assets so Vite bundles it; a /img/... path
 * would be sent to the backend by the dev-server proxy.
 */
import placeholder from '@/assets/meal-placeholder.svg'

export const MEAL_PLACEHOLDER = placeholder

function setSrc(el, url) {
  const next = url || placeholder
  if (el.getAttribute('src') !== next) el.setAttribute('src', next)
}

export const vRecipeImg = {
  mounted(el, binding) {
    // Broken image -> placeholder (the check stops a loop if the placeholder itself ever failed)
    el.addEventListener('error', () => {
      if (el.getAttribute('src') !== placeholder) el.setAttribute('src', placeholder)
    })
    setSrc(el, binding.value)
  },
  updated(el, binding) {
    // Same <img> reused for another recipe (e.g. the dashboard carousel)
    if (binding.value !== binding.oldValue) setSrc(el, binding.value)
  },
}
