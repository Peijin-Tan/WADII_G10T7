<script setup>
/* Recipe suggestions modal, opened from the "What can I cook?" button on Pantry.vue.
   Works like the planner's addmeal modal: the parent page owns the API call
   (GET /pantry/suggestions) and passes the results in as props; this component only
   shows them and tells the parent what to do through events.

   Props:  recipes, loading, error, message, pantryCount
   Events: search(filters)  -> parent fetches suggestions with { diet, intolerances, maxReadyTime }
           close            -> parent hides the modal */
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  recipes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  message: { type: String, default: '' },
  pantryCount: { type: Number, default: 0 },
})
const emit = defineEmits(['search', 'close'])

/* ---------- Filter options (values Spoonacular accepts) ---------- */
const DIETS = [
  { value: '', label: 'My profile' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten free', label: 'Gluten free' },
  { value: 'pescetarian', label: 'Pescetarian' },
  { value: 'ketogenic', label: 'Keto' },
]
const ALLERGENS = ['dairy', 'egg', 'gluten', 'peanut', 'seafood', 'shellfish', 'soy', 'tree nut']
const TIMES = [
  { value: null, label: 'Any time' },
  { value: 15, label: '≤ 15m' },
  { value: 30, label: '≤ 30m' },
  { value: 60, label: '≤ 60m' },
]

const filters = ref({ diet: '', intolerances: [], maxReadyTime: null })

function toggleAllergen(a) {
  const list = filters.value.intolerances
  filters.value.intolerances = list.includes(a) ? list.filter((x) => x !== a) : [...list, a]
}

// Filters only apply when "Find Recipes" is pressed, so each chip click doesn't use up the Spoonacular quota
function search() {
  emit('search', { ...filters.value, intolerances: [...filters.value.intolerances] })
}

/* ---------- "Why this score?" (open/closed per recipe) ---------- */
const openWhy = ref({})
const toggleWhy = (id) => { openWhy.value[id] = !openWhy.value[id] }

/* ---------- Modal behaviour ---------- */
function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  document.body.style.overflow = 'hidden' // stop the page behind from scrolling
  window.addEventListener('keydown', onKey)
  search() // load suggestions as soon as the modal opens
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <!-- Teleported to <body> so it sits above everything, like the planner modals -->
  <Teleport to="body">
    <div class="fft-backdrop" @click.self="emit('close')">
      <div class="fft-page fft-modal" role="dialog" aria-modal="true" aria-labelledby="suggest-title"
        data-testid="suggestions-modal">
        <!-- Header -->
        <div class="fft-modal-head">
          <div class="d-flex align-items-baseline flex-wrap gap-2">
            <h2 id="suggest-title" class="fft-modal-title m-0">What can I cook?</h2>
            <span class="fft-tag">From {{ pantryCount }} pantry {{ pantryCount === 1 ? 'item' : 'items' }}</span>
          </div>
          <button type="button" class="fft-icon-btn" aria-label="Close" data-testid="suggestions-close"
            @click="emit('close')">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Filters -->
        <form class="fft-modal-filters d-flex flex-column gap-2" @submit.prevent="search">
          <div class="d-flex align-items-center flex-wrap gap-2">
            <span class="fft-label-sm fft-upper text-fft-muted fft-filter-label">Diet</span>
            <button v-for="d in DIETS" :key="d.label" type="button" class="fft-chip"
              :class="{ active: filters.diet === d.value }" @click="filters.diet = d.value">{{ d.label }}</button>
          </div>
          <div class="d-flex align-items-center flex-wrap gap-2">
            <span class="fft-label-sm fft-upper text-fft-muted fft-filter-label">Avoid</span>
            <button v-for="a in ALLERGENS" :key="a" type="button" class="fft-chip text-capitalize"
              :class="{ active: filters.intolerances.includes(a) }" :aria-pressed="filters.intolerances.includes(a)"
              @click="toggleAllergen(a)">{{ a }}</button>
          </div>
          <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
            <div class="d-flex align-items-center flex-wrap gap-2">
              <span class="fft-label-sm fft-upper text-fft-muted fft-filter-label">Time</span>
              <button v-for="t in TIMES" :key="t.label" type="button" class="fft-chip"
                :class="{ active: filters.maxReadyTime === t.value }" @click="filters.maxReadyTime = t.value">
                {{ t.label }}
              </button>
            </div>
            <button type="submit" class="btn fft-btn-primary d-flex align-items-center justify-content-center gap-1"
              :disabled="loading" data-testid="suggest-btn">
              <span class="material-symbols-outlined" :class="{ 'fft-spin': loading }" style="font-size: 18px">
                {{ loading ? 'progress_activity' : 'search' }}
              </span>
              <span>{{ loading ? 'Finding...' : 'Find Recipes' }}</span>
            </button>
          </div>
        </form>

        <!-- Results (this part scrolls) -->
        <div class="fft-modal-body">
          <div v-if="error" class="alert alert-danger m-0" role="alert">{{ error }}</div>

          <div v-else-if="loading && recipes.length === 0" class="text-center py-5" role="status">
            <span class="material-symbols-outlined fft-spin text-fft-outline" style="font-size: 32px">progress_activity</span>
            <p class="fft-body-sm text-fft-muted mt-2 mb-0">Finding recipes for your pantry...</p>
          </div>

          <div v-else-if="recipes.length === 0" data-testid="suggestions-empty"
            class="text-center py-5 d-flex flex-column align-items-center gap-2">
            <span class="material-symbols-outlined text-fft-outline" style="font-size: 40px">search_off</span>
            <h3 class="fft-headline-sm m-0">No recipes found</h3>
            <p class="fft-body-sm text-fft-muted m-0">
              {{ message || 'Try adding more pantry items or relaxing the filters.' }}
            </p>
          </div>

          <div v-else class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3" :class="{ 'fft-dim': loading }">
            <div v-for="r in recipes" :key="r.spoonacularId" class="col">
              <!-- One suggestion card -->
              <div class="fft-card h-100 d-flex flex-column" data-testid="suggestion-card">
                <div class="position-relative fft-card-img">
                  <img v-if="r.image" :src="r.image" :alt="r.title" class="w-100 h-100 fft-cover" />
                  <div v-else class="w-100 h-100 d-flex align-items-center justify-content-center fft-bg-gray">
                    <span class="material-symbols-outlined text-fft-outline" style="font-size: 40px">restaurant</span>
                  </div>
                  <div class="fft-score" title="Match score out of 100" data-testid="suggestion-score">{{ r.score }}</div>
                </div>

                <div class="p-3 d-flex flex-column gap-2 flex-grow-1">
                  <div class="d-flex align-items-center flex-wrap gap-2">
                    <span class="fft-pill fft-pill-green">{{ r.breakdown.coveragePercent }}% in pantry</span>
                    <span v-if="r.readyInMinutes" class="fft-pill fft-pill-gray">{{ r.readyInMinutes }}m</span>
                    <span v-for="diet in r.diets.slice(0, 1)" :key="diet" class="fft-pill fft-pill-amber">{{ diet }}</span>
                  </div>

                  <h3 class="fft-headline-sm m-0">{{ r.title }}</h3>

                  <div v-if="r.missedIngredients.length === 0"
                    class="d-flex align-items-center gap-1 fft-label-sm text-fft-primary">
                    <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>
                    You have everything you need
                  </div>
                  <div v-else class="fft-body-sm text-fft-muted" data-testid="suggestion-missing">
                    <span class="text-fft-secondary fw-semibold">{{ r.missedCount }} missing:</span>
                    {{ r.missedIngredients.map((m) => m.name).join(', ') }}
                  </div>

                  <button type="button" class="fft-link align-self-start" :aria-expanded="!!openWhy[r.spoonacularId]"
                    @click="toggleWhy(r.spoonacularId)">
                    Why this score?
                    <span class="material-symbols-outlined" style="font-size: 16px">
                      {{ openWhy[r.spoonacularId] ? 'expand_less' : 'expand_more' }}
                    </span>
                  </button>
                  <ul v-if="openWhy[r.spoonacularId]" class="fft-why list-unstyled m-0">
                    <li><span>Pantry coverage</span><strong>+{{ r.breakdown.points.coverage }}</strong></li>
                    <li><span>Few missing ingredients</span><strong>+{{ r.breakdown.points.missing }}</strong></li>
                    <li><span>Prep time</span><strong>+{{ r.breakdown.points.time }}</strong></li>
                  </ul>

                  <!-- TODO: point at Pei Jin's recipe page, and/or add an "Add to plan" button
                       that emits an event so the parent can open the planner's addmeal modal -->
                  <router-link :to="`/recipes/${r.spoonacularId}`"
                    class="btn fft-btn-soft d-flex align-items-center justify-content-center gap-1 mt-auto">
                    <span class="material-symbols-outlined" style="font-size: 16px">menu_book</span>
                    View Recipe
                  </router-link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Colours, fonts, .btn and h2/h3 fonts come from the team's theme.css (.fft-page on the dialog).
   Teleported content is outside Pantry.vue, so it can't use Pantry.vue's scoped styles. */

/* Extra colours theme.css doesn't have (same values as Pantry.vue) */
.fft-modal {
  --fft-accent: #A23E18;
  --fft-amber: #FFDDB5;
  --fft-amber-text: #2A1800;
  --fft-on-primary: #FFFFFF;
  --fft-radius: 8px;
  --fft-radius-xl: 12px;
  --fft-radius-2xl: 16px;
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  font-size: 24px;
  user-select: none;
}

/* ===== Modal frame ===== */
.fft-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1055; /* same layer as Bootstrap modals */
  background: rgba(26, 28, 24, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.fft-modal {
  /* override theme.css's flex: 1 / width: 100% on .fft-page */
  flex: 0 1 auto;
  width: 100%;
  max-width: 1080px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  border-radius: var(--fft-radius-2xl);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.fft-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  background: var(--fft-card);
  border-bottom: 1px solid rgba(194, 200, 192, 0.4);
}

.fft-modal-title {
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
}

.fft-modal-filters {
  padding: 12px 20px;
  background: var(--fft-surface-low);
}

.fft-modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* Phones: fill the screen */
@media (max-width: 575.98px) {
  .fft-backdrop {
    padding: 0;
  }

  .fft-modal {
    max-height: 100vh;
    height: 100%;
    border-radius: 0;
  }
}

.fft-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--fft-radius);
  background: var(--fft-surface-low);
  color: var(--fft-secondary-text);
  transition: background-color 0.15s;
}

