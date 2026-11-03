<script setup>
/* RecipeForm: the recipe form used by Create Recipe and Edit Recipe.
   The page owns the saving (POST or PUT); this component only collects the data and emits it:
     <RecipeForm :initial="recipe" submit-label="Save changes" :saving="saving" :error="error"
                 cancel-to="/recipes/123" @submit="save" @dismiss-error="error = ''" />
   Photos: paste a link, or upload one (POST /recipes/upload-image saves it in MongoDB and returns /images/<id>).
   Uploads are shrunk in the browser first (shrinkImage) so they take little space in the database.
   A photo is optional; without one the site shows its placeholder image.
   Styles: assets/forms.css (fp-) + the layout below (rf-). */
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import AppAlert from '@/components/ui/AppAlert.vue'

const props = defineProps({
  initial: { type: Object, default: null }, // an existing recipe when editing
  submitLabel: { type: String, default: 'Save recipe' },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  cancelTo: { type: String, required: true },
})
const emit = defineEmits(['submit', 'dismiss-error'])

const auth = useAuthStore()

const CUISINES = ['Chinese', 'Malay', 'Indian', 'Singaporean', 'Japanese', 'Korean', 'Thai', 'Italian', 'Western', 'Malaysian', 'Other']
const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'clove', 'slice', 'pinch']
// Same labels as the Dietary Preferences page
const DIETS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Pescatarian', 'Keto']
const ALLERGENS = ['Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Soy', 'Wheat', 'Fish', 'Shellfish', 'Sesame']
const NUTRIENTS = [
  { name: 'Calories', unit: 'kcal' },
  { name: 'Protein', unit: 'g' },
  { name: 'Carbohydrates', unit: 'g' },
  { name: 'Fat', unit: 'g' },
  { name: 'Saturated Fat', unit: 'g' },
  { name: 'Fiber', unit: 'g' },
  { name: 'Sugar', unit: 'g' },
  { name: 'Sodium', unit: 'mg' },
]

// Form state, filled from the recipe when editing (the page mounts this only once the recipe has loaded)
const r = props.initial || {}
const form = reactive({
  title: r.title || '',
  image: r.image || '',
  summary: r.summary || '',
  cuisine: r.cuisine?.[0] || 'Chinese',
  servings: r.servings ?? 2,
  prepTime: r.prepTime ?? 10,
  cookingTime: r.cookingTime ?? 15,
  ingredients: r.ingredients?.length
    ? r.ingredients.map((i) => ({ name: i.name || '', amount: i.amount ?? 1, unit: i.unit || 'g' }))
    : [{ name: '', amount: 1, unit: 'g' }],
  instructions: r.instructions?.length
    ? [...r.instructions].sort((a, b) => (a.step ?? 0) - (b.step ?? 0)).map((s) => s.description || '')
    : [''],
  dietaryCategories: [...(r.dietaryCategories || [])],
  allergens: [...(r.allergens || [])],
  nutrition: NUTRIENTS.map((n) => ({
    ...n,
    amount: (r.nutrition || []).find((x) => x.name === n.name)?.amount ?? '',
  })),
})
// Diet/allergen and nutrition sections start open when editing a recipe that already has them
const showExtras = ref(Boolean(form.dietaryCategories.length || form.allergens.length))
const showNutrition = ref(form.nutrition.some((n) => n.amount !== ''))

const totalTime = computed(() => (Number(form.prepTime) || 0) + (Number(form.cookingTime) || 0))
const filledIngredients = computed(() => form.ingredients.filter((i) => i.name.trim()).length)

const addIngredient = () => form.ingredients.push({ name: '', amount: 1, unit: 'g' })
const removeIngredient = (index) => form.ingredients.splice(index, 1)
const addStep = () => form.instructions.push('')
const removeStep = (index) => form.instructions.splice(index, 1)

/* ---------- Photo upload ---------- */
const fileInput = ref(null)
const uploading = ref(false)
const uploadError = ref('')
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIDE = 1200 // px, plenty for recipe cards and the detail page

