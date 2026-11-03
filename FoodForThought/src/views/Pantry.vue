<script setup>
import { ref, computed, onMounted } from 'vue'
import { createApi, errorMessage } from '@/services/api'
import { toISODate, daysUntil } from '@/utils/dates'
import { PANTRY_UNITS as UNITS, PANTRY_CATEGORIES as CATEGORIES, formatQty } from '@/constants/pantry'
import { categoryStyle } from '@/constants/categoryColors'
import suggestionsModal from '../components/SuggestionModal.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import PageIntro from '@/components/ui/PageIntro.vue'
import { useConfirm } from '@/composables/useConfirm'
// Colours, fonts, h1/h2/h3, .btn and .form-control come from the team's shared theme.css (.fft-page).
// The page-specific styles are in the <style scoped> block at the bottom.

/* ---------- API ---------- */
// Pantry requests go to the Express router mounted at /pantry (server/src/router/pantry.js).
// createApi (services/api.js) sends the login token and logs out on 401.
const api = createApi('/pantry')
const confirm = useConfirm()

// Works whether the model sends `id` or Mongo's `_id`
const idOf = (item) => item.id || item._id

/* ---------- Expiry ---------- */
// UNITS and CATEGORIES come from constants/pantry.js (shared with the shopping list)
function expiryPill(item) {
  // Nothing left (e.g. used up by cooking a planned meal): say so instead of "0 pcs" with a use-by date
  if (item.quantity <= 0) return { text: 'Used up', class: 'fft-pill-gray' }
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
    errorMsg.value = errorMessage(err, 'Could not load your pantry.')
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
    errorMsg.value = errorMessage(err, 'Could not save your change. Please try again.')
    return false
  } finally {
    saving.value = false
  }
}

/* ---------- Metrics ---------- */
// Items with some left: what "What can I cook?" searches with (same rule as the server's getPantryNames)
const inStockCount = computed(() => items.value.filter((i) => i.quantity > 0).length)

const expiringSoon = computed(() => items.value.filter((i) => {
  if (i.quantity <= 0) return false // nothing left to use
  const n = daysUntil(i.expiryDate)
  return n !== null && n <= 3
}))

const metrics = computed(() => [
  { label: 'Items in Pantry', value: String(items.value.length), icon: 'inventory_2', bg: 'fft-bg-green-light text-fft-primary' },
  { label: 'Categories', value: String(new Set(items.value.map((i) => i.category)).size), icon: 'category', bg: 'fft-bg-gray text-fft-muted' },
  { label: 'Use Within 3 Days', value: String(expiringSoon.value.length), icon: 'schedule', bg: 'fft-bg-peach text-fft-secondary', action: toggleUseSoon },
])

/* ---------- Search + category filter ---------- */
const search = ref('')
const activeCategory = ref('all')

// activeCategory: 'all', 'soon' (use within 3 days) or a category value
const expiringIds = computed(() => new Set(expiringSoon.value.map(idOf)))
const matchesFilter = (i) =>
  activeCategory.value === 'all' ||
  (activeCategory.value === 'soon' ? expiringIds.value.has(idOf(i)) : i.category === activeCategory.value)

const visibleItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value.filter((i) => matchesFilter(i) && (!q || i.name.toLowerCase().includes(q)))
})

// Clicking the "Use within 3 days" tile (or chip) shows just those items; clicking again shows everything
function toggleUseSoon() {
  activeCategory.value = activeCategory.value === 'soon' ? 'all' : 'soon'
}

/* ---------- Add form: always open on desktop, folded behind a button on phones ---------- */
const showAddForm = ref(false)

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
    const merged = items.value.find((i) => i.name.toLowerCase() === name.toLowerCase()) ||
      items.value.find((i) => i.normalizedName && name.toLowerCase().startsWith(i.normalizedName))
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

/* ---------- Quick +/- buttons on each row ---------- */
// Used one egg? Tap minus instead of opening the edit form. Steps by 1 for pcs, else by a
// sensible amount for the unit. Never below 0 ("Used up").
const STEP = { pcs: 1, g: 100, kg: 0.5, ml: 100, l: 0.5, tsp: 1, tbsp: 1, cup: 0.5 }
function adjust(item, direction) {
  const step = STEP[item.unit] || 1
  const quantity = Math.max(0, Math.round((item.quantity + direction * step) * 1000) / 1000)
  if (quantity === item.quantity) return
  return saveChange(api.patch(`/${idOf(item)}`, { quantity }))
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
      suggestError.value = errorMessage(err, 'Could not load suggestions.')
    }
  } finally {
    if (requestId === latestSuggest) suggestLoading.value = false
  }
}

