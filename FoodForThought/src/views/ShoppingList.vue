<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'

/* ---------------------------------------------------------------
   Category display info, listed in SHOPPING ORDER (must match
   SHOPPING_ORDER in backend/services/shoppingListBuilder.js):
   shelf-stable first, chilled and frozen last so they stay cold.
---------------------------------------------------------------- */
const CATEGORY_META = [
  { id: 'canned-sauces', title: 'Canned Goods & Sauces', icon: 'soup_kitchen', tone: 'neutral' },
  { id: 'grains-noodles', title: 'Rice, Grains & Noodles', icon: 'rice_bowl', tone: 'neutral' },
  { id: 'spices-condiments', title: 'Spices & Condiments', icon: 'grain', tone: 'neutral' },
  { id: 'other', title: 'Other', icon: 'shopping_basket', tone: 'neutral' },
  { id: 'produce', title: 'Fruit & Vegetables', icon: 'nutrition', tone: 'green' },
  { id: 'dairy-eggs', title: 'Dairy & Eggs', icon: 'egg', tone: 'amber', chilled: true },
  { id: 'meat-seafood', title: 'Meat & Seafood', icon: 'set_meal', tone: 'peach', chilled: true },
  { id: 'frozen', title: 'Frozen', icon: 'ac_unit', tone: 'blue', chilled: true },
]
const UNIT_OPTIONS = ['piece', 'g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'pack', 'bottle', 'can']

/* ---------------------------------------------------------------
   Week handling. The week lives in the URL (?start=2026-10-19) so the
   planner can link straight to the same week's list.
---------------------------------------------------------------- */
const route = useRoute()
const router = useRouter()

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // getDay(): 0 = Sunday
  return d
}
function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const queryStart = /^\d{4}-\d{2}-\d{2}$/.test(route.query.start ?? '') ? route.query.start : null
const weekStart = ref(toISODate(mondayOf(queryStart ? fromISODate(queryStart) : new Date())))

function shiftWeek(weeks) {
  const d = fromISODate(weekStart.value)
  d.setDate(d.getDate() + weeks * 7)
  weekStart.value = toISODate(d)
}