// Resizes a photo to at most 1200px wide/tall and re-saves it as a JPEG (a phone photo of 4 MB becomes ~200 KB).
// Small images are left alone. If the browser can't read the image, the original file is used.
async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 400 * 1024) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

async function uploadPhoto(event) {
  const picked = event.target.files[0]
  event.target.value = '' // lets the same file be picked again
  if (!picked) return
  uploadError.value = ''
  if (!ALLOWED.includes(picked.type)) {
    uploadError.value = 'Please upload a JPG, PNG or WebP image.'
    return
  }
  uploading.value = true
  const file = await shrinkImage(picked)
  if (file.size > 5 * 1024 * 1024) {
    uploading.value = false
    uploadError.value = 'Image size must not exceed 5MB.'
    return
  }
  const data = new FormData()
  data.append('image', file)
  try {
    const response = await axios.post('/api/recipes/upload-image', data, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    form.image = response.data.imageUrl
  } catch (err) {
    console.error(err)
    uploadError.value = err.response?.data?.message || 'Failed to upload image.'
  } finally {
    uploading.value = false
  }
}

/* ---------- Submit ---------- */
function submit() {
  emit('submit', {
    title: form.title.trim(),
    image: form.image.trim(),
    summary: form.summary.trim(),
    cuisine: [form.cuisine],
    dietaryCategories: form.dietaryCategories,
    allergens: form.allergens,
    servings: Number(form.servings),
    prepTime: Number(form.prepTime),
    cookingTime: Number(form.cookingTime),
    totalTime: totalTime.value,
    ingredients: form.ingredients.map((i) => ({ name: i.name.trim(), amount: Number(i.amount), unit: i.unit.trim() })),
    instructions: form.instructions.map((description, index) => ({ step: index + 1, description: description.trim() })),
    nutrition: form.nutrition
      .filter((n) => n.amount !== '' && n.amount !== null)
      .map((n) => ({ name: n.name, amount: Number(n.amount), unit: n.unit })),
  })
}
</script>

<template>
  <form class="rf-layout" @submit.prevent="submit">
    <div class="rf-main">
      <!-- ===== Basics ===== -->
      <section class="fp-card" aria-labelledby="rf-basics">
        <div class="fp-card-head">
          <span class="fp-bubble" aria-hidden="true"><span class="material-symbols-outlined">edit_note</span></span>
          <div>
            <h2 id="rf-basics">The basics</h2>
            <p>What it's called and what it looks like.</p>
          </div>
        </div>

        <div class="fp-field">
          <label for="rf-title" class="fp-label">Recipe title</label>
          <input id="rf-title" v-model="form.title" class="fp-input" required maxlength="150" placeholder="e.g. Chicken Fried Rice" />
        </div>

        <div class="fp-field">
          <label for="rf-image" class="fp-label">Photo <span class="fp-optional">(optional)</span></label>
          <div class="rf-photo-row">
            <input id="rf-image" v-model="form.image" class="fp-input" placeholder="https://example.com/recipe.jpg" aria-describedby="rf-image-hint" />
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="d-none" @change="uploadPhoto" />
            <button type="button" class="fp-btn fp-btn--ghost" :disabled="uploading" @click="fileInput.click()">
              <span v-if="uploading" class="fp-spinner rf-spinner-dark" aria-hidden="true"></span>
              <span v-else class="material-symbols-outlined" aria-hidden="true">upload</span>
              {{ uploading ? 'Uploading...' : 'Upload' }}
            </button>
          </div>
          <p v-if="uploadError" class="fp-hint is-error" role="alert">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>{{ uploadError }}
          </p>
          <p v-else id="rf-image-hint" class="fp-hint">
            <span class="material-symbols-outlined" aria-hidden="true">image</span>
            Paste a link or upload a JPG, PNG or WebP (up to 5 MB). No photo? We'll show a placeholder.
          </p>
        </div>

        <div class="fp-field">
          <label for="rf-summary" class="fp-label">Description</label>
          <textarea id="rf-summary" v-model="form.summary" class="fp-textarea" required rows="3" placeholder="Describe your recipe..."></textarea>
        </div>

        <div class="fp-field">
          <label for="rf-cuisine" class="fp-label">Cuisine</label>
          <select id="rf-cuisine" v-model="form.cuisine" class="fp-select" required>
            <option v-for="c in CUISINES" :key="c">{{ c }}</option>
            <option v-if="!CUISINES.includes(form.cuisine)">{{ form.cuisine }}</option>
          </select>
        </div>

        <div class="fp-grid">
          <div class="fp-field">
            <label for="rf-servings" class="fp-label">Servings</label>
            <input id="rf-servings" v-model.number="form.servings" type="number" min="1" class="fp-input" required />
          </div>
          <div class="fp-field">
            <label for="rf-prep" class="fp-label">Prep time (min)</label>
            <input id="rf-prep" v-model.number="form.prepTime" type="number" min="0" class="fp-input" required />
          </div>
          <div class="fp-field">
            <label for="rf-cook" class="fp-label">Cooking time (min)</label>
            <input id="rf-cook" v-model.number="form.cookingTime" type="number" min="0" class="fp-input" required />
          </div>
        </div>
      </section>

      <!-- ===== Ingredients ===== -->
      <section class="fp-card" aria-labelledby="rf-ingredients">
        <div class="fp-card-head">
          <span class="fp-bubble" aria-hidden="true"><span class="material-symbols-outlined">shopping_basket</span></span>
          <div>
            <h2 id="rf-ingredients">Ingredients</h2>
            <p>Used for shopping lists and pantry matching, so keep names simple ("garlic", not "2 cloves of garlic").</p>
          </div>
        </div>

        <div class="rf-ing-head" aria-hidden="true"><span>Ingredient</span><span>Amount</span><span>Unit</span><span></span></div>
        <div v-for="(ingredient, index) in form.ingredients" :key="index" class="rf-ing-row">
          <input v-model="ingredient.name" class="fp-input" placeholder="Ingredient name" required :aria-label="`Ingredient ${index + 1} name`" />
          <input v-model.number="ingredient.amount" type="number" min="0.01" step="any" class="fp-input" placeholder="Amount" required :aria-label="`Ingredient ${index + 1} amount`" />
          <input v-model="ingredient.unit" class="fp-input" list="rf-units" placeholder="Unit" required :aria-label="`Ingredient ${index + 1} unit`" />
          <button type="button" class="fp-icon-btn" :disabled="form.ingredients.length === 1" :aria-label="`Remove ingredient ${index + 1}`" title="Remove" @click="removeIngredient(index)">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
        <datalist id="rf-units"><option v-for="u in UNITS" :key="u" :value="u" /></datalist>

        <button type="button" class="fp-btn fp-btn--dashed mt-2" @click="addIngredient">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add ingredient
        </button>
      </section>

      <!-- ===== Method ===== -->
      <section class="fp-card" aria-labelledby="rf-method">
        <div class="fp-card-head">
          <span class="fp-bubble" aria-hidden="true"><span class="material-symbols-outlined">format_list_numbered</span></span>
          <div>
            <h2 id="rf-method">Method</h2>
            <p>One step per box, in the order you cook.</p>
          </div>
        </div>

        <div v-for="(step, index) in form.instructions" :key="index" class="rf-step">
          <span class="rf-step-num" aria-hidden="true">{{ index + 1 }}</span>
          <textarea v-model="form.instructions[index]" class="fp-textarea" rows="2" required placeholder="Describe this cooking step..." :aria-label="`Step ${index + 1}`"></textarea>
          <button type="button" class="fp-icon-btn" :disabled="form.instructions.length === 1" :aria-label="`Remove step ${index + 1}`" title="Remove" @click="removeStep(index)">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>

        <button type="button" class="fp-btn fp-btn--dashed" @click="addStep">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add step
        </button>
      </section>

      <!-- ===== Optional extras (folded) ===== -->
      <section class="fp-card rf-fold" aria-labelledby="rf-extras">
        <button type="button" class="rf-fold-head" :aria-expanded="showExtras" aria-controls="rf-extras-body" @click="showExtras = !showExtras">
          <span class="fp-bubble" aria-hidden="true"><span class="material-symbols-outlined">eco</span></span>
          <span class="rf-fold-text">
            <span id="rf-extras" class="rf-fold-title">Diet and allergens <span class="fp-optional">(optional)</span></span>
            <span class="rf-fold-sub">Helps people with dietary needs find this recipe.</span>
          </span>
          <span class="material-symbols-outlined rf-fold-chevron" :class="{ 'is-open': showExtras }" aria-hidden="true">expand_more</span>
        </button>
        <div v-show="showExtras" id="rf-extras-body" class="rf-fold-body">
          <p class="fp-label">Suitable for</p>
          <div class="fp-chips" role="group" aria-label="Suitable for">
            <label v-for="d in DIETS" :key="d" class="fp-chip">
              <input v-model="form.dietaryCategories" type="checkbox" :value="d" />
              <span class="material-symbols-outlined" aria-hidden="true">{{ form.dietaryCategories.includes(d) ? 'check' : 'add' }}</span>
              {{ d }}
            </label>
          </div>
          <p class="fp-label mt-3">Contains</p>
          <div class="fp-chips" role="group" aria-label="Contains these allergens">
            <label v-for="a in ALLERGENS" :key="a" class="fp-chip fp-chip--warn">
              <input v-model="form.allergens" type="checkbox" :value="a" />
              <span class="material-symbols-outlined" aria-hidden="true">{{ form.allergens.includes(a) ? 'warning' : 'add' }}</span>
              {{ a }}
            </label>
          </div>
        </div>
      </section>

      <section class="fp-card rf-fold" aria-labelledby="rf-nutrition">
        <button type="button" class="rf-fold-head" :aria-expanded="showNutrition" aria-controls="rf-nutrition-body" @click="showNutrition = !showNutrition">
          <span class="fp-bubble" aria-hidden="true"><span class="material-symbols-outlined">nutrition</span></span>
          <span class="rf-fold-text">
            <span id="rf-nutrition" class="rf-fold-title">Nutrition per serving <span class="fp-optional">(optional)</span></span>
            <span class="rf-fold-sub">Leave blank anything you don't know.</span>
          </span>
          <span class="material-symbols-outlined rf-fold-chevron" :class="{ 'is-open': showNutrition }" aria-hidden="true">expand_more</span>
        </button>
        <div v-show="showNutrition" id="rf-nutrition-body" class="rf-fold-body rf-nutri">
          <div v-for="n in form.nutrition" :key="n.name" class="fp-field m-0">
            <label :for="`rf-n-${n.name}`" class="fp-label">{{ n.name }} <span class="fp-optional">({{ n.unit }})</span></label>
            <input :id="`rf-n-${n.name}`" v-model="n.amount" type="number" min="0" step="any" class="fp-input" />
          </div>
        </div>
      </section>

      <AppAlert v-if="error" tone="error" title="Recipe not saved" class="mt-3" @dismiss="emit('dismiss-error')">{{ error }}</AppAlert>

      <div class="fp-actions">
        <button type="submit" class="fp-btn fp-btn--primary" :disabled="saving || uploading">
          <span v-if="saving" class="fp-spinner" aria-hidden="true"></span>
          {{ saving ? 'Saving...' : submitLabel }}
        </button>
        <RouterLink :to="cancelTo" class="fp-btn fp-btn--ghost">Cancel</RouterLink>
        <slot name="actions" />
      </div>
    </div>

    <!-- ===== Live preview (desktop: sticks beside the form) ===== -->
    <aside class="rf-side" aria-label="Preview">
      <div class="fp-card rf-preview">
        <p class="rf-preview-label">Preview</p>
        <img v-recipe-img="form.image.trim()" alt="" class="rf-preview-img" />
        <span class="fp-count rf-preview-chip">{{ form.cuisine }}</span>
        <h2 class="rf-preview-title">{{ form.title.trim() || 'Your recipe title' }}</h2>
        <p class="rf-preview-sum">{{ form.summary.trim() || 'Your description will appear here.' }}</p>
        <dl class="rf-stats">
          <div><dt>Total</dt><dd>{{ totalTime }} min</dd></div>
          <div><dt>Serves</dt><dd>{{ form.servings || 0 }}</dd></div>
          <div><dt>Ingredients</dt><dd>{{ filledIngredients }}</dd></div>
        </dl>
      </div>
    </aside>
  </form>
</template>

<style scoped>
.rf-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  align-items: start;
}
.rf-side {
  position: sticky;
  top: 96px; /* below the sticky navbar */
}
@media (max-width: 991.98px) {
  .rf-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .rf-side {
    position: static;
    order: -1; /* preview on top on tablets and phones */
  }
}