/* ---------- Remove ---------- */
async function onRemove(item) {
  const ok = await confirm({
    title: `Remove ${item.name}?`,
    message: item.quantity > 0
      ? `You'll lose the ${formatQty(item.quantity, item.unit)} you have recorded. To log using some, lower the amount with the minus button instead.`
      : 'It will no longer show in your pantry. Your shopping list will ask you to buy it when a meal needs it.',
    confirmText: 'Remove item',
  })
  if (!ok) return
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

          <!-- Metric tiles (three, filling the row). "Use within 3 days" is a button that filters the list. -->
          <div class="row g-2 g-md-3 pt-1">
            <div v-for="m in metrics" :key="m.label" class="col-4">
              <component :is="m.action ? 'button' : 'div'" :type="m.action ? 'button' : undefined"
                class="fft-tile d-flex align-items-center justify-content-between h-100 w-100 text-start"
                :class="{ 'fft-tile--action': m.action, 'is-active': m.action && activeCategory === 'soon' }"
                :aria-pressed="m.action ? activeCategory === 'soon' : undefined"
                :title="m.action ? 'Show only items to use within 3 days' : undefined" @click="m.action && m.action()">
                <div class="d-flex flex-column">
                  <span class="fft-label-sm fft-upper text-fft-muted">{{ m.label }}</span>
                  <span class="fft-headline-md">{{ m.value }}</span>
                </div>
                <div class="fft-round-icon d-none d-md-flex" :class="m.bg">
                  <span class="material-symbols-outlined" style="font-size: 20px">{{ m.icon }}</span>
                </div>
              </component>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ PANTRY ============ -->
      <section class="px-4 py-4">
        <div class="container-fluid fft-container">
          <PageIntro page="pantry" class="mb-4" />

          <AppAlert v-if="errorMsg" tone="error" title="That didn't work" @dismiss="errorMsg = ''">
            {{ errorMsg }}
          </AppAlert>

          <div class="row g-4 align-items-start">
            <!-- Left: add form (stays in view on desktop; folded behind a button on phones so the list comes first) -->
            <div class="col-12 col-lg-4 fft-sticky">
              <button type="button" class="btn fft-btn-outline w-100 d-flex d-lg-none align-items-center justify-content-center gap-1"
                :aria-expanded="showAddForm" aria-controls="pantry-add-form" data-testid="pantry-form-toggle"
                @click="showAddForm = !showAddForm">
                <span class="material-symbols-outlined" style="font-size: 18px">{{ showAddForm ? 'expand_less' : 'add' }}</span>
                {{ showAddForm ? 'Hide form' : 'Add ingredient' }}
              </button>
              <form id="pantry-add-form" class="fft-card fft-card-bordered fft-card-lg flex-column gap-3 d-lg-flex mt-2 mt-lg-0"
                :class="showAddForm ? 'd-flex' : 'd-none'" data-testid="pantry-form" @submit.prevent="onAdd">
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
                    <input id="ing-qty" v-model.number="form.quantity" type="number" min="0.01" step="any"
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
                <div class="fft-chip-row" role="group" aria-label="Filter by category">
                  <button type="button" class="fft-chip" :class="{ active: activeCategory === 'all' }"
                    @click="activeCategory = 'all'">All</button>
                  <button v-if="expiringSoon.length" type="button" class="fft-chip fft-chip--soon"
                    :class="{ active: activeCategory === 'soon' }" @click="toggleUseSoon">
                    Use soon ({{ expiringSoon.length }})
                  </button>
                  <button v-for="c in usedCategories" :key="c.value" type="button" class="fft-chip fft-chip--cat"
                    :class="{ active: activeCategory === c.value }" :style="categoryStyle(c.value)"
                    @click="activeCategory = c.value">
                    <span class="fft-chip-dot" aria-hidden="true"></span>{{ c.label }}
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
                Nothing matches. Try another search or filter.
              </p>

              <!-- Grouped list -->
              <!-- each category is colour-coded (constants/categoryColors.js, same colours as the Shopping List) -->
              <div v-for="g in groups" :key="g.meta.value" class="fft-card fft-card-bordered p-0 overflow-hidden fft-group"
                :style="categoryStyle(g.meta.value)">
                <div class="d-flex align-items-center gap-2 px-3 py-2 fft-group-head">
                  <span class="fft-group-icon" aria-hidden="true">
                    <span class="material-symbols-outlined">{{ g.meta.icon }}</span>
                  </span>
                  <h3 class="fft-group-title">{{ g.meta.label }}</h3>
                  <span class="fft-group-count ms-auto">{{ g.items.length }} {{ g.items.length === 1 ? 'item' : 'items' }}</span>
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
                        <input v-model.number="editForm.quantity" type="number" min="0" step="any" class="fft-input" required
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
                    <div class="d-flex align-items-center gap-2 flex-grow-1 fft-min-0">
                      <span class="fw-semibold text-fft-dark text-truncate">{{ item.name }}</span>
                      <span v-if="expiryPill(item)" class="fft-pill fw-semibold" :class="expiryPill(item).class">
                        {{ expiryPill(item).text }}
                      </span>
                    </div>
                    <div class="d-flex align-items-center gap-1 flex-shrink-0">
                      <div class="fft-stepper" role="group" :aria-label="`Quantity of ${item.name}`">
                        <button type="button" class="fft-stepper-btn" :disabled="saving || item.quantity <= 0"
                          :aria-label="`Less ${item.name}`" @click="adjust(item, -1)">
                          <span class="material-symbols-outlined" style="font-size: 16px">remove</span>
                        </button>
                        <span class="fft-label-md text-fft-dark fw-semibold text-nowrap fft-stepper-value"
                          data-testid="pantry-item-qty">{{ item.quantity }} {{ item.unit }}</span>
                        <button type="button" class="fft-stepper-btn" :disabled="saving"
                          :aria-label="`More ${item.name}`" @click="adjust(item, 1)">
                          <span class="material-symbols-outlined" style="font-size: 16px">add</span>
                        </button>
                      </div>
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
      :error="suggestError" :message="suggestions.message" :pantry-count="inStockCount"
      @search="fetchSuggestions" @close="showSuggestions = false" />
  </div>
</template>

<style scoped>
/* ===== Quick +/- quantity buttons on each row ===== */
.fft-stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 4px;
  padding: 2px;
  border-radius: 9999px;
  background: var(--fft-surface-mid);
}
.fft-stepper-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--fft-primary, #32533c);
}
.fft-stepper-btn:hover:not(:disabled) { background: #fff; }
.fft-stepper-btn:disabled { opacity: 0.35; }
.fft-stepper-value { min-width: 56px; text-align: center; }

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
  min-height: 100dvh;
}

