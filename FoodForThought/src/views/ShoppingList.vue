<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createApi, errorMessage } from '@/services/api'
import { toISODate, fromISODate, mondayOf } from '@/utils/dates'
import { LIST_TO_PANTRY_UNIT, formatQty } from '@/constants/pantry'
import { categoryStyle } from '@/constants/categoryColors'
import ShoppingModeModal from '@/components/Shopping/ShoppingModeModal.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import PageIntro from '@/components/ui/PageIntro.vue'

/* ---------- API ---------- */
// All shopping-list requests go to the Express router mounted at /shoppinglist.
// createApi (services/api.js) sends the login token and logs out on 401.
const api = createApi('/shoppinglist')
const route = useRoute()
const router = useRouter()

/* ---------------------------------------------------------------
   Category display info, listed in SHOPPING ORDER (must match
   SHOPPING_ORDER in backend/services/shoppingListBuilder.js):
   shelf-stable first, chilled and frozen last so they stay cold.
---------------------------------------------------------------- */
const CATEGORY_META = [
  { id: 'canned-sauces', title: 'Canned Goods & Sauces', icon: 'soup_kitchen' },
  { id: 'grains-noodles', title: 'Rice, Grains & Noodles', icon: 'rice_bowl' },
  { id: 'spices-condiments', title: 'Spices & Condiments', icon: 'grain' },
  { id: 'other', title: 'Other', icon: 'shopping_basket' },
  { id: 'produce', title: 'Fruit & Vegetables', icon: 'nutrition' },
  { id: 'dairy-eggs', title: 'Dairy & Eggs', icon: 'egg', chilled: true },
  { id: 'meat-seafood', title: 'Meat & Seafood', icon: 'set_meal', chilled: true },
  { id: 'frozen', title: 'Frozen', icon: 'ac_unit', chilled: true },
]
const UNIT_OPTIONS = ['piece', 'g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'cup', 'pack', 'bottle', 'can']

/* ---------------------------------------------------------------
   Week handling. The week lives in the URL (?start=2026-10-19) so the
   planner can link straight to the same week's list.
---------------------------------------------------------------- */
const queryStart = /^\d{4}-\d{2}-\d{2}$/.test(route.query.start ?? '') ? route.query.start : null
const weekStart = ref(toISODate(mondayOf(queryStart ? fromISODate(queryStart) : new Date())))

const thisWeek = toISODate(mondayOf())
const isThisWeek = computed(() => weekStart.value === thisWeek)

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

let latestLoad = 0 // ignore a slow response if the user already switched to another week

async function loadList() {
  const requestId = ++latestLoad
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/', { params: { start: weekStart.value } })
    if (requestId === latestLoad) list.value = data
  } catch (err) {
    if (requestId === latestLoad) {
      error.value = errorMessage(err)
      list.value = null
    }
  } finally {
    if (requestId === latestLoad) loading.value = false
  }
}