/* Photo: link box + Upload button */
.rf-photo-row {
  display: flex;
  gap: 10px;
}
.rf-photo-row .fp-input {
  flex: 1;
  min-width: 0;
}
.rf-spinner-dark {
  border-color: rgb(50 83 60 / 25%);
  border-top-color: var(--fp-leaf);
}

/* Ingredient rows: name | amount | unit | remove */
.rf-ing-head,
.rf-ing-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 110px 40px;
  gap: 10px;
  align-items: center;
}
.rf-ing-head {
  margin-bottom: 6px;
  color: var(--fp-muted);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.rf-ing-row {
  margin-bottom: 10px;
}
@media (max-width: 575.98px) {
  .rf-ing-head {
    display: none;
  }
  .rf-ing-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--fp-line-soft);
  }
  .rf-ing-row > :first-child {
    grid-column: 1 / -1;
  }
}

/* Method steps */
.rf-step {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 40px;
  gap: 10px;
  align-items: start;
  margin-bottom: 12px;
}
.rf-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--fp-leaf);
  color: #fff;
  font: 600 14px/1 'Inter', sans-serif;
}

/* Foldable optional sections */
.rf-fold {
  padding: 0;
}
.rf-fold-head {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 20px 24px;
  border: 0;
  border-radius: 16px;
  background: none;
  color: inherit;
  text-align: left;
}
.rf-fold-head:focus-visible {
  outline: 2px solid var(--fp-leaf);
  outline-offset: -2px;
}
.rf-fold-text {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.rf-fold-title {
  font: 600 20px/28px 'Outfit', sans-serif;
}
.rf-fold-title .fp-optional {
  font: 400 14px/20px 'Inter', sans-serif;
}
.rf-fold-sub {
  color: var(--fp-muted);
  font-size: 14px;
  line-height: 20px;
}
.rf-fold-chevron {
  color: var(--fp-muted);
  transition: transform 150ms ease;
}
.rf-fold-chevron.is-open {
  transform: rotate(180deg);
}
.rf-fold-body {
  padding: 0 24px 24px;
}
.rf-nutri {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 767.98px) {
  .rf-nutri {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Preview card */
.rf-preview {
  padding: 16px;
}
.rf-preview-label {
  margin: 0 0 10px;
  color: var(--fp-muted);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rf-preview-img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  background: var(--fp-surface-2);
  object-fit: cover;
}
.rf-preview-chip {
  display: inline-block;
  margin-top: 12px;
  background: var(--fp-sprout);
  color: var(--fp-leaf);
}
.rf-preview-title {
  margin: 8px 0 4px;
  font: 600 20px/26px 'Outfit', sans-serif;
  overflow-wrap: anywhere;
}
.rf-preview-sum {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--fp-ink-2);
  font-size: 14px;
  line-height: 20px;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.rf-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--fp-line-soft);
}
.rf-stats dt {
  color: var(--fp-muted);
  font-size: 12px;
  font-weight: 500;
}
.rf-stats dd {
  margin: 0;
  font: 600 16px/22px 'Inter', sans-serif;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 991.98px) {
  .rf-preview {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    column-gap: 14px;
  }
  .rf-preview-label {
    grid-column: 1 / -1;
  }
  .rf-preview-img {
    grid-row: span 4;
  }
  .rf-preview-chip {
    justify-self: start;
    margin-top: 0;
  }
  .rf-stats {
    grid-column: 2;
  }
}
@media (max-width: 420px) {
  .rf-preview {
    grid-template-columns: 88px minmax(0, 1fr);
  }
  .rf-preview-sum {
    -webkit-line-clamp: 2;
  }
}
</style>