const weekLabel = computed(() => {
  const start = fromISODate(weekStart.value)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d) => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`
})

/* ---------------------------------------------------------------
   Loading the list
---------------------------------------------------------------- */
const list = ref(null) // { weekStart, items: [], generatedAt }
const loading = ref(false)
const generating = ref(false)
const error = ref('')

const errorMessage = (err) => err.response?.data?.message || 'Something went wrong. Please try again.'

async function loadList() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/shopping-list', { params: { start: weekStart.value } })
    list.value = data
  } catch (err) {
    error.value = errorMessage(err)
    list.value = null
  } finally {
    loading.value = false
  }
}

async function generateList() {
  generating.value = true
  error.value = ''
  try {
    const { data } = await api.post('/shopping-list/generate', { start: weekStart.value })
    list.value = data
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    generating.value = false
  }
}

onMounted(loadList)
watch(weekStart, (start) => {
  router.replace({ query: { ...route.query, start } })
  loadList()
})

/* ---------------------------------------------------------------
   Derived data
---------------------------------------------------------------- */
const items = computed(() => list.value?.items ?? [])
const hasList = computed(() => Boolean(list.value?.generatedAt) || items.value.length > 0)

// quantity 0 = the pantry already covers it, nothing to buy.
const isStocked = (it) => it.quantity <= 0
const toBuyItems = computed(() => items.value.filter((it) => !isStocked(it)))

const total = computed(() => toBuyItems.value.length)
const bought = computed(() => toBuyItems.value.filter((it) => it.purchased).length)
const percent = computed(() => (total.value === 0 ? 0 : Math.round((bought.value / total.value) * 100)))
const pantryItems = computed(() => items.value.filter((it) => it.pantryQuantity > 0))

// Unique recipes this week's list was built from.
const recipeTitles = computed(() => {
  const titles = new Set()
  items.value.forEach((it) => (it.usedIn || []).forEach((u) => u.title && titles.add(u.title)))
  return [...titles]
})
const hasAutoItems = computed(() => items.value.some((it) => it.source !== 'manual'))

/* ---------------------------------------------------------------
   Filters
---------------------------------------------------------------- */
const filter = ref('all') // 'all' | 'tobuy' | 'pantry'
const hidePantry = ref(false)

const filters = computed(() => [
  { key: 'all', label: 'All Items', count: items.value.length },
  { key: 'tobuy', label: 'To Buy', count: total.value - bought.value },
  { key: 'pantry', label: 'In Pantry', count: pantryItems.value.length },
])

function isVisible(it) {
  if (hidePantry.value && isStocked(it)) return false
  if (filter.value === 'tobuy') return !isStocked(it) && !it.purchased
  if (filter.value === 'pantry') return it.pantryQuantity > 0
  return true
}

// Items grouped into sections, in shopping order, hiding empty sections.
const sections = computed(() =>
  CATEGORY_META.map((cat) => {
    const inCategory = items.value.filter((it) => (it.category || 'other') === cat.id)
    return { ...cat, count: inCategory.length, visible: inCategory.filter(isVisible) }
  }).filter((s) => s.visible.length > 0),
)

// Right-hand "Shopping order" card: only sections that still have things to buy.
const routeSteps = computed(() =>
  CATEGORY_META.map((cat) => ({
    ...cat,
    remaining: toBuyItems.value.filter((it) => (it.category || 'other') === cat.id && !it.purchased).length,
  })).filter((s) => s.remaining > 0),
)

/* ---------------------------------------------------------------
   Formatting
---------------------------------------------------------------- */
function formatQty(qty, unit) {
  if (unit === 'piece') return qty === 1 ? '1 piece' : `${qty} pieces`
  if (unit === 'clove') return qty === 1 ? '1 clove' : `${qty} cloves`
  return `${qty} ${unit}`
}
function itemMeta(it) {
  if (isStocked(it)) return `In pantry (${formatQty(it.pantryQuantity, it.unit)} needed)`
  const buy = formatQty(it.quantity, it.unit)
  return it.pantryQuantity > 0 ? `Buy ${buy} · ${formatQty(it.pantryQuantity, it.unit)} from pantry` : buy
}
function recipeTags(it) {
  const titles = (it.usedIn || []).map((u) => u.title)
  return titles.length > 2 ? [...titles.slice(0, 2), `+${titles.length - 2} more`] : titles
}

/* ---------------------------------------------------------------
   Tick / untick: update the screen first ("optimistic"), then tell
   the server, and undo the change if the server says no.
---------------------------------------------------------------- */
async function togglePurchased(it) {
  const next = !it.purchased
  it.purchased = next
  try {
    const { data } = await api.patch(`/shopping-list/items/${it._id}`, { purchased: next })
    Object.assign(it, data)
  } catch (err) {
    it.purchased = !next
    error.value = errorMessage(err)
  }
}

/* ---------------------------------------------------------------
   Manual items
---------------------------------------------------------------- */
const newItem = ref({ name: '', quantity: 1, unit: 'piece', category: 'other' })
const adding = ref(false)

async function addItem() {
  const name = newItem.value.name.trim()
  if (!name || adding.value) return
  adding.value = true
  error.value = ''
  try {
    const { data } = await api.post('/shopping-list/items', { start: weekStart.value, ...newItem.value, name })
    if (!list.value) list.value = { items: [], generatedAt: null }
    list.value.items.push(data)
    newItem.value = { ...newItem.value, name: '', quantity: 1 }
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    adding.value = false
  }
}

async function removeItem(it) {
  const index = list.value.items.indexOf(it)
  list.value.items.splice(index, 1)
  try {
    await api.delete(`/shopping-list/items/${it._id}`)
  } catch (err) {
    list.value.items.splice(index, 0, it) // put it back
    error.value = errorMessage(err)
  }
}

const printList = () => window.print()
</script>

<template>
  <main class="sw-page">
    <!-- ===================== Summary & control deck ===================== -->
    <section class="sw-hero">
      <div class="sw-blob sw-blob--green"></div>
      <div class="sw-blob sw-blob--peach"></div>

      <div class="sw-hero-inner">
        <div class="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-between gap-4">
          <div class="sw-hero-copy d-flex flex-column gap-1">
            <div class="d-flex align-items-center flex-wrap gap-2">
              <span v-if="recipeTitles.length" class="sw-pill sw-pill--hero">
                <span class="sw-dot sw-dot--primary"></span>
                From {{ recipeTitles.length }} {{ recipeTitles.length === 1 ? 'recipe' : 'recipes' }} in your meal plan
              </span>
              <div class="sw-weeknav sw-no-print" role="group" aria-label="Choose week">
                <button type="button" class="sw-iconbtn" aria-label="Previous week" @click="shiftWeek(-1)">
                  <span class="material-symbols-outlined sw-ico-18">chevron_left</span>
                </button>
                <span class="sw-label-md sw-text-tertiary">Week of {{ weekLabel }}</span>
                <button type="button" class="sw-iconbtn" aria-label="Next week" @click="shiftWeek(1)">
                  <span class="material-symbols-outlined sw-ico-18">chevron_right</span>
                </button>
              </div>
              <span class="sw-label-md sw-text-tertiary sw-print-only">Week of {{ weekLabel }}</span>
            </div>
            <h1 class="sw-headline-lg">Shopping List</h1>
            <p class="sw-body-md sw-text-variant">
              Built from this week's meal plan: quantities scaled to your servings, duplicates combined and pantry
              stock subtracted, ordered so chilled items go in your basket last.
            </p>
          </div>

          <!-- Progress + actions -->
          <div
            v-if="hasList"
            class="sw-hero-actions d-flex flex-column flex-sm-row flex-lg-column flex-xl-row align-items-stretch align-items-sm-center gap-3 w-100"
          >
            <div class="sw-card d-flex align-items-center gap-3 p-3">
              <div class="sw-ring" role="img" :aria-label="`${percent}% bought`">
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <path class="sw-ring-track" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path
                    class="sw-ring-bar"
                    :stroke-dasharray="`${percent}, 100`"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div class="sw-ring-label"><span class="sw-label-sm">{{ percent }}%</span></div>
              </div>
              <div class="d-flex flex-column">
                <span class="sw-label-lg">{{ bought }} of {{ total }} bought</span>
                <span class="sw-label-sm sw-text-outline">{{ pantryItems.length }} covered by your pantry</span>
              </div>
            </div>

            <div class="d-flex align-items-center gap-2 sw-no-print">
              <button type="button" class="btn sw-btn sw-btn-highest shadow-sm flex-fill flex-sm-grow-0" @click="printList">
                <span class="material-symbols-outlined sw-ico-18">print</span>
                <span>Print</span>
              </button>
              <button
                type="button"
                class="btn sw-btn sw-btn-secondary shadow-sm flex-fill flex-sm-grow-0"
                :disabled="generating"
                title="Rebuild from your meal plan. Ticked and manually added items are kept."
                @click="generateList"
              >
                <span class="material-symbols-outlined sw-ico-18" :class="{ 'sw-spin': generating }">refresh</span>
                <span>{{ generating ? 'Updating…' : 'Update from meal plan' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Quick filter bar -->
        <div v-if="items.length" class="sw-filterbar d-flex flex-wrap align-items-center justify-content-between gap-3 sw-no-print">
          <div class="d-flex align-items-center flex-wrap gap-2">
            <button
              v-for="f in filters"
              :key="f.key"
              type="button"
              class="btn sw-btn sw-btn--sm"
              :class="filter === f.key ? 'sw-btn-primary shadow-sm' : 'sw-btn-tonal'"
              :aria-pressed="filter === f.key"
              @click="filter = f.key"
            >
              {{ f.label }} ({{ f.count }})
            </button>
          </div>
          <label class="sw-check-label d-flex align-items-center gap-1">
            <input v-model="hidePantry" type="checkbox" class="form-check-input sw-check sw-check--sm" />
            <span class="sw-label-md sw-text-variant">Hide items already in my pantry</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Error banner -->
    <div v-if="error" class="sw-alert sw-no-print" role="alert">
      <span class="material-symbols-outlined sw-ico-20">error</span>
      <span class="sw-body-sm flex-grow-1">{{ error }}</span>
      <button type="button" class="sw-iconbtn" aria-label="Dismiss" @click="error = ''">
        <span class="material-symbols-outlined sw-ico-18">close</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="sw-card sw-empty">
      <span class="material-symbols-outlined sw-ico-22 sw-spin sw-text-primary">progress_activity</span>
      <p class="sw-body-md sw-text-variant m-0">Loading your shopping list…</p>
    </div>

    <!-- No list yet for this week -->
    <div v-else-if="!hasList" class="sw-card sw-empty">
      <span class="material-symbols-outlined sw-empty-icon">shopping_cart</span>
      <h2 class="sw-headline-sm">No shopping list for this week yet</h2>
      <p class="sw-body-md sw-text-variant m-0">
        Build one from the recipes in your meal plan. You can add your own items afterwards.
      </p>
      <button type="button" class="btn sw-btn sw-btn-primary mt-2" :disabled="generating" @click="generateList">
        <span class="material-symbols-outlined sw-ico-18" :class="{ 'sw-spin': generating }">
          {{ generating ? 'refresh' : 'playlist_add' }}
        </span>
        <span>{{ generating ? 'Building…' : 'Build from meal plan' }}</span>
      </button>
    </div>

    <!-- ===================== Main grid ===================== -->
    <div v-else class="row g-4 align-items-start">
      <!-- ---------- Left: items by section ---------- -->
      <div class="col-12 col-lg-8">
        <div class="d-flex flex-column gap-4">
          <!-- Quick add -->
          <form class="sw-card sw-addform p-3 sw-no-print" @submit.prevent="addItem">
            <div class="sw-addbox">
              <span class="material-symbols-outlined sw-ico-20 sw-text-outline">add_circle</span>
              <input
                v-model="newItem.name"
                type="text"
                class="form-control sw-bare-input"
                placeholder="Add your own item (e.g. dish soap, oat milk)"
                aria-label="Item name"
                maxlength="80"
              />
            </div>
            <div class="d-flex align-items-center flex-wrap gap-1">
              <input
                v-model.number="newItem.quantity"
                type="number"
                min="0.01"
                step="any"
                class="form-control sw-select sw-qty"
                aria-label="Quantity"
              />
              <select v-model="newItem.unit" class="form-select sw-select" aria-label="Unit">
                <option v-for="u in UNIT_OPTIONS" :key="u" :value="u">{{ u }}</option>
              </select>
              <select v-model="newItem.category" class="form-select sw-select" aria-label="Section">
                <option v-for="c in CATEGORY_META" :key="c.id" :value="c.id">{{ c.title }}</option>
              </select>
              <button type="submit" class="btn sw-btn sw-btn-primary flex-shrink-0" :disabled="adding || !newItem.name.trim()">
                Add
              </button>
            </div>
          </form>

          <!-- Meal plan had nothing to add -->
          <p v-if="!hasAutoItems" class="sw-card sw-body-sm sw-text-variant p-3 m-0">
            Your meal plan for this week has no recipe ingredients yet. Skipped meals and custom meals don't add
            anything. Add recipes in the planner, then press <strong>Update from meal plan</strong>.
          </p>

          <!-- Sections -->
          <section v-for="section in sections" :key="section.id" class="sw-card sw-aisle">
            <div class="sw-aisle-head">
              <div class="d-flex align-items-center gap-2">
                <span class="sw-aisle-icon" :class="`sw-aisle-icon--${section.tone}`">
                  <span class="material-symbols-outlined sw-ico-18">{{ section.icon }}</span>
                </span>
                <div>
                  <h2 class="sw-headline-sm">{{ section.title }}</h2>
                  <span v-if="section.chilled" class="sw-label-sm sw-text-secondary">Keep chilled</span>
                </div>
              </div>
              <span class="sw-pill">{{ section.count }} {{ section.count === 1 ? 'item' : 'items' }}</span>
            </div>

            <div class="sw-aisle-body">
              <label
                v-for="it in section.visible"
                :key="it._id"
                class="sw-row"
                :class="{ 'sw-row--stocked': isStocked(it), 'is-bought': it.purchased }"
              >
                <div class="sw-row-main">
                  <input
                    type="checkbox"
                    class="form-check-input sw-check"
                    :checked="it.purchased || isStocked(it)"
                    :disabled="isStocked(it)"
                    :aria-label="`Bought ${it.name}`"
                    @change="togglePurchased(it)"
                  />
                  <div class="sw-row-text">
                    <div class="d-flex align-items-center flex-wrap gap-1">
                      <span class="sw-item-name">{{ it.name }}</span>
                      <span v-if="isStocked(it)" class="sw-badge-stock">In Pantry</span>
                    </div>
                    <span class="sw-meta">{{ itemMeta(it) }}</span>
                  </div>
                </div>

                <div class="sw-tags">
                  <template v-if="it.source === 'manual'">
                    <span class="sw-pill">Added by you</span>
                    <button
                      type="button"
                      class="sw-iconbtn sw-no-print"
                      :aria-label="`Remove ${it.name}`"
                      @click.prevent="removeItem(it)"
                    >
                      <span class="material-symbols-outlined sw-ico-18">delete</span>
                    </button>
                  </template>
                  <template v-else>
                    <span v-for="tag in recipeTags(it)" :key="tag" class="sw-pill">
                      <span class="sw-dot sw-dot--primary"></span>
                      {{ tag }}
                    </span>
                  </template>
                </div>
              </label>
            </div>
          </section>

          <p v-if="items.length && sections.length === 0" class="sw-body-md sw-text-variant text-center py-4 m-0">
            Nothing to show with the current filters.
          </p>
        </div>
      </div>

      <!-- ---------- Right: shopping order + pantry ---------- -->
      <div class="col-12 col-lg-4 sw-no-print">
        <div class="d-flex flex-column gap-4">
          <!-- Shopping order -->
          <section class="sw-card d-flex flex-column gap-3 p-4">
            <div class="d-flex align-items-center gap-1">
              <span class="material-symbols-outlined sw-ico-22 sw-text-primary">route</span>
              <h3 class="sw-headline-sm">Shopping Order</h3>
            </div>
            <p class="sw-body-sm sw-text-variant">
              Shelf-stable items first, chilled and frozen items last so they stay cold on the way home.
            </p>

            <div v-if="routeSteps.length" class="sw-timeline">
              <div v-for="(step, i) in routeSteps" :key="step.id" class="sw-step">
                <span class="sw-step-dot" :class="i === 0 ? 'sw-step-dot--primary' : step.chilled && 'sw-step-dot--secondary'"></span>
                <div class="d-flex flex-column">
                  <span class="sw-label-md">{{ i + 1 }}. {{ step.title }}</span>
                  <span class="sw-body-sm" :class="step.chilled ? 'sw-text-secondary' : 'sw-text-outline'">
                    {{ step.remaining }} left to buy{{ step.chilled ? ' · keep chilled' : '' }}
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="sw-label-md sw-text-primary m-0 d-flex align-items-center gap-1">
              <span class="material-symbols-outlined sw-ico-18">check_circle</span>
              Everything's bought for this week.
            </p>
          </section>

          <!-- Pantry cross-check -->
          <section class="sw-card sw-card--low d-flex flex-column gap-3 p-4">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-1">
                <span class="material-symbols-outlined sw-ico-22 sw-text-primary">kitchen</span>
                <h3 class="sw-headline-sm">From Your Pantry</h3>
              </div>
              <span class="sw-pill sw-pill--green">{{ pantryItems.length }}</span>
            </div>

            <template v-if="pantryItems.length">
              <p class="sw-body-sm sw-text-variant">Already at home, so you don't need to buy these amounts:</p>
              <div class="d-flex flex-column gap-2">
                <div v-for="it in pantryItems" :key="it._id" class="sw-saving">
                  <div class="d-flex align-items-center gap-2 sw-saving-text">
                    <span class="material-symbols-outlined sw-ico-20 sw-text-primary flex-shrink-0">check_circle</span>
                    <div class="sw-saving-text">
                      <span class="sw-label-md text-truncate">{{ it.name }}</span>
                      <span class="sw-label-sm sw-text-outline">
                        {{ isStocked(it) ? 'Fully covered' : `Still buy ${formatQty(it.quantity, it.unit)}` }}
                      </span>
                    </div>
                  </div>
                  <span class="sw-label-sm sw-text-primary fw-semibold flex-shrink-0">
                    {{ formatQty(it.pantryQuantity, it.unit) }}
                  </span>
                </div>
              </div>
            </template>
            <p v-else class="sw-body-sm sw-text-variant m-0">
              Nothing in this list is covered by your pantry yet. Add what you have at home on the Pantry page, then
              update the list.
            </p>
          </section>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   Bootstrap handles layout; these are the design tokens + components.
   Tokens live on .sw-page (not :root) so they don't leak into other views.
   ========================================================================== */
.sw-page {
  --sw-background: #fafaf3;
  --sw-on-surface: #1a1c18;
  --sw-on-surface-variant: #424842;
  --sw-outline: #727972;

  --sw-primary: #32533c;
  --sw-primary-container: #4a6b53;
  --sw-on-primary: #ffffff;
  --sw-primary-fixed: #c7ecce;
  --sw-on-primary-fixed: #01210f;

  --sw-secondary: #a23e18;
  --sw-secondary-container: #fe8357;
  --sw-on-secondary: #ffffff;
  --sw-on-secondary-container: #6f2000;
  --sw-secondary-fixed: #ffdbcf;
  --sw-on-secondary-fixed: #390c00;

  --sw-tertiary: #6b4400;
  --sw-tertiary-fixed: #ffddb5;
  --sw-on-tertiary-fixed: #2a1800;

  --sw-error: #ba1a1a;
  --sw-error-container: #ffdad6;

  --sw-surface-variant: #e3e3dc;
  --sw-surface-dim: #dadad4;
  --sw-surface-lowest: #ffffff;
  --sw-surface-low: #f4f4ed;
  --sw-surface: #eeeee8;
  --sw-surface-high: #e8e9e2;
  --sw-surface-highest: #e3e3dc;

  --sw-radius: 0.5rem;
  --sw-radius-xl: 0.75rem;
  --sw-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);

  width: 100%;
  max-width: 80rem;
  margin: 0 auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  color: var(--sw-on-surface);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 15px;
  line-height: 24px;
  -webkit-font-smoothing: antialiased;
}
@media (min-width: 768px) { .sw-page { padding: 1.5rem; gap: 2.5rem; } }

/* ---------- Icons (Material Symbols) ---------- */
.material-symbols-outlined { line-height: 1; vertical-align: middle; user-select: none; }
.sw-ico-16 { font-size: 16px; }
.sw-ico-18 { font-size: 18px; }
.sw-ico-20 { font-size: 20px; }
.sw-ico-22 { font-size: 22px; }
.sw-spin { animation: sw-spin 1s linear infinite; }
@keyframes sw-spin { to { transform: rotate(360deg); } }

/* ---------- Typography scale ---------- */
.sw-headline-lg { font: 600 28px/36px 'Outfit', sans-serif; letter-spacing: -0.01em; margin: 0; }
@media (min-width: 768px) { .sw-headline-lg { font-size: 32px; line-height: 40px; } }
.sw-headline-sm { font: 500 20px/28px 'Outfit', sans-serif; margin: 0; }
.sw-body-md     { font: 400 15px/24px 'Inter', sans-serif; margin: 0; }
.sw-body-sm     { font: 400 13px/20px 'Inter', sans-serif; margin: 0; }
.sw-label-lg    { font: 600 14px/20px 'Inter', sans-serif; letter-spacing: 0.01em; }
.sw-label-md    { font: 600 12px/16px 'Inter', sans-serif; letter-spacing: 0.02em; }
.sw-label-sm    { font: 600 11px/14px 'Inter', sans-serif; letter-spacing: 0.03em; }

.sw-text-variant   { color: var(--sw-on-surface-variant); }
.sw-text-outline   { color: var(--sw-outline); }
.sw-text-primary   { color: var(--sw-primary); }
.sw-text-secondary { color: var(--sw-secondary); }
.sw-text-tertiary  { color: var(--sw-tertiary); }

/* ---------- Cards ---------- */
.sw-card { background: var(--sw-surface-lowest); border-radius: var(--sw-radius-xl); box-shadow: var(--sw-shadow-sm); }
.sw-card--low { background: var(--sw-surface-low); }

/* ---------- Hero / summary deck ---------- */
.sw-hero {
  position: relative;
  overflow: hidden;
  padding: 1.25rem;
  background: var(--sw-surface-low);
  border-radius: var(--sw-radius-xl);
  box-shadow: var(--sw-shadow-sm);
}
@media (min-width: 768px) { .sw-hero { padding: 2.5rem; } }
.sw-blob { position: absolute; border-radius: 50%; pointer-events: none; }
.sw-blob--green { width: 20rem; height: 20rem; right: -4rem; top: -4rem; background: rgba(199, 236, 206, 0.2); filter: blur(64px); }
.sw-blob--peach { width: 16rem; height: 16rem; left: -3rem; bottom: -3rem; background: rgba(255, 219, 207, 0.25); filter: blur(40px); }
.sw-hero-inner { position: relative; z-index: 1; }
.sw-hero-copy { max-width: 42rem; }
.sw-hero-actions { flex-shrink: 0; }
@media (min-width: 992px) { .sw-hero-actions { width: auto !important; } }

/* ---------- Week navigation + small icon buttons ---------- */
.sw-weeknav { display: inline-flex; align-items: center; gap: 0.125rem; }
.sw-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--sw-on-surface-variant);
  cursor: pointer;
  transition: background-color 0.15s;
}
.sw-iconbtn:hover { background: var(--sw-surface-high); }
.sw-iconbtn:focus-visible { outline: 2px solid var(--sw-primary); outline-offset: 1px; }

/* ---------- Pills, dots, badges ---------- */
.sw-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: var(--sw-surface);
  color: var(--sw-on-surface-variant);
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}
.sw-pill--hero  { gap: 0.375rem; background: var(--sw-primary-fixed); color: var(--sw-on-primary-fixed); }
.sw-pill--green { background: var(--sw-primary-fixed); color: var(--sw-on-primary-fixed); }

.sw-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--sw-outline); }
.sw-dot--primary { background: var(--sw-primary); }

.sw-badge-stock {
  padding: 1px 6px;
  border-radius: 0.25rem;
  background: var(--sw-primary-fixed);
  color: var(--sw-on-primary-fixed);
  font: 600 10px/14px 'Inter', sans-serif;
}

/* ---------- Buttons (built on Bootstrap .btn via its CSS variables) ---------- */
.sw-btn {
  --bs-btn-padding-x: 1rem;
  --bs-btn-padding-y: 0.5rem;
  --bs-btn-border-width: 0;
  --bs-btn-border-radius: var(--sw-radius);
  --bs-btn-disabled-opacity: 0.7;
  --bs-btn-focus-box-shadow: 0 0 0 0.2rem rgba(50, 83, 60, 0.35);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  transition: background-color 0.15s, color 0.15s;
}
.sw-btn--sm { --bs-btn-padding-y: 0.25rem; }

.sw-btn-primary {
  --bs-btn-color: var(--sw-on-primary);
  --bs-btn-bg: var(--sw-primary);
  --bs-btn-hover-color: var(--sw-on-primary);
  --bs-btn-hover-bg: var(--sw-primary-container);
  --bs-btn-active-color: var(--sw-on-primary);
  --bs-btn-active-bg: var(--sw-primary-container);
  --bs-btn-disabled-color: var(--sw-on-primary);
  --bs-btn-disabled-bg: var(--sw-primary);
}
.sw-btn-secondary {
  --bs-btn-color: var(--sw-on-secondary);
  --bs-btn-bg: var(--sw-secondary);
  --bs-btn-hover-color: var(--sw-on-secondary-container);
  --bs-btn-hover-bg: var(--sw-secondary-container);
  --bs-btn-active-color: var(--sw-on-secondary-container);
  --bs-btn-active-bg: var(--sw-secondary-container);
  --bs-btn-disabled-color: var(--sw-on-secondary);
  --bs-btn-disabled-bg: var(--sw-secondary);
}
.sw-btn-highest {
  --bs-btn-color: var(--sw-on-surface);
  --bs-btn-bg: var(--sw-surface-highest);
  --bs-btn-hover-color: var(--sw-on-surface);
  --bs-btn-hover-bg: var(--sw-surface-dim);
  --bs-btn-active-color: var(--sw-on-surface);
  --bs-btn-active-bg: var(--sw-surface-dim);
}
.sw-btn-tonal {
  --bs-btn-color: var(--sw-on-surface);
  --bs-btn-bg: var(--sw-surface);
  --bs-btn-hover-color: var(--sw-on-surface);
  --bs-btn-hover-bg: var(--sw-surface-high);
  --bs-btn-active-color: var(--sw-on-surface);
  --bs-btn-active-bg: var(--sw-surface-high);
}

/* ---------- Progress ring ---------- */
.sw-ring { position: relative; width: 48px; height: 48px; flex-shrink: 0; }
.sw-ring svg { width: 48px; height: 48px; transform: rotate(-90deg); }
.sw-ring-track { fill: none; stroke: var(--sw-surface-high); stroke-width: 3.5; }
.sw-ring-bar { fill: none; stroke: var(--sw-primary); stroke-width: 3.5; stroke-linecap: round; transition: stroke-dasharray 0.5s ease-out; }
.sw-ring-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

/* ---------- Filter bar ---------- */
.sw-filterbar {
  margin-top: 1.5rem;
  padding: 1rem 0.5rem 0.5rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: var(--sw-radius);
  backdrop-filter: blur(4px);
}
.sw-check-label { cursor: pointer; user-select: none; }

.form-check-input.sw-check {
  width: 1.25rem;
  height: 1.25rem;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 0.3rem;
  border-color: var(--sw-outline);
}
.form-check-input.sw-check:checked { background-color: var(--sw-primary); border-color: var(--sw-primary); }
.form-check-input.sw-check:focus { border-color: var(--sw-primary); box-shadow: 0 0 0 0.2rem rgba(50, 83, 60, 0.25); }
.form-check-input.sw-check:disabled { opacity: 0.6; cursor: default; }
.form-check-input.sw-check--sm { width: 1rem; height: 1rem; border-radius: 0.25rem; }

/* ---------- Alerts & empty states ---------- */
.sw-alert {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  border-radius: var(--sw-radius);
  background: var(--sw-error-container);
  color: var(--sw-error);
}
.sw-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1.5rem;
  text-align: center;
}
.sw-empty-icon { font-size: 40px; color: var(--sw-primary); }

/* ---------- Quick-add form ---------- */
.sw-addform { display: flex; flex-direction: column; gap: 0.5rem; }
@media (min-width: 768px) { .sw-addform { flex-direction: row; align-items: center; } }
.sw-addbox { flex: 1; display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 1rem; background: var(--sw-surface-low); border-radius: var(--sw-radius); }
.sw-addbox:focus-within { box-shadow: 0 0 0 2px var(--sw-primary); }
.form-control.sw-bare-input { padding: 0; border: 0; background: transparent; box-shadow: none; color: var(--sw-on-surface); font: 400 13px/20px 'Inter', sans-serif; }
.sw-bare-input::placeholder { color: var(--sw-outline); opacity: 1; }

.form-select.sw-select,
.form-control.sw-select {
  width: auto;
  padding: 0.5rem 2rem 0.5rem 0.5rem;
  background-color: var(--sw-surface-low);
  border: 0;
  border-radius: var(--sw-radius);
  color: var(--sw-on-surface);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.form-control.sw-select.sw-qty { width: 4.5rem; padding-right: 0.5rem; cursor: text; }
.form-select.sw-select:focus,
.form-control.sw-select:focus { box-shadow: 0 0 0 2px var(--sw-primary); }

/* ---------- Sections ---------- */
.sw-aisle { overflow: hidden; }
.sw-aisle-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 1rem 1.25rem; background: var(--sw-surface-low); }
.sw-aisle-icon { width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: var(--sw-radius); }
.sw-aisle-icon--green   { background: var(--sw-primary-fixed);   color: var(--sw-on-primary-fixed); }
.sw-aisle-icon--peach   { background: var(--sw-secondary-fixed); color: var(--sw-on-secondary-fixed); }
.sw-aisle-icon--amber   { background: var(--sw-tertiary-fixed);  color: var(--sw-on-tertiary-fixed); }
.sw-aisle-icon--blue    { background: #d6e3ff;                   color: #001b3e; }
.sw-aisle-icon--neutral { background: var(--sw-surface-highest); color: var(--sw-on-surface-variant); }
.sw-aisle-body { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; }

/* ---------- Grocery rows ---------- */
.sw-row {
  display: flex;
  flex-wrap: wrap; /* tags drop under the name on narrow phones */
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  padding: 0.5rem;
  border-radius: var(--sw-radius);
  cursor: pointer;
  transition: background-color 0.15s;
}
.sw-row:hover { background: rgba(244, 244, 237, 0.6); }
.sw-row:focus-within { outline: 2px solid rgba(50, 83, 60, 0.35); }
.sw-row--stocked { background: rgba(244, 244, 237, 0.4); cursor: default; }

.sw-row-main { display: flex; align-items: center; gap: 1rem; min-width: 0; flex: 1 1 14rem; }
.sw-row-text { display: flex; flex-direction: column; min-width: 0; }
.sw-row--stocked .sw-row-text { opacity: 0.6; }

.sw-item-name { font: 400 15px/24px 'Inter', sans-serif; color: var(--sw-on-surface); overflow-wrap: anywhere; transition: opacity 0.15s; }
.sw-meta { font: 600 11px/14px 'Inter', sans-serif; letter-spacing: 0.03em; color: var(--sw-outline); }

.sw-row.is-bought .sw-item-name { text-decoration: line-through; opacity: 0.5; }

.sw-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 0.25rem; padding-left: 2.25rem; }
@media (min-width: 576px) { .sw-tags { padding-left: 0; } }

/* ---------- Shopping order timeline ---------- */
.sw-timeline { position: relative; display: flex; flex-direction: column; gap: 1rem; margin-top: 0.25rem; padding-left: 1.5rem; }
.sw-timeline::before { content: ''; position: absolute; left: 6px; top: 0.5rem; bottom: 0.5rem; width: 2px; background: var(--sw-surface-highest); }
.sw-step { position: relative; display: flex; align-items: flex-start; gap: 0.5rem; }
.sw-step-dot { position: absolute; left: -1.5rem; top: 0.25rem; width: 14px; height: 14px; border-radius: 50%; background: var(--sw-surface-variant); box-shadow: 0 0 0 4px var(--sw-surface-lowest); }
.sw-step-dot--primary   { background: var(--sw-primary); }
.sw-step-dot--secondary { background: var(--sw-secondary); }

/* ---------- Pantry list ---------- */
.sw-saving { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem; background: var(--sw-surface-lowest); border-radius: var(--sw-radius); }
.sw-saving-text { min-width: 0; }
.sw-saving-text .sw-label-md { display: block; }

/* ---------- Print: just the list ---------- */
.sw-print-only { display: none; }
@media print {
  .sw-no-print { display: none !important; }
  .sw-print-only { display: inline; }
  .sw-hero, .sw-card { box-shadow: none; }
  .sw-blob { display: none; }
  .col-lg-8 { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .sw-spin { animation: none; }
  .sw-ring-bar, .sw-row, .sw-btn, .sw-iconbtn { transition: none; }
}
</style>