.fft-container {
  /* same content width as the planner and shopping list */
  max-width: 1140px;
  padding-left: 0;
  padding-right: 0;
}

@media (min-width: 992px) {
  .fft-sticky {
    position: sticky;
    top: 1rem;
  }
}

/* "Use within 3 days" tile works as a filter button */
.fft-tile--action {
  border: 1px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.fft-tile--action:hover,
.fft-tile--action.is-active {
  border-color: var(--fft-secondary, #a23e18);
}

/* category chips: wrap on desktop, one sideways-scrolling row on phones */
.fft-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 575.98px) {
  .fft-chip-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .fft-chip-row::-webkit-scrollbar {
    display: none;
  }

  .fft-chip-row .fft-chip {
    flex-shrink: 0;
  }

  .fft-tile {
    padding: 12px;
  }

  .fft-tile .fft-label-sm {
    font-size: 10px;
    line-height: 13px;
  }
}

.fft-chip--soon {
  background: var(--fft-peach, #ffdbcf);
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

.fft-btn-outline {
  border: 1px dashed var(--fft-primary);
  border-radius: var(--fft-radius-xl);
  padding: 10px 16px;
  background: var(--fft-card);
  color: var(--fft-primary);
  font: 600 14px/20px 'Inter', sans-serif;
}

.fft-btn-outline:hover {
  background: var(--fft-surface-low);
  color: var(--fft-primary);
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
.fft-chip--cat { display: inline-flex; align-items: center; gap: 6px; }
.fft-chip-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cat-ink); }
.fft-chip--cat.active { background: var(--cat-ink) !important; color: #fff !important; }
.fft-chip--cat.active .fft-chip-dot { background: #fff; }

.fft-group {
  border-left: 5px solid var(--cat-ink) !important;
}
.fft-group-head {
  background: var(--cat-wash);
}
.fft-group-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--cat-ink);
  color: #fff;
}
.fft-group-icon .material-symbols-outlined { font-size: 18px; }
.fft-group-title {
  margin: 0;
  font: 600 17px/24px 'Outfit', sans-serif;
  color: var(--cat-ink);
}
.fft-group-count {
  padding: 2px 10px;
  border-radius: 9999px;
  background: #fff;
  color: var(--cat-ink);
  font: 600 12px/18px 'Inter', sans-serif;
}

.fft-pantry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(194, 200, 192, 0.4);
}

.fft-pantry-row:first-of-type {
  border-top: 0;
}

/* phones: name (and its expiry pill) on top, the +/- and buttons on a second line,
   so names aren't cut down to "To…" next to the quantity controls */
@media (max-width: 575.98px) {
  .fft-pantry-row {
    flex-wrap: wrap;
  }

  .fft-pantry-row > .flex-grow-1 {
    flex-basis: 100%;
  }

  .fft-pantry-row > .flex-shrink-0 {
    width: 100%;
    justify-content: space-between;
  }
}

/* ===== Loading spinner ===== */
.fft-spin {
  animation: fft-spin 0.7s linear infinite;
}

@keyframes fft-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>