.fft-icon-btn:hover {
  background: var(--fft-surface-high);
}

.fft-icon-btn .material-symbols-outlined {
  font-size: 20px;
}

/* ===== Typography ===== */
.fft-headline-sm {
  font: 600 18px/26px 'Outfit', sans-serif;
}

.fft-label-sm {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}

.fft-body-sm {
  font: 400 13px/20px 'Inter', sans-serif;
}

.fft-upper {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.fft-filter-label {
  min-width: 48px;
}

.text-fft-primary {
  color: var(--fft-primary) !important;
}

.text-fft-secondary {
  color: var(--fft-accent) !important;
}

.text-fft-muted {
  color: var(--fft-secondary-text) !important;
}

.text-fft-outline {
  color: var(--fft-muted) !important;
}

/* ===== Buttons (base font/padding/radius from theme.css) ===== */
.btn {
  border: 0;
  transition: background-color 0.15s, color 0.15s;
}

.fft-btn-primary {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
}

.fft-btn-primary:hover {
  background: var(--fft-primary-hover);
  color: var(--fft-on-primary);
}

.fft-btn-soft {
  background: var(--fft-surface-low);
  color: var(--fft-text);
}

.fft-btn-soft:hover {
  background: var(--fft-surface-high);
  color: var(--fft-text);
}

.fft-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  font: 600 12px/16px 'Inter', sans-serif;
  color: var(--fft-primary);
}