async function generateList() {
  generating.value = true
  error.value = ''
  try {
    const { data } = await api.post('/generate', { start: weekStart.value })
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
const toBuyLeft = computed(() => toBuyItems.value.filter((it) => !it.purchased).length)


const bought = computed(() => toBuyItems.value.filter((it) => it.purchased).length)
const percent = computed(() => (total.value === 0 ? 0 : Math.round((bought.value / total.value) * 100)))
const pantryItems = computed(() => items.value.filter(fromPantry))

// Unique recipes this week's list was built from.
const recipeTitles = computed(() => {
  const titles = new Set()
  items.value.forEach((it) => (it.usedIn || []).forEach((u) => u.title && titles.add(u.title)))
  return [...titles]
})
const hasAutoItems = computed(() => items.value.some((it) => it.source !== 'manual'))

/* ---------------------------------------------------------------
   "Add bought items to pantry"
   Units the pantry can store (must match PANTRY_UNIT in
   backend/services/shoppingListBuilder.js). Items in other units,
   like "1 bottle dish soap", stay on the list only.
---------------------------------------------------------------- */
// Same rule as the server (readyForPantry in router/shoppinglist.js):
// bought, not added yet, and meant for the pantry (the basket's switch, or a unit the pantry can store)
function goesToPantry(it) {
  if (!it.purchased || it.addedToPantry) return false
  if (it.basket) return it.basket.addToPantry !== false
  return it.quantity > 0 && Boolean(LIST_TO_PANTRY_UNIT[it.unit])
}
const readyForPantry = computed(() => items.value.filter(goesToPantry))
const addingToPantry = ref(false)
const notice = ref('') // green success message
const warning = ref('') // amber: done, but some items were left out (e.g. "Rice: your pantry stores it in cup")

async function addBoughtToPantry() {
  if (addingToPantry.value || readyForPantry.value.length === 0) return
  addingToPantry.value = true
  error.value = ''
  shoppingError.value = ''
  notice.value = ''
  warning.value = ''
  try {
    const { data } = await api.post('/add-to-pantry', { start: weekStart.value })
    list.value = data.list // server sends back the list with addedToPantry set
    notice.value = `Added ${data.added} ${data.added === 1 ? 'item' : 'items'} to your pantry.`
    if (data.skipped.length) {
      // e.g. "Rice (your pantry stores it in cup)"
      const text = `Not added: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}. Add these on the Pantry page instead.`
      if (showShopping.value) shoppingError.value = text
      else warning.value = text
    }
  } catch (err) {
    reportError(errorMessage(err))
  } finally {
    addingToPantry.value = false
  }
}

/* ---------------------------------------------------------------
   Filters
---------------------------------------------------------------- */
const filter = ref('all') // 'all' | 'tobuy' | 'pantry'
// On by default: lines the pantry fully covers need no action, so they'd only make the list longer.
// They're still listed under the "In Pantry" filter and in the "From Your Pantry" panel.
const hidePantry = ref(true)

const filters = computed(() => [
  { key: 'all', label: 'All Items', count: items.value.length },
  { key: 'tobuy', label: 'To Buy', count: total.value - bought.value },
  { key: 'pantry', label: 'In Pantry', count: pantryItems.value.length },
])

function isVisible(it) {
  if (hidePantry.value && isStocked(it) && filter.value !== 'pantry') return false
  if (filter.value === 'tobuy') return !isStocked(it) && !it.purchased
  if (filter.value === 'pantry') return fromPantry(it)
  return true
}

// Items grouped into sections, in shopping order, hiding empty sections.
const sections = computed(() =>
  CATEGORY_META.map((cat) => {
    const inCategory = items.value.filter((it) => (it.category || 'other') === cat.id)
    return { ...cat, count: inCategory.length, visible: inCategory.filter(isVisible) }
  }).filter((s) => s.visible.length > 0),
)

/* ---------------------------------------------------------------
   Formatting
---------------------------------------------------------------- */
// Every amount on a line: the main one plus any in units that can't be converted to it.
// Ginger planned as "1 piece" in one recipe and "1 inch" in another is one line: "1 piece + 1 inch".
// (Amounts in units that DO convert are merged by the server: 1 tsp + 1 tbsp arrives as 4 tsp.)
function amountsOf(it) {
  return [{ quantity: it.quantity, unit: it.unit, pantryQuantity: it.pantryQuantity }, ...(it.alsoNeed || [])]
}
const joinAmounts = (list, field) => list.filter((a) => a[field] > 0).map((a) => formatQty(a[field], a.unit)).join(' + ')
const buyText = (it) => joinAmounts(amountsOf(it), 'quantity')
const pantryText = (it) => joinAmounts(amountsOf(it), 'pantryQuantity')
function fromPantry(it) {
  return amountsOf(it).some((a) => a.pantryQuantity > 0)
}

function recipeTags(it) {
  const titles = (it.usedIn || []).map((u) => u.title)
  return titles.length > 2 ? [...titles.slice(0, 2), `+${titles.length - 2} more`] : titles
}

// Small line under the item name, e.g. "200 g from pantry · for Prawn Laksa"
function rowNote(it) {
  if (it.source === 'manual') return 'Added by you'
  const parts = []
  if (isStocked(it)) parts.push(`${pantryText(it)} needed, all in your pantry`)
  else if (fromPantry(it)) parts.push(`${pantryText(it)} from pantry`)
  const recipes = recipeTags(it)
  if (recipes.length) parts.push(`for ${recipes.join(', ')}`)
  return parts.join(' · ')
}

/* ---------------------------------------------------------------
   Tick / untick: update the screen first ("optimistic"), then tell
   the server, and undo the change if the server says no.
---------------------------------------------------------------- */
async function togglePurchased(it) {
  const next = !it.purchased
  it.purchased = next
  try {
    const { data } = await api.patch(`/items/${it._id}`, { purchased: next })
    Object.assign(it, data)
  } catch (err) {
    it.purchased = !next
    reportError(errorMessage(err))
  }
}

/* ---------------------------------------------------------------
   Shopping mode (components/Shopping/shoppingMode.vue)
   Tapping an item there ticks it (togglePurchased above); the server then
   fills in its basket details, which the user can edit before adding to the pantry.
---------------------------------------------------------------- */
const showShopping = ref(false)
const savingBasket = ref(false)
const shoppingError = ref('')

// Errors show inside the modal while it's open, otherwise on the page
function reportError(message) {
  if (showShopping.value) shoppingError.value = message
  else error.value = message
}

function openShopping() {
  shoppingError.value = ''
  notice.value = ''
  showShopping.value = true
}
function closeShopping() {
  showShopping.value = false
  shoppingError.value = ''
}

// basket: { name, quantity, unit, category, expiryDate: 'YYYY-MM-DD' or '', addToPantry }
async function saveBasket({ item, basket }) {
  savingBasket.value = true
  shoppingError.value = ''
  try {
    const { data } = await api.patch(`/items/${item._id}/basket`, basket)
    Object.assign(item, data)
  } catch (err) {
    shoppingError.value = errorMessage(err)
  } finally {
    savingBasket.value = false
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
    const { data } = await api.post('/items', { start: weekStart.value, ...newItem.value, name })
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
    await api.delete(`/items/${it._id}`)
  } catch (err) {
    list.value.items.splice(index, 0, it) // put it back
    error.value = errorMessage(err)
  }
}

</script>

<template>
  <!-- full-width page background, same colour as the planner and pantry -->
  <div class="sw-shell">
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
              <div class="sw-weeknav" role="group" aria-label="Choose week">
                <button type="button" class="sw-iconbtn" aria-label="Previous week" @click="shiftWeek(-1)">
                  <span class="material-symbols-outlined sw-ico-18">chevron_left</span>
                </button>
                <span class="sw-label-md sw-text-tertiary">Week of {{ weekLabel }}</span>
                <button type="button" class="sw-iconbtn" aria-label="Next week" @click="shiftWeek(1)">
                  <span class="material-symbols-outlined sw-ico-18">chevron_right</span>
                </button>
                <button v-if="!isThisWeek" type="button" class="btn sw-btn sw-btn--sm sw-btn-tonal"
                  @click="weekStart = thisWeek">This week</button>
              </div>
            </div>
            <h1 class="sw-headline-lg">Shopping List</h1>
            <p class="sw-body-md sw-text-variant d-none d-md-block m-0">
              Sections follow a walk through the shop: chilled and frozen items come last, so they stay cold on the way home.
            </p>
          </div>

          <!-- Progress + actions -->
          <div
            v-if="hasList"
            class="sw-hero-actions d-flex flex-column flex-sm-row flex-lg-column align-items-stretch align-items-sm-center align-items-lg-end gap-3 w-100"
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
                <div class="sw-ring-label"><span class="sw-label-sm tabular-nums">{{ percent }}%</span></div>
              </div>
              <div class="d-flex flex-column">
                <span class="sw-label-lg tabular-nums">{{ bought }} of {{ total }} bought</span>
                <span class="sw-label-sm sw-text-outline">{{ pantryItems.length }} covered by your pantry</span>
                <router-link to="/pantry" class="sw-inline-link">
                  Go to pantry
                  <span class="material-symbols-outlined sw-ico-16">arrow_forward</span>
                </router-link>
              </div>
            </div>


            <div class="d-flex align-items-center justify-content-lg-end flex-wrap gap-2">
              <button
                v-if="readyForPantry.length"
                type="button"
                class="btn sw-btn sw-btn-tonal flex-fill flex-sm-grow-0"
                :disabled="addingToPantry"
                title="Add the items you've ticked as bought to your pantry"
                @click="addBoughtToPantry"
              >
                <span class="material-symbols-outlined sw-ico-18" :class="{ 'sw-spin': addingToPantry }">
                  {{ addingToPantry ? 'refresh' : 'kitchen' }}
                </span>
                <span>
                  {{
                    addingToPantry
                      ? 'Adding…'
                      : readyForPantry.length
                        ? `Add ${readyForPantry.length} bought to pantry`
                        : 'Add bought items to pantry'
                  }}
                </span>
              </button>
              <button
                type="button"
                class="btn sw-btn sw-btn-outline flex-fill flex-sm-grow-0"
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
        <div v-if="items.length" class="sw-filterbar d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div class="sw-filter-chips" role="group" aria-label="Filter items">
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

    <PageIntro page="shopping" />

    <!-- Messages -->
    <div v-if="notice || warning || error">
      <AppAlert v-if="notice" tone="success" title="Pantry updated" icon="kitchen" @dismiss="notice = ''">
        {{ notice }} <router-link to="/pantry" class="sw-alert-link">See your pantry</router-link>
      </AppAlert>
      <AppAlert v-if="warning" tone="warning" title="Some items weren't added" @dismiss="warning = ''">
        {{ warning }}
      </AppAlert>
      <AppAlert v-if="error" tone="error" title="That didn't work" @dismiss="error = ''">
        {{ error }}
      </AppAlert>
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
          <form class="sw-card sw-addform p-3" @submit.prevent="addItem">
            <div class="sw-addbox">
              <span class="material-symbols-outlined sw-ico-20 sw-text-outline">add_circle</span>
              <input
                v-model="newItem.name"
                type="text"
                class="form-control sw-bare-input"
                placeholder="Add your own item (e.g. dish soap, oat milk)"
                aria-label="Item name"
                maxlength="60"
              />
            </div>
            <div class="sw-add-controls">
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
              <button type="submit" class="btn sw-btn sw-btn-primary sw-add-btn" :disabled="adding || !newItem.name.trim()">
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
          <!-- each section is colour-coded by food type (constants/categoryColors.js, same colours as the Pantry) -->
          <section v-for="section in sections" :key="section.id" class="sw-card sw-aisle" :style="categoryStyle(section.id)">
            <div class="sw-aisle-head">
              <div class="d-flex align-items-center gap-2">
                <span class="sw-aisle-icon">
                  <span class="material-symbols-outlined sw-ico-18">{{ section.icon }}</span>
                </span>
                <div>
                  <h2 class="sw-headline-sm">{{ section.title }}</h2>
                  <span v-if="section.chilled" class="sw-aisle-chilled">
                    <span class="material-symbols-outlined" aria-hidden="true">ac_unit</span>Keep chilled
                  </span>
                </div>
              </div>
              <span class="sw-pill">{{ section.visible.length }} {{ section.visible.length === 1 ? 'item' : 'items' }}</span>
            </div>

            <div class="sw-aisle-body">
              <label
                v-for="it in section.visible"
                :key="it._id"
                class="sw-row"
                :class="{ 'sw-row--stocked': isStocked(it), 'is-bought': it.purchased }"
                data-testid="shopping-item"
              >
                <input
                  type="checkbox"
                  class="form-check-input sw-check"
                  :checked="it.purchased || isStocked(it)"
                  :disabled="isStocked(it) || it.addedToPantry"
                  :aria-label="`Bought ${it.name}`"
                  @change="togglePurchased(it)"
                />
                <div class="sw-row-text">
                  <div class="d-flex align-items-center flex-wrap gap-1">
                    <span class="sw-item-name">{{ it.name }}</span>
                    <span v-if="it.addedToPantry" class="sw-badge-stock">Added to pantry</span>
                  </div>
                  <span class="sw-meta">{{ rowNote(it) }}</span>
                </div>

                <!-- what to put in the basket: the thing a shopper looks for first -->
                <span class="sw-qty-col" :class="{ 'sw-qty-col--stocked': isStocked(it) }">
                  {{ isStocked(it) ? 'In pantry' : buyText(it) }}
                </span>
                <button
                  v-if="it.source === 'manual'"
                  type="button"
                  class="sw-iconbtn"
                  :aria-label="`Remove ${it.name}`"
                  @click.prevent="removeItem(it)"
                >
                  <span class="material-symbols-outlined sw-ico-18">delete</span>
                </button>
              </label>
            </div>
          </section>

          <p v-if="items.length && sections.length === 0" class="sw-body-md sw-text-variant text-center py-4 m-0">
            Nothing to show with the current filters.
          </p>
        </div>
      </div>

      <!-- ---------- Right: pantry (desktop; on phones the "In Pantry" filter shows the same) ---------- -->
      <div class="col-12 col-lg-4 d-none d-lg-block sw-sticky">
        <div class="d-flex flex-column gap-4">
          <!-- "Start shopping": sticky card at the top of the side column, so it stays in view while scrolling -->
          <section class="sw-shop-cta sw-shop-cta--c" aria-labelledby="shop-cta-title-c">
            <span class="sw-shop-cta-icon" aria-hidden="true">
              <span class="material-symbols-outlined">shopping_cart</span>
            </span>
            <div class="sw-shop-cta-text">
              <h2 id="shop-cta-title-c" class="sw-shop-cta-title">Going to the shops?</h2>
              <p class="sw-shop-cta-desc">
                Shopping mode turns this list into a big, phone-friendly checklist. Tap each item as it goes in your
                basket, change the amount if you bought a different size, then add it all to your pantry at the end.
              </p>
            </div>
            <button type="button" class="sw-shop-cta-btn" :disabled="!items.length" data-testid="start-shopping"
              @click="openShopping">
              <span class="material-symbols-outlined" aria-hidden="true">shopping_cart_checkout</span>
              <span class="d-flex flex-column align-items-start">
                <span>Start shopping</span>
<<<<<<< Updated upstream
                <span class="sw-shop-cta-count">{{ toBuyLeft }} {{ toBuyLeft === 1 ? 'item' : 'items' }} to buy</span>
=======
                <span class="sw-shop-cta-count tabular-nums">{{ toBuyLeft }} {{ toBuyLeft === 1 ? 'item' : 'items' }} to buy</span>
>>>>>>> Stashed changes
              </span>
            </button>
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
                        {{ isStocked(it) ? 'Fully covered' : `Still buy ${buyText(it)}` }}
                      </span>
                    </div>
                  </div>
                  <span class="sw-label-sm sw-text-primary fw-semibold flex-shrink-0">
                    {{ pantryText(it) }}
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

    <!-- "Start shopping" on phones: a bar fixed to the bottom of the screen, like a checkout button -->
    <div v-if="hasList && !loading" class="sw-shop-bar d-lg-none">
      <!-- (the spacer below stops the bar covering the last items) -->
      <div class="sw-shop-bar-text">
        <strong>{{ toBuyLeft }} {{ toBuyLeft === 1 ? 'item' : 'items' }} to buy</strong>
        <span>Tap items off as they go in your basket</span>
      </div>
      <button type="button" class="sw-shop-cta-btn" :disabled="!items.length" @click="openShopping">
        <span class="material-symbols-outlined" aria-hidden="true">shopping_cart_checkout</span>
        Start shopping
      </button>
    </div>
    <div v-if="hasList && !loading" class="sw-shop-bar-spacer d-lg-none" aria-hidden="true"></div>
  </main>

  <!-- Shopping mode (teleported to <body>, so its position here doesn't matter) -->
  <ShoppingModeModal
    v-if="showShopping"
    :items="items"
    :sections="CATEGORY_META"
    :saving="savingBasket"
    :adding="addingToPantry"
    :error="shoppingError"
    :notice="notice"
    @toggle="togglePurchased"
    @save-basket="saveBasket"
    @add-to-pantry="addBoughtToPantry"
    @close="closeShopping"
  />
  </div>
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
  max-width: 1140px; /* same content width as the planner and pantry */
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

/* Edge-to-edge page background: same colour as the planner and pantry (#fafaf3) */
<<<<<<< Updated upstream
.sw-shell { min-height: 100vh; background: #fafaf3; }
=======
.sw-shell { min-height: 100vh; min-height: 100dvh; background: #fafaf3; }
>>>>>>> Stashed changes

/* ---------- Icons (Material Symbols) ---------- */
.material-symbols-outlined { line-height: 1; vertical-align: middle; user-select: none; }
.sw-ico-16 { font-size: 16px; }
.sw-ico-18 { font-size: 18px; }
.sw-ico-20 { font-size: 20px; }
.sw-ico-22 { font-size: 22px; }
.sw-spin { animation: sw-spin 0.7s linear infinite; }
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
  border: 1px solid rgba(194, 200, 192, 0.5); /* keeps the card distinct on the cream page */
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
.sw-btn-outline {
  --bs-btn-color: var(--sw-primary);
  --bs-btn-bg: var(--sw-surface-lowest);
  --bs-btn-border-color: rgba(50, 83, 60, 0.35);
  --bs-btn-hover-color: var(--sw-primary);
  --bs-btn-hover-bg: var(--sw-surface-low);
  --bs-btn-hover-border-color: var(--sw-primary);
  --bs-btn-active-color: var(--sw-primary);
  --bs-btn-active-bg: var(--sw-surface-high);
  --bs-btn-disabled-color: var(--sw-primary);
  --bs-btn-disabled-bg: var(--sw-surface-lowest);
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

/* "Go to pantry" link in the summary card */
.sw-inline-link {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-top: 0.25rem;
  color: var(--sw-primary);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  text-decoration: none;
}
.sw-inline-link:hover { text-decoration: underline; }
.sw-inline-link:focus-visible { outline: 2px solid var(--sw-primary); outline-offset: 2px; border-radius: 2px; }

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
/* ===== "Start shopping" call-to-action ===== */
/* tomato = the Shopping List's page colour (same as its page intro); set on both the card and the phone bar */
.sw-shop-cta,
.sw-shop-bar { --cta: #b23a2a; --cta-hover: #962d1f; --cta-soft: #f2c9bf; --cta-wash: #fbe4de; --cta-shadow: rgba(178, 58, 42, 0.25); }

.sw-shop-cta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 16px;
  background: #fff;
  border: 2px solid var(--cta-soft);
  box-shadow: 0 2px 10px var(--cta-shadow);
}
.sw-shop-cta-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--cta-wash);
  color: var(--cta);
}
.sw-shop-cta-icon .material-symbols-outlined { font-size: 28px; }
.sw-shop-cta-text { flex: 1; min-width: 0; }
.sw-shop-cta-title { margin: 0; font: 600 19px/26px 'Outfit', sans-serif; color: #1a1c18; }
.sw-shop-cta-desc { margin: 2px 0 0; max-width: 60ch; font: 400 13.5px/20px 'Inter', sans-serif; color: #424842; }

.sw-shop-cta-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 22px 8px 18px;
  border: 0;
  border-radius: 14px;
  background: var(--cta);
  color: #fff;
  font: 600 16px/20px 'Inter', sans-serif;
  box-shadow: 0 4px 12px var(--cta-shadow);
  transition: background-color 0.15s, transform 0.1s;
}
.sw-shop-cta-btn .material-symbols-outlined { font-size: 26px; }
.sw-shop-cta-btn:hover:not(:disabled) { background: var(--cta-hover); }
.sw-shop-cta-btn:active:not(:disabled) { transform: translateY(1px); }
.sw-shop-cta-btn:focus-visible { outline: 3px solid var(--cta-soft); outline-offset: 2px; }

.sw-shop-cta-btn:disabled { opacity: 0.5; }
.sw-shop-cta-count { font: 500 12px/16px 'Inter', sans-serif; opacity: 0.85; }

/* C: side column, stacked */
.sw-shop-cta--c { flex-direction: column; align-items: stretch; text-align: left; }
.sw-shop-cta--c .sw-shop-cta-icon { display: none; }
.sw-shop-cta--c .sw-shop-cta-btn { width: 100%; }

/* C on phones: bar fixed to the bottom of the screen */
.sw-shop-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 1020;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 10px 10px 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 28px rgba(26, 28, 24, 0.22);
}
.sw-shop-bar-spacer { height: 88px; }
.sw-shop-bar-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font: 400 12px/16px 'Inter', sans-serif; color: #424842; }
.sw-shop-bar-text strong { font: 600 15px/20px 'Outfit', sans-serif; color: #1a1c18; }
.sw-shop-bar .sw-shop-cta-btn { min-height: 48px; padding: 8px 16px; font-size: 15px; }

.sw-alert-link { color: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
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
/* quantity, unit, section and Add: one row on wider screens, a neat 2-column grid on phones */
.sw-add-controls { display: grid; grid-template-columns: 4.5rem 1fr; gap: 0.5rem; }
.sw-add-controls > :nth-child(3), .sw-add-controls .sw-add-btn { grid-column: 1 / -1; }
@media (min-width: 576px) {
  .sw-add-controls { display: flex; align-items: center; gap: 0.25rem; }
  .sw-add-controls .sw-qty { width: 4.5rem; }
  .sw-add-btn { flex-shrink: 0; }
}
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
.sw-aisle { overflow: hidden; border-left: 5px solid var(--cat-ink); }
.sw-aisle-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.75rem 1rem; background: var(--cat-wash); }
.sw-aisle-head .sw-headline-sm { color: var(--cat-ink); }
.sw-aisle-head .sw-pill { white-space: nowrap; flex-shrink: 0; background: #fff; color: var(--cat-ink); }
.sw-aisle-icon { width: 2.25rem; height: 2.25rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 10px; background: var(--cat-ink); color: #fff; }
.sw-aisle-chilled { display: inline-flex; align-items: center; gap: 3px; font: 600 11px/14px 'Inter', sans-serif; color: #1f7690; }
.sw-aisle-chilled .material-symbols-outlined { font-size: 13px; }
/* ticked boxes take the section's colour */
.sw-aisle .sw-check:checked { background-color: var(--cat-ink); border-color: var(--cat-ink); }
.sw-aisle-body { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; }

/* ---------- Filter chips: one row, scrolls sideways on narrow phones ---------- */
/* wrap instead of a hidden horizontal scroll, so "In Pantry" is never cut off on phones */
.sw-filter-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; max-width: 100%; }
.sw-filter-chips .sw-btn { flex-shrink: 0; white-space: nowrap; }

/* pantry sidebar follows you down the list on desktop */
@media (min-width: 992px) { .sw-sticky { position: sticky; top: 1rem; } }

/* ---------- Grocery rows: [checkbox] [name / note] [amount] [delete] ---------- */
.sw-qty-col { flex-shrink: 0; font: 600 14px/20px 'Inter', sans-serif; color: var(--sw-on-surface); white-space: nowrap; text-align: right; }
.sw-qty-col--stocked { font-weight: 500; font-size: 12px; color: var(--sw-primary); }
.sw-row.is-bought .sw-qty-col { opacity: 0.5; }
.sw-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: var(--sw-radius);
  cursor: pointer;
  transition: background-color 0.15s;
}
.sw-row:hover { background: rgba(244, 244, 237, 0.6); }
.sw-row:focus-within { outline: 2px solid rgba(50, 83, 60, 0.35); }
.sw-row--stocked { background: rgba(244, 244, 237, 0.4); cursor: default; }

.sw-row-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.sw-row--stocked .sw-row-text { opacity: 0.6; }

.sw-item-name { font: 400 15px/24px 'Inter', sans-serif; color: var(--sw-on-surface); overflow-wrap: anywhere; transition: opacity 0.15s; }
.sw-meta { font: 600 11px/14px 'Inter', sans-serif; letter-spacing: 0.03em; color: var(--sw-outline); }

.sw-row.is-bought .sw-item-name { text-decoration: line-through; opacity: 0.5; }


/* ---------- Pantry list ---------- */
.sw-saving { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem; background: var(--sw-surface-lowest); border-radius: var(--sw-radius); }
.sw-saving-text { min-width: 0; }
.sw-saving-text .sw-label-md { display: block; }

@media (prefers-reduced-motion: reduce) {
  .sw-spin { animation: none; }
  .sw-ring-bar, .sw-row, .sw-btn, .sw-iconbtn { transition: none; }
}
</style>