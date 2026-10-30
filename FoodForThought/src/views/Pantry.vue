<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import suggestionsModal from '../components/SuggestionModal.vue'
// Colours, fonts, h1/h2/h3, .btn and .form-control come from the team's shared theme.css (.fft-page).
// The page-specific styles are in the <style scoped> block at the bottom.

/* ---------- API ---------- */
// Same setup as Planner.vue: send the JWT from the auth store, log out on 401.
// The server works out the user from the token (requireAuth -> req.user -> req.userId).
const auth = useAuthStore()
const router = useRouter()

function withAuth(instance) {
  instance.interceptors.request.use((config) => {
    if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`
    return config
  })
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        auth.logout()
        router.push('/login')
      }
      return Promise.reject(err)
    }
  )
  return instance
}

// Pantry requests go to the Express router mounted at /pantry (routes/pantry/pantry.js)
const api = withAuth(axios.create({ baseURL: 'http://localhost:8000/pantry' }))

// Works whether the model sends `id` or Mongo's `_id`
const idOf = (item) => item.id || item._id

/* ---------- Options (must match the enums in models/Pantry.js) ---------- */
const UNITS = ['pcs', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup']
const CATEGORIES = [
  { value: 'produce', label: 'Produce', icon: 'nutrition' },
  { value: 'meat', label: 'Meat', icon: 'kebab_dining' },
  { value: 'seafood', label: 'Seafood', icon: 'set_meal' },
  { value: 'dairy', label: 'Dairy & Eggs', icon: 'egg' },
  { value: 'grains', label: 'Grains & Bread', icon: 'grain' },
  { value: 'canned', label: 'Canned', icon: 'inventory_2' },
  { value: 'spices', label: 'Spices', icon: 'spa' },
  { value: 'condiments', label: 'Sauces & Condiments', icon: 'water_drop' },
  { value: 'frozen', label: 'Frozen', icon: 'ac_unit' },
  { value: 'other', label: 'Other', icon: 'category' },
]

/* ---------- Date helpers (local time, same reason as Planner.vue) ---------- */
function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const today = new Date()
today.setHours(0, 0, 0, 0)

function daysUntil(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000) // ms in a day
}
function expiryPill(item) {
  const n = daysUntil(item.expiryDate)
  if (n === null) return null
  if (n < 0) return { text: 'Expired', class: 'fft-pill-peach' }
  if (n === 0) return { text: 'Expires today', class: 'fft-pill-peach' }
  if (n <= 3) return { text: `${n}d left`, class: 'fft-pill-amber' }
  return { text: `${n}d left`, class: 'fft-pill-gray' }
}

/* ---------- Loading + saving ---------- */
const items = ref([])
const loading = ref(true)
const saving = ref(false)
const errorMsg = ref('')
const notice = ref('') // short "Added eggs" style message after a save
let noticeTimer = null

function showNotice(text) {
  notice.value = text
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 2500)
}

async function loadPantry() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.get('/')
    items.value = data.items
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Could not load your pantry. Is the server running?'
  } finally {
    loading.value = false
  }
}
onMounted(loadPantry)

// Every write returns the whole updated pantry ({ items }), so we just replace our copy.
// Returns true if it saved, so callers can reset their form.
async function saveChange(request) {
  saving.value = true
  errorMsg.value = ''
  try {
    const { data } = await request
    items.value = data.items
    return true
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Could not save your change. Please try again.'
    return false
  } finally {
    saving.value = false
  }
}

/* ---------- Metrics ---------- */
const expiringSoon = computed(() => items.value.filter((i) => {
  const n = daysUntil(i.expiryDate)
  return n !== null && n <= 3
}))

const metrics = computed(() => [
  { label: 'Items in Pantry', value: String(items.value.length), icon: 'inventory_2', bg: 'fft-bg-green-light text-fft-primary' },
  { label: 'Categories', value: String(new Set(items.value.map((i) => i.category)).size), icon: 'category', bg: 'fft-bg-gray text-fft-muted' },
  { label: 'Use Within 3 Days', value: String(expiringSoon.value.length), icon: 'schedule', bg: 'fft-bg-peach text-fft-secondary' },
])

/* ---------- Search + category filter ---------- */
const search = ref('')
const activeCategory = ref('all')

const visibleItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value.filter((i) =>
    (activeCategory.value === 'all' || i.category === activeCategory.value) &&
    (!q || i.name.toLowerCase().includes(q)))
})

// [{ meta, items }] in CATEGORIES order, only categories that have items
const groups = computed(() =>
  CATEGORIES
    .map((meta) => ({
      meta,
      items: visibleItems.value
        .filter((i) => i.category === meta.value)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0)
)

const usedCategories = computed(() => CATEGORIES.filter((c) => items.value.some((i) => i.category === c.value)))

/* ---------- Add ---------- */
const emptyForm = () => ({ name: '', quantity: 1, unit: 'pcs', category: 'other', expiryDate: '' })
const form = ref(emptyForm())

// POST /pantry -> if the ingredient is already there, the server adds to its quantity
async function onAdd() {
  const name = form.value.name.trim()
  if (!name) return
  const body = { ...form.value, name }
  if (!body.expiryDate) delete body.expiryDate

  const idsBefore = new Set(items.value.map(idOf))
  if (!(await saveChange(api.post('/', body)))) return

  // Tell the user whether it was new or merged into an existing item
  const added = items.value.find((i) => !idsBefore.has(idOf(i)))
  if (added) {
    showNotice(`Added ${added.name}`)
  } else {
    const merged = items.value.find((i) => i.name.toLowerCase() === name.toLowerCase())
    showNotice(merged ? `${merged.name} now ${merged.quantity} ${merged.unit}` : `Updated ${name}`)
  }
  form.value = emptyForm()
}

/* ---------- Edit (PATCH /pantry/:itemId accepts any field) ---------- */
const editingId = ref(null)
const editForm = ref(emptyForm())

function startEdit(item) {
  editingId.value = idOf(item)
  editForm.value = {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    expiryDate: item.expiryDate ? toISODate(new Date(item.expiryDate)) : '',
  }
}
function cancelEdit() {
  editingId.value = null
}

async function saveEdit(item) {
  const name = editForm.value.name.trim()
  if (!name) {
    errorMsg.value = 'Ingredient name is required'
    return
  }
  // empty date = clear the expiry date
  const body = { ...editForm.value, name, expiryDate: editForm.value.expiryDate || null }
  if (await saveChange(api.patch(`/${idOf(item)}`, body))) {
    editingId.value = null
    showNotice(`Saved ${name}`)
  }
}

/* ---------- Recipe suggestions modal ---------- */
// The modal only displays results; this page does the API call, like the planner and its addmeal modal.
const showSuggestions = ref(false)
const suggestions = ref({ recipes: [], pantryCount: 0, message: '' })
const suggestLoading = ref(false)
const suggestError = ref('')
let latestSuggest = 0 // ignore a slow response if the user searched again (same idea as the planner)

function openSuggestions() {
  suggestError.value = ''
  showSuggestions.value = true // the modal emits 'search' as soon as it opens
}

// filters from the modal: { diet, intolerances: [], maxReadyTime }
async function fetchSuggestions(filters) {
  const requestId = ++latestSuggest
  suggestLoading.value = true
  suggestError.value = ''

  const params = {}
  if (filters.diet) params.diet = filters.diet
  if (filters.intolerances.length) params.intolerances = filters.intolerances.join(',')
  if (filters.maxReadyTime) params.maxReadyTime = filters.maxReadyTime

  try {
    const { data } = await api.get('/suggestions', { params })
    if (requestId === latestSuggest) {
      suggestions.value = { recipes: data.recipes, pantryCount: data.pantryCount ?? 0, message: data.message || '' }
    }
  } catch (err) {
    if (requestId === latestSuggest) {
      suggestions.value = { ...suggestions.value, recipes: [] }
      suggestError.value = err.response?.data?.message || 'Could not load suggestions. Is the server running?'
    }
  } finally {
    if (requestId === latestSuggest) suggestLoading.value = false
  }
}

/* ---------- Remove ---------- */
async function onRemove(item) {
  if (!window.confirm(`Remove ${item.name} from your pantry?`)) return
  if (await saveChange(api.delete(`/${idOf(item)}`))) showNotice(`Removed ${item.name}`)
}
</script>

<template>
  <div class="fft-page fft-pantry">
    <main class="fft-main">
      <!-- ============ CONTROL BAR + STATS ============ -->
      <section class="fft-controls px-4 py-3">
        <div class="container-fluid fft-container d-flex flex-column gap-3">
          <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div class="d-flex align-items-baseline flex-wrap gap-2">
              <h1 class="m-0">My Pantry</h1>
              <span class="fft-tag">{{ items.length }} {{ items.length === 1 ? 'item' : 'items' }}</span>
              <span v-if="loading || saving" class="fft-label-sm text-fft-muted d-flex align-items-center gap-1"
                role="status">
                <span class="material-symbols-outlined fft-spin" style="font-size: 16px">progress_activity</span>
                {{ saving ? 'Saving...' : 'Loading...' }}
              </span>
              <span v-else-if="notice" class="fft-label-sm text-fft-primary d-flex align-items-center gap-1"
                role="status" data-testid="pantry-notice">
                <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>
                {{ notice }}
              </span>
            </div>
            <button type="button" data-testid="go-suggestions"
              class="btn fft-btn-primary fft-btn-lg d-flex align-items-center justify-content-center gap-2"
              :disabled="loading || items.length === 0"
              :title="items.length === 0 ? 'Add some ingredients first' : 'Find recipes you can make'"
              @click="openSuggestions">
              <span class="material-symbols-outlined" style="font-size: 18px">soup_kitchen</span>
              <span>What can I cook?</span>
            </button>
          </div>

          <!-- Metric tiles -->
          <div class="row g-3 pt-1">
            <div v-for="m in metrics" :key="m.label" class="col-6 col-md-3">
              <div class="fft-tile d-flex align-items-center justify-content-between h-100">
                <div class="d-flex flex-column">
                  <span class="fft-label-sm fft-upper text-fft-muted">{{ m.label }}</span>
                  <span class="fft-headline-md">{{ m.value }}</span>
                </div>
                <div class="fft-round-icon" :class="m.bg">
                  <span class="material-symbols-outlined" style="font-size: 20px">{{ m.icon }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ PANTRY ============ -->
      <section class="px-4 py-4">
        <div class="container-fluid fft-container">
          <div v-if="errorMsg" class="alert alert-danger d-flex align-items-center justify-content-between gap-2"
            role="alert">
            <span>{{ errorMsg }}</span>
            <button type="button" class="btn-close" aria-label="Dismiss" @click="errorMsg = ''"></button>
          </div>

          <div class="row g-4 align-items-start">
            <!-- Left: add form -->
            <div class="col-12 col-lg-4">
              <form class="fft-card fft-card-bordered fft-card-lg d-flex flex-column gap-3" data-testid="pantry-form"
                @submit.prevent="onAdd">
                <div>
                  <span class="fft-label-sm fft-upper text-fft-outline fw-semibold">Stock up</span>
                  <p class="fft-headline-sm m-0">Add Ingredient</p>
                  <p class="fft-body-sm text-fft-muted m-0">Already have it? We'll add to the quantity.</p>
                </div>

                <div class="d-flex flex-column gap-1">
                  <label class="fft-label-sm text-fft-muted" for="ing-name">Ingredient</label>
                  <input id="ing-name" v-model="form.name" class="fft-input" placeholder="e.g. eggs" required
                    maxlength="60" data-testid="pantry-name" />
                </div>

                <div class="row g-2">
                  <div class="col-6 d-flex flex-column gap-1">
                    <label class="fft-label-sm text-fft-muted" for="ing-qty">Quantity</label>
                    <input id="ing-qty" v-model.number="form.quantity" type="number" min="0" step="any"
                      class="fft-input" data-testid="pantry-qty" />
                  </div>
                  <div class="col-6 d-flex flex-column gap-1">
                    <label class="fft-label-sm text-fft-muted" for="ing-unit">Unit</label>
                    <select id="ing-unit" v-model="form.unit" class="fft-input">
                      <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                    </select>
                  </div>
                </div>

                <div class="d-flex flex-column gap-1">
                  <label class="fft-label-sm text-fft-muted" for="ing-cat">Category</label>
                  <select id="ing-cat" v-model="form.category" class="fft-input">
                    <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
                  </select>
                </div>

                <div class="d-flex flex-column gap-1">
                  <label class="fft-label-sm text-fft-muted" for="ing-exp">Use by <span class="text-fft-outline">(optional)</span></label>
                  <input id="ing-exp" v-model="form.expiryDate" type="date" class="fft-input" />
                </div>

                <button type="submit" class="btn fft-btn-primary d-flex align-items-center justify-content-center gap-1"
                  :disabled="saving" data-testid="pantry-add">
                  <span class="material-symbols-outlined" style="font-size: 18px">add</span>
                  <span>Add to Pantry</span>
                </button>
              </form>
            </div>

            <!-- Right: list -->
            <div class="col-12 col-lg-8 d-flex flex-column gap-3">
              <!-- Search + category chips -->
              <div v-if="items.length" class="d-flex flex-column gap-2">
                <div class="position-relative">
                  <span class="material-symbols-outlined fft-search-icon">search</span>
                  <input v-model="search" type="search" class="form-control fft-search-input w-100"
                    placeholder="Search your pantry" aria-label="Search your pantry" />
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <button type="button" class="fft-chip" :class="{ active: activeCategory === 'all' }"
                    @click="activeCategory = 'all'">All</button>
                  <button v-for="c in usedCategories" :key="c.value" type="button" class="fft-chip"
                    :class="{ active: activeCategory === c.value }" @click="activeCategory = c.value">
                    {{ c.label }}
                  </button>
                </div>
              </div>

              <!-- Empty pantry -->
              <div v-if="!loading && items.length === 0" data-testid="pantry-empty"
                class="fft-card fft-card-bordered text-center py-5 d-flex flex-column align-items-center gap-2">
                <span class="material-symbols-outlined text-fft-outline" style="font-size: 40px">kitchen</span>
                <h3 class="fft-headline-sm m-0">Your pantry is empty</h3>
                <p class="fft-body-sm text-fft-muted m-0">Add a few ingredients to get recipe suggestions.</p>
              </div>

              <!-- No search matches -->
              <p v-else-if="!loading && groups.length === 0" class="fft-body-sm text-fft-muted text-center py-4 m-0">
                No ingredients match your search.
              </p>

              <!-- Grouped list -->
              <div v-for="g in groups" :key="g.meta.value" class="fft-card fft-card-bordered p-0 overflow-hidden">
                <div class="d-flex align-items-center gap-2 px-3 py-2 fft-group-head">
                  <span class="material-symbols-outlined text-fft-primary" style="font-size: 18px">{{ g.meta.icon }}</span>
                  <span class="fft-label-sm fft-upper fw-semibold">{{ g.meta.label }}</span>
                  <span class="fft-day-count ms-auto">{{ g.items.length }}</span>
                </div>

                <div v-for="item in g.items" :key="idOf(item)" class="fft-pantry-row" data-testid="pantry-item">
                  <!-- Editing: every field can change (PATCH /pantry/:itemId) -->
                  <form v-if="editingId === idOf(item)" class="w-100 d-flex flex-column gap-2"
                    data-testid="pantry-edit-form" @submit.prevent="saveEdit(item)" @keyup.esc="cancelEdit">
                    <div class="row g-2">
                      <div class="col-12 col-md-4">
                        <input v-model="editForm.name" class="fft-input" aria-label="Ingredient name" maxlength="60"
                          required data-testid="pantry-edit-name" />
                      </div>
                      <div class="col-6 col-md-2">
                        <input v-model.number="editForm.quantity" type="number" min="0" step="any" class="fft-input"
                          aria-label="Quantity" data-testid="pantry-edit-qty" />
                      </div>
                      <div class="col-6 col-md-2">
                        <select v-model="editForm.unit" class="fft-input" aria-label="Unit">
                          <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                        </select>
                      </div>
                      <div class="col-6 col-md-2">
                        <select v-model="editForm.category" class="fft-input" aria-label="Category">
                          <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
                        </select>
                      </div>
                      <div class="col-6 col-md-2">
                        <input v-model="editForm.expiryDate" type="date" class="fft-input" aria-label="Use by date" />
                      </div>
                    </div>
                    <div class="d-flex justify-content-end gap-1">
                      <button type="button" class="btn fft-btn-ghost" @click="cancelEdit">Cancel</button>
                      <button type="submit" class="btn fft-btn-primary" :disabled="saving"
                        data-testid="pantry-edit-save">Save</button>
                    </div>
                  </form>

                  <!-- Normal row -->
                  <template v-else>
                    <div class="d-flex align-items-center flex-wrap gap-2 flex-grow-1 fft-min-0">
                      <span class="fw-semibold text-fft-dark text-truncate">{{ item.name }}</span>
                      <span v-if="expiryPill(item)" class="fft-pill fw-semibold" :class="expiryPill(item).class">
                        {{ expiryPill(item).text }}
                      </span>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                      <span class="fft-label-md text-fft-muted me-2" data-testid="pantry-item-qty">
                        {{ item.quantity }} {{ item.unit }}
                      </span>
                      <button type="button" class="btn fft-btn-ghost d-flex align-items-center gap-1" :disabled="saving"
                        :aria-label="`Edit ${item.name}`" data-testid="pantry-edit" @click="startEdit(item)">
                        <span class="material-symbols-outlined" style="font-size: 16px">edit</span>
                        <span class="d-none d-sm-inline">Edit</span>
                      </button>
                      <button type="button" class="btn fft-btn-ghost d-flex align-items-center gap-1" :disabled="saving"
                        :aria-label="`Remove ${item.name}`" data-testid="pantry-delete" @click="onRemove(item)">
                        <span class="material-symbols-outlined" style="font-size: 16px">delete</span>
                        <span class="d-none d-sm-inline">Remove</span>
                      </button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Modal (teleported to <body>, so its position here doesn't matter) -->
    <suggestionsModal v-if="showSuggestions" :recipes="suggestions.recipes" :loading="suggestLoading"
      :error="suggestError" :message="suggestions.message" :pantry-count="suggestions.pantryCount"
      @search="fetchSuggestions" @close="showSuggestions = false" />
  </div>
</template>

<style scoped>
/* Fonts + icons (theme.css doesn't load these, and the page may be opened before the planner) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

/* ===== Extra colours this page needs that theme.css doesn't have ===== */
.fft-pantry {
  --fft-surface-mid: #EEEEE8;
  --fft-accent: #A23E18;      /* dark orange text, pairs with --fft-peach */
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

/* ===== Layout ===== */
.fft-main {
  min-height: 100vh;
}

.fft-container {
  max-width: 1280px;
}

.fft-controls {
  background: var(--fft-surface-low);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.fft-min-0 {
  min-width: 0;
}

/* ===== Typography ===== */
.fft-headline-md {
  font: 500 24px/32px 'Outfit', sans-serif;
}

.fft-headline-sm {
  font: 500 20px/28px 'Outfit', sans-serif;
}

h3.fft-headline-sm {
  font-weight: 600;
}

.fft-label-md {
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
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

.text-fft-dark {
  color: var(--fft-text) !important;
}

/* ===== Buttons (base .btn font/padding/radius come from theme.css) ===== */
.btn {
  border: 0;
  transition: background-color 0.15s, color 0.15s;
}

.fft-btn-primary {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.fft-btn-primary:hover {
  background: var(--fft-primary-hover);
  color: var(--fft-on-primary);
}

.fft-btn-ghost {
  background: transparent;
  color: var(--fft-muted);
  padding: 8px 12px;
}

.fft-btn-ghost:hover {
  color: var(--fft-text);
  background: transparent;
}

.fft-btn-lg {
  border-radius: var(--fft-radius-xl);
  padding: 10px 20px;
}

/* ===== Tag, tiles, round icons ===== */
.fft-tag {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fft-primary);
  background: var(--fft-primary-light);
  padding: 2px 8px;
  border-radius: 4px;
}

.fft-tile {
  background: var(--fft-card);
  padding: 16px;
  border-radius: var(--fft-radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.fft-round-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.fft-bg-green-light {
  background: var(--fft-primary-light);
}

.fft-bg-gray {
  background: var(--fft-surface-high);
}

.fft-bg-peach {
  background: var(--fft-peach);
}

/* ===== Cards ===== */
.fft-card {
  background: var(--fft-card);
  padding: 16px;
  border-radius: var(--fft-radius-2xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.fft-card-lg {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.fft-card-bordered {
  border: 1px solid rgba(194, 200, 192, 0.4);
}

/* ===== Pills ===== */
.fft-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}

.fft-pill-gray {
  background: var(--fft-surface-high);
  color: var(--fft-secondary-text);
}

.fft-pill-peach {
  background: var(--fft-peach);
  color: var(--fft-peach-text);
}

.fft-pill-amber {
  background: var(--fft-amber);
  color: var(--fft-amber-text);
}

/* small count badge on each category header */
.fft-day-count {
  font: 600 11px/14px 'Inter', sans-serif;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--fft-surface-mid);
  color: var(--fft-muted);
}

/* ===== Search + category chips ===== */
.fft-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--fft-muted);
  pointer-events: none;
}

.fft-search-input {
  padding: 8px 16px 8px 40px;
  background: var(--fft-card);
  border: 0;
  border-radius: var(--fft-radius);
  font: 400 13px/20px 'Inter', sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}

.fft-search-input:focus {
  box-shadow: 0 0 0 2px var(--fft-primary);
  background: var(--fft-card);
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

/* ===== Form inputs ===== */
.fft-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--fft-surface-low);
  border: 1px solid transparent;
  border-radius: var(--fft-radius);
  font: 400 14px/20px 'Inter', sans-serif;
  color: var(--fft-text);
  transition: border-color 0.15s, background-color 0.15s;
}

.fft-input:focus {
  outline: none;
  background: var(--fft-card);
  border-color: var(--fft-primary);
}

/* ===== Pantry list ===== */
.fft-group-head {
  background: var(--fft-surface-low);
  color: var(--fft-secondary-text);
}

.fft-pantry-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(194, 200, 192, 0.4);
}

.fft-pantry-row:first-of-type {
  border-top: 0;
}

/* ===== Loading spinner ===== */
.fft-spin {
  animation: fft-spin 1s linear infinite;
}

@keyframes fft-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>