.fft-link:hover {
  text-decoration: underline;
}

/* ===== Tag, chips, pills ===== */
.fft-tag {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fft-primary);
  background: var(--fft-primary-light);
  padding: 2px 8px;
  border-radius: 4px;
}

.fft-chip {
  border: 0;
  border-radius: 9999px;
  padding: 4px 12px;
  background: var(--fft-surface-high);
  color: var(--fft-secondary-text);
  font: 600 11px/14px 'Inter', sans-serif;
  transition: background-color 0.15s;
}

.fft-chip:hover {
  background: var(--fft-border);
}

.fft-chip.active {
  background: var(--fft-primary-hover);
  color: var(--fft-primary-light);
}

.fft-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}

.fft-pill-green {
  background: var(--fft-primary-light);
  color: var(--fft-primary-dark);
}

.fft-pill-gray {
  background: var(--fft-surface-high);
  color: var(--fft-secondary-text);
}

.fft-pill-amber {
  background: var(--fft-amber);
  color: var(--fft-amber-text);
}

/* ===== Suggestion cards ===== */
.fft-card {
  background: var(--fft-card);
  border: 1px solid rgba(194, 200, 192, 0.4);
  border-radius: var(--fft-radius-2xl);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s;
}

.fft-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.fft-card-img {
  height: 170px;
  overflow: hidden;
}

.fft-cover {
  object-fit: cover;
}

.fft-bg-gray {
  background: var(--fft-surface-high);
}

.fft-score {
  position: absolute;
  top: 12px;
  right: 12px;
  min-width: 44px;
  padding: 6px 10px;
  border-radius: 9999px;
  text-align: center;
  font: 600 16px/20px 'Outfit', sans-serif;
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.fft-why li {
  display: flex;
  justify-content: space-between;
  font: 400 13px/22px 'Inter', sans-serif;
  color: var(--fft-secondary-text);
}

.fft-why strong {
  color: var(--fft-primary);
}

/* old results fade slightly while new ones load */
.fft-dim {
  opacity: 0.5;
  pointer-events: none;
}

/* ===== Spinner ===== */
.fft-spin {
  animation: fft-spin 1s linear infinite;
}

@keyframes fft-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>