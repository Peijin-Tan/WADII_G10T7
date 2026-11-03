<script setup>
import { ref, computed, watch, onMounted } from 'vue'
<<<<<<< Updated upstream
import { useRouter } from 'vue-router'
=======
import { useRoute, useRouter } from 'vue-router'
>>>>>>> Stashed changes
import { createApi, errorMessage } from '@/services/api'
import { addDays, toISODate, mondayOf, startOfToday } from '@/utils/dates'
import RecipeModal from '@/components/Mealplan/RecipeModal.vue'
import SwapMealModal from '@/components/Mealplan/SwapMealModal.vue'
import AddMealModal from '@/components/Mealplan/AddMealModal.vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import PageIntro from '@/components/ui/PageIntro.vue'
import { useConfirm } from '@/composables/useConfirm'

/* ---------- API ---------- */
// createApi (services/api.js) sends the login token and logs out on 401.
// Planner requests go to /planner; the grocery button talks to /shoppinglist.
const api = createApi('/planner')
const shoppingApi = createApi('/shoppinglist')
const router = useRouter()
<<<<<<< Updated upstream
=======
const route = useRoute()
>>>>>>> Stashed changes
const confirm = useConfirm()

/* ---------- Date helpers ---------- */
const fmt = (d, opts) => d.toLocaleDateString('en-US', opts)
const sameDay = (a, b) => a.getTime() === b.getTime()
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const today = startOfToday()
const todayIndex = (today.getDay() + 6) % 7 // Monday = 0
const thisMonday = mondayOf(today)

/* ---------- Week navigation ---------- */
const weekOffset = ref(0) // 0 = this week, 1 = next week, -1 = last week

const weekStart = computed(() => addDays(thisMonday, weekOffset.value * 7))
const weekEnd = computed(() => addDays(weekStart.value, 6))
const weekStartISO = computed(() => toISODate(weekStart.value))

const weekRange = computed(() => {
  const o = { month: 'short', day: 'numeric' }
  return `${fmt(weekStart.value, o)} – ${fmt(weekEnd.value, o)}`
})

const weekLabel = computed(() => {
  const n = weekOffset.value
  if (n === 0) return 'This week'
  if (n === 1) return 'Next week'
  if (n === -1) return 'Last week'
  return n > 0 ? `${n} weeks ahead` : `${-n} weeks ago`
})

/* ---------- Loading the week from the backend ---------- */
const plan = ref({ id: null, entries: [] }) // what GET /api/planner returns
const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')

let latestRequest = 0 // ignore slow responses if the user already moved to another week

async function loadWeek() {
  const requestId = ++latestRequest
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await api.get('/', { params: { start: weekStartISO.value } })
    if (requestId === latestRequest) plan.value = res.data
  } catch (err) {
    if (requestId === latestRequest) {
      plan.value = { id: null, entries: [] }
      errorMsg.value = errorMessage(err, 'Could not load your meal plan.')
    }
  } finally {
    if (requestId === latestRequest) loading.value = false
  }
}

// reload whenever the user changes week (and once on page load)
watch(weekStartISO, loadWeek, { immediate: true })

// Recipes shown in the Add Meal and Swap modals
const recipeOptions = ref([])
async function loadRecipeOptions() {
  try {
    const res = await api.get('/recipe-options', { params: { limit: 50 } })
    recipeOptions.value = res.data
  } catch (err) {
    console.error('Could not load recipe options', err)
  }
}
onMounted(loadRecipeOptions)

// Every write endpoint returns the updated week, so we just replace our copy.
// Returns the response data (or null if it failed), e.g. so status changes can read pantryUpdate.
async function saveChange(request) {
  saving.value = true
  errorMsg.value = ''
  pantryNote.value = null
  try {
    const res = await request
    latestRequest++ // a load that was still in flight is now out of date
    loading.value = false
    plan.value = res.data
    return res.data
  } catch (err) {
    errorMsg.value = errorMessage(err, 'Could not save your change. Please try again.')
    return null
  } finally {
    saving.value = false
  }
}

/* ---------- What cooking did to the pantry ---------- */
// PATCH returns pantryUpdate: { deducted: [{ name, quantity, unit }], skipped: [{ name, reason }] }
// when a meal is marked Cooked, or { restored: [...] } when that is undone. Shown as a message,
// so the user can see the pantry change instead of it happening silently.
const pantryNote = ref(null) // { tone, title, lines: [] }

const amountText = (d) => `${d.quantity} ${d.unit} ${d.name}`
const listText = (names) => names.join(', ')

function describePantryUpdate(update, title) {
  if (!update) return null
  if (update.restored) {
    if (!update.restored.length) return null
    return {
      tone: 'info',
      title: `${title} is back to Planned`,
      lines: [`Put back in your pantry: ${listText(update.restored.map(amountText))}.`],
    }
  }
  const lines = []
  if (update.deducted?.length) lines.push(`Taken from your pantry: ${listText(update.deducted.map(amountText))}.`)
  const missing = (update.skipped || []).filter((s) => s.reason === 'not in pantry').map((s) => s.name)
  const unconverted = (update.skipped || []).filter((s) => s.reason !== 'not in pantry')
  if (missing.length) lines.push(`Not in your pantry, so nothing was taken: ${listText(missing)}.`)
  unconverted.forEach((s) => lines.push(`${capitalize(s.name)}: ${s.reason}, so update it on the Pantry page if you used some.`))
  if (!lines.length) return null
  return { tone: update.deducted?.length ? 'success' : 'warning', title: `Enjoy your ${title}!`, lines }
}

/* ---------- Turning API entries into what the cards + modals need ---------- */
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
// Shown when a recipe has no photo (custom meals, user recipes without an image)
const MEAL_PLACEHOLDER = '/img/meal-placeholder.svg'
// A broken image link (e.g. an old Spoonacular URL) falls back to the placeholder instead of a broken icon
function usePlaceholder(e) {
  if (!e.target.src.endsWith(MEAL_PLACEHOLDER)) e.target.src = MEAL_PLACEHOLDER
}
const SLOT_PILL = { breakfast: 'fft-pill-gray', lunch: 'fft-pill-green', dinner: 'fft-pill-amber', snack: 'fft-pill-peach' }

const entries = computed(() =>
  plan.value.entries.map((e) => ({
    ...e,
    slotKey: e.mealSlot, // 'dinner' (what the API uses)
    mealSlot: capitalize(e.mealSlot), // 'Dinner' (what the modals display)
    day: fmt(addDays(weekStart.value, e.dayOfWeek), { weekday: 'long' }),
  }))
)

const hasPlan = computed(() => entries.value.length > 0)

// Skipped meals aren't eaten, so they add no calories (same rule as the macro split below)
const kcalOf = (entry) => (entry.status === 'Skipped' ? 0 : entry.recipe.nutrition.calories || 0)
const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0)

// entriesByDay[0] = Monday's meals, sorted breakfast -> snack
const entriesByDay = computed(() => {
  const byDay = Array.from({ length: 7 }, () => [])
  for (const e of entries.value) byDay[e.dayOfWeek].push(e)
  byDay.forEach((list) => list.sort((a, b) => SLOT_ORDER.indexOf(a.slotKey) - SLOT_ORDER.indexOf(b.slotKey)))
  return byDay
})

/* ---------- Control bar ---------- */
const metrics = computed(() => {
  const all = entries.value
  const cooked = all.filter((e) => e.status === 'Cooked').length
  const daysWithMeals = entriesByDay.value.filter((list) => list.length > 0)
  const avgKcal = daysWithMeals.length
    ? Math.round(sum(daysWithMeals, (list) => sum(list, kcalOf)) / daysWithMeals.length)
    : 0
  return [
    { label: 'Meals Cooked', value: String(cooked), unit: `/ ${all.length} planned`, icon: 'restaurant_menu', bg: 'fft-bg-green-light text-fft-primary' },
    { label: 'Daily Calorie Avg', value: avgKcal ? avgKcal.toLocaleString() : '—', unit: avgKcal ? 'kcal' : '', icon: 'local_fire_department', bg: 'fft-bg-peach text-fft-secondary' },
  ]
})

/* ---------- Days ---------- */
const days = computed(() =>
  entriesByDay.value.map((list, i) => {
    const date = addDays(weekStart.value, i)
    const cooked = list.filter((e) => e.status === 'Cooked').length
    return {
      date,
      name: `${fmt(date, { weekday: 'short' })} ${date.getDate()}`,
      today: sameDay(date, today),
      meals: `${cooked}/${list.length}`,
      kcal: sum(list, kcalOf).toLocaleString(),
    }
  })
)

const activeIndex = ref(todayIndex)
watch(weekOffset, (n) => {
  activeIndex.value = n === 0 ? todayIndex : 0
})

const activeEntries = computed(() => entriesByDay.value[activeIndex.value])

const activeDayLong = computed(() =>
  fmt(days.value[activeIndex.value].date, { weekday: 'long', month: 'short', day: 'numeric' })
)

// A past day is only "Completed" once every meal was logged (Cooked or Skipped);
// otherwise remind the user to log it, so the pantry stays accurate.
const dayStatus = computed(() => {
  const d = days.value[activeIndex.value].date
  const stillPlanned = activeEntries.value.some((e) => e.status === 'Planned')
  if (sameDay(d, today)) return { text: 'Today', class: 'fft-pill-green' }
  if (d > today) return { text: 'Upcoming', class: 'fft-pill-amber' }
  if (stillPlanned) return { text: 'Not logged yet', class: 'fft-pill-peach' }
  return { text: activeEntries.value.length ? 'Completed' : 'Past', class: 'fft-pill-gray' }
})

const daySummary = computed(() => {
  const list = activeEntries.value
  const ingredients = list.flatMap((e) => e.recipe.ingredients)
  const inPantry = ingredients.filter((i) => i.inPantry).length
  return {
    kcal: sum(list, kcalOf).toLocaleString(),
    count: list.length,
    minutes: sum(list.filter((e) => e.status !== 'Skipped'), (e) => e.recipe.prepMinutes || 0),
    pantryPercent: ingredients.length ? Math.round((inPantry / ingredients.length) * 100) : null,
  }
})

// Ingredients not in the pantry across this week's non-skipped meals (unique by name)
const missingIngredients = computed(() => {
  const names = new Set()
  for (const e of entries.value) {
    if (e.status === 'Skipped') continue
    for (const ing of e.recipe.ingredients) {
      if (!ing.inPantry) names.add(ing.name.toLowerCase())
    }
  }
  return [...names]
})

const ctaText = computed(() =>
  hasPlan.value
    ? `${missingIngredients.value.length} ingredients needed for this week's ${entries.value.length} planned meals.`
    : 'Plan some meals for this week to build your grocery list.'
)

/* ---------- Modals ---------- */
const addTarget = ref(null) // { date: 'YYYY-MM-DD', mealSlot: 'Dinner' }
const selectedEntry = ref(null)
const swapEntry = ref(null)

function openAddMeal(slot = 'Dinner') {
  addTarget.value = { date: toISODate(days.value[activeIndex.value].date), mealSlot: slot }
}

<<<<<<< Updated upstream
=======
// The Dashboard's "+ Plan" buttons link here as /planner?day=3&add=dinner:
// jump to that day (this week) and open the Add Meal modal for that meal time.
onMounted(() => {
  const day = Number(route.query.day)
  const slot = String(route.query.add || '')
  if (!Number.isInteger(day) || day < 0 || day > 6 || !['breakfast', 'lunch', 'dinner', 'snack'].includes(slot)) return
  weekOffset.value = 0
  activeIndex.value = day
  openAddMeal(capitalize(slot))
  router.replace({ query: {} }) // so refreshing the page doesn't reopen the modal
})

>>>>>>> Stashed changes
/* ---------- Add Meal modal: searching saved + Spoonacular recipes ---------- */
// The modal emits 'search' as the user types (debounced); this page calls the API and passes
// the results back in as props (same pattern as the pantry's suggestions modal).
const recipeSearch = ref({ query: '', saved: [], online: [], warning: '', loading: false, error: '' })
let latestSearch = 0 // ignore a slow response if the user has typed something newer

async function searchRecipes(query) {
  const requestId = ++latestSearch
  recipeSearch.value = { query, saved: [], online: [], warning: '', loading: true, error: '' }
  try {
    const { data } = await api.get('/recipe-search', { params: { search: query } })
    if (requestId === latestSearch) {
      recipeSearch.value = { query, saved: data.saved, online: data.online, warning: data.warning || '', loading: false, error: '' }
    }
  } catch (err) {
    if (requestId === latestSearch) {
      recipeSearch.value = { ...recipeSearch.value, loading: false, error: errorMessage(err, 'Could not search recipes.') }
    }
  }
}

function closeAddMeal() {
  addTarget.value = null
  latestSearch++ // drop any search still in flight
  recipeSearch.value = { query: '', saved: [], online: [], warning: '', loading: false, error: '' }
}

// payload from addmeal.vue: { date, day, mealSlot: 'Dinner', servings, recipe }
async function addMealToPlan(payload) {
  const chosenDay = new Date(`${payload.date}T00:00:00`)
  const dayOfWeek = Math.round((chosenDay - weekStart.value) / 86400000) // ms in a day
  const body = {
    start: weekStartISO.value,
    dayOfWeek,
    mealSlot: payload.mealSlot.toLowerCase(),
    servings: payload.servings,
  }
  if (payload.recipe.source === 'spoonacular') {
    // Not in our database yet: the server fetches the full recipe from Spoonacular and saves it first
    body.spoonacularId = payload.recipe.externalId
  } else {
    body.recipeId = payload.recipe.id
  }
  await saveChange(api.post('/entries', body))
  if (errorMsg.value) return // saveChange shows the error (e.g. Spoonacular quota reached)
  activeIndex.value = dayOfWeek // jump to the day the meal was added to
  if (body.spoonacularId) loadRecipeOptions() // the new recipe is saved now, so it shows in Quick Suggestions and Swap
}

// from viewRecipe.vue and the status dropdown on each card: { entryId, status }
async function onStatusChange({ entryId, status }) {
  const title = plan.value.entries.find((e) => e.id === entryId)?.recipe.title || 'this meal'
  const data = await saveChange(api.patch(`/entries/${entryId}`, { status }))
  if (data) pantryNote.value = describePantryUpdate(data.pantryUpdate, title)
}

/* ---------- Card controls: status + meal time ---------- */
// value = what the database stores, label/icon/tone = how the picker on the card looks
const STATUS_OPTIONS = [
  { value: 'Planned', label: 'Planned', icon: 'schedule', tone: 'planned' },
  { value: 'Cooked', label: 'Cooked', icon: 'check_circle', tone: 'cooked' },
  { value: 'Skipped', label: 'Skipped', icon: 'do_not_disturb_on', tone: 'skipped' },
]
const SLOT_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast', icon: 'bakery_dining' },
  { value: 'lunch', label: 'Lunch', icon: 'lunch_dining' },
  { value: 'dinner', label: 'Dinner', icon: 'dinner_dining' },
  { value: 'snack', label: 'Snack', icon: 'cookie' },
]
const statusMeta = (status) => STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0]
const slotMeta = (slot) => SLOT_OPTIONS.find((s) => s.value === slot) || SLOT_OPTIONS[0]

// The pickers always show the saved value (not v-model), so the server stays the source of truth.
// If a save fails, bumping this key re-draws the pickers back to the saved value.
const controlsKey = ref(0)

async function changeStatus(entry, status) {
  if (status === entry.status) return
  await onStatusChange({ entryId: entry.id, status })
  if (errorMsg.value) controlsKey.value++
}

// Moving to a meal time that's already taken that day swaps the two meals (handled by the server)
async function changeMealTime(entry, slot) {
  if (slot === entry.slotKey) return
  await saveChange(api.patch(`/entries/${entry.id}`, { mealSlot: slot }))
  if (errorMsg.value) controlsKey.value++
}

// from swapRecipe.vue: { entryId, recipe }
function swapMeal({ entryId, recipe }) {
  return saveChange(api.patch(`/entries/${entryId}`, { recipeId: recipe.id }))
}

async function removeEntry(entry) {
  const ok = await confirm({
    title: `Remove ${entry.recipe.title}?`,
    // a Cooked meal keeps what it took from the pantry: it was eaten, removing it doesn't un-cook it
    message: entry.status === 'Cooked'
      ? `It comes off ${entry.day}'s ${entry.mealSlot.toLowerCase()}. What it used from your pantry stays used.`
      : `It comes off ${entry.day}'s ${entry.mealSlot.toLowerCase()} and its ingredients leave your shopping list next time you update it.`,
    confirmText: 'Remove meal',
  })
  if (!ok) return
  return saveChange(api.delete(`/entries/${entry.id}`))
}

/* ---------- Weekly macro split (stats row) ---------- */
// Share of the week's calories that come from each macro (protein & carbs = 4 kcal/g, fat = 9 kcal/g).
// Skipped meals aren't eaten, so they don't count. Shown as one split bar next to the stat tiles.
const macros = computed(() => {
  const eaten = entries.value.filter((e) => e.status !== 'Skipped')
  const grams = (key) => Math.round(sum(eaten, (e) => e.recipe.nutrition[key] || 0))
  const protein = grams('protein')
  const carbs = grams('carbs')
  const fat = grams('fat')
  const totalKcal = protein * 4 + carbs * 4 + fat * 9
  const pct = (kcal) => (totalKcal ? Math.round((kcal / totalKcal) * 100) : 0)
  return [
    { name: 'Protein', grams: protein, percent: pct(protein * 4), colorClass: 'fft-macro-protein' },
    { name: 'Carbs', grams: carbs, percent: pct(carbs * 4), colorClass: 'fft-macro-carbs' },
    { name: 'Fat', grams: fat, percent: pct(fat * 9), colorClass: 'fft-macro-fat' },
  ]
})
const hasMacros = computed(() => macros.value.some((m) => m.grams > 0))

/* ---------- Grocery sync button ---------- */
// Rebuilds this week's shopping list from the meal plan on the server.
// The server keeps items the user added by hand and items already ticked off.
const syncState = ref('idle') // idle | syncing | done
const itemsToBuy = ref(0) // how many items on the rebuilt list still need buying

const syncLabel = computed(() => {
  if (syncState.value === 'syncing') return 'Updating Grocery List...'
  if (syncState.value === 'done') {
    return itemsToBuy.value === 1 ? '1 Item to Buy' : `${itemsToBuy.value} Items to Buy`
  }
  return 'Build Shopping List'
})
const syncIcon = computed(() => {
  if (syncState.value === 'syncing') return 'sync'
  if (syncState.value === 'done') return 'check'
  return 'post_add'
})

// Same week as the planner, so "Go to shopping list" opens the matching list
const shoppingListLink = computed(() => ({ path: '/shoppinglist', query: { start: weekStartISO.value } }))

async function sendToGrocery() {
  if (syncState.value === 'syncing') return
  syncState.value = 'syncing'
  errorMsg.value = ''
  try {
    const { data } = await shoppingApi.post('/generate', { start: weekStartISO.value })
    // quantity 0 = the pantry already covers it; purchased = already ticked off
    itemsToBuy.value = data.items.filter((item) => item.quantity > 0 && !item.purchased).length
    syncState.value = 'done'
    // Show "N items to buy" for a moment, then open the list (that's what the user wants next)
    setTimeout(() => {
      syncState.value = 'idle'
      router.push(shoppingListLink.value)
    }, 900)
  } catch (err) {
    errorMsg.value = errorMessage(err, 'Could not update your grocery list.')
    syncState.value = 'idle'
  }
}
</script>

<template>
  <div class="foodforthought">
    <main class="fft-main">
      <!-- ============ CONTROL BAR + STATS ============ -->
      <section class="fft-controls px-4 py-3">
        <div class="container-fluid fft-container d-flex flex-column gap-3">
          <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
            <div class="d-flex align-items-center flex-wrap gap-3">
              <div class="d-flex align-items-baseline flex-wrap gap-2">
                <span class="fft-headline-lg text-nowrap">Week of {{ weekRange }}</span>
                <span class="fft-tag">{{ weekLabel }}</span>
              </div>

              <!-- Week navigator -->
              <div class="fft-week-switcher d-flex align-items-center gap-1">
                <button class="fft-icon-btn fft-icon-btn-sm" title="Previous week" aria-label="Previous week"
                  type="button" @click="weekOffset--">
                  <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <button type="button" class="fft-chip" :disabled="weekOffset === 0" title="Jump to the current week"
                  @click="weekOffset = 0">
                  This week
                </button>
                <button class="fft-icon-btn fft-icon-btn-sm" title="Next week" aria-label="Next week" type="button"
                  @click="weekOffset++">
                  <span class="material-symbols-outlined">chevron_right</span>
                </button>
              </div>

              <span v-if="loading || saving" class="fft-label-sm text-fft-muted d-flex align-items-center gap-1"
                role="status">
                <span class="material-symbols-outlined fft-spin" style="font-size: 16px">progress_activity</span>
                {{ saving ? 'Saving...' : 'Loading...' }}
              </span>
            </div>
          </div>

          <!-- Metric tiles + weekly macro split -->
          <div class="row g-3 pt-1">
            <div v-for="m in metrics" :key="m.label" class="col-6 col-lg-3">
              <div class="fft-tile d-flex align-items-center justify-content-between h-100">
                <div class="d-flex flex-column">
                  <span class="fft-label-sm fft-upper text-fft-muted">{{ m.label }}</span>
                  <span class="fft-headline-md" :class="{ 'text-fft-primary': m.accent }">
                    {{ m.value }}
                    <span v-if="m.unit" class="fft-body-sm text-fft-outline">{{ m.unit }}</span>
                    <span v-if="m.note" class="fft-label-sm text-fft-primary ms-1">{{ m.note }}</span>
                  </span>
                </div>
                <div class="fft-round-icon d-none d-sm-flex" :class="m.bg">
                  <span class="material-symbols-outlined" style="font-size: 20px">{{ m.icon }}</span>
                </div>
              </div>
            </div>

            <!-- Macro split: one bar split by % of calories, grams underneath -->
            <div class="col-12 col-lg-6">
              <div class="fft-tile h-100 d-flex flex-column justify-content-center gap-2" data-testid="macro-split">
                <div class="d-flex align-items-center justify-content-between gap-2">
                  <span class="fft-label-sm fft-upper text-fft-muted">Weekly Macro Split</span>
                  <span class="fft-label-sm text-fft-outline">% of calories</span>
                </div>
                <div class="fft-macro-bar" role="img"
                  :aria-label="macros.map((m) => `${m.name} ${m.percent}%`).join(', ')">
                  <template v-if="hasMacros">
                    <span v-for="m in macros" :key="m.name" :class="m.colorClass" :style="{ width: `${m.percent}%` }"></span>
                  </template>
                </div>
                <div class="d-flex flex-wrap column-gap-3 row-gap-1">
                  <span v-for="m in macros" :key="m.name" class="fft-macro-legend">
                    <span class="fft-macro-dot" :class="m.colorClass"></span>
                    <strong>{{ m.name }}</strong> {{ m.percent }}%
                    <span class="text-fft-outline">· {{ m.grams }}g</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ PLANNER ============ -->
      <section class="px-4 py-4">
        <div class="container-fluid fft-container">
          <PageIntro page="planner" class="mb-4" />

          <AppAlert v-if="errorMsg" tone="error" title="That didn't work" @dismiss="errorMsg = ''">
            {{ errorMsg }}
          </AppAlert>
          <AppAlert v-if="pantryNote" :tone="pantryNote.tone" :title="pantryNote.title" icon="kitchen"
            @dismiss="pantryNote = null">
            <p v-for="line in pantryNote.lines" :key="line" class="m-0">{{ line }}</p>
          </AppAlert>

          <div class="row g-4 align-items-start">
            <!-- Left: day picker + meals -->
            <div class="col-12 col-xl">
              <div class="d-flex flex-column gap-4">
                <!-- Day tabs -->
                <div class="fft-day-strip">
                  <div class="d-flex align-items-center gap-1 p-1 fft-day-strip-inner">
                    <button v-for="(d, i) in days" :key="d.name" type="button" class="fft-day"
                      :class="{ active: activeIndex === i }" @click="activeIndex = i">
                      <div class="d-flex align-items-center gap-2">
                        <span class="fft-label-md fw-semibold">{{ d.name }}</span>
                        <span v-if="d.today" class="fft-today-pill">Today</span>
                        <span v-else class="fft-day-count" title="Cooked / planned">{{ d.meals }}</span>
                      </div>
                      <span class="fft-day-kcal">
                        {{ d.kcal }} kcal<template v-if="d.today"> · {{ d.meals }}</template>
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Day summary -->
                <div class="fft-card fft-card-bordered p-0 overflow-hidden">
                  <div class="p-3 d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
                    <div class="d-flex flex-column gap-1">
                      <div class="d-flex align-items-center flex-wrap gap-2">
                        <h2 class="fft-headline-md m-0">{{ activeDayLong }}</h2>
                        <span class="fft-pill" :class="dayStatus.class">{{ dayStatus.text }}</span>
                      </div>
                      <div v-if="daySummary.count === 0" class="fft-label-sm text-fft-muted">No meals planned yet</div>
                      <div v-else class="fft-meta-list fft-label-sm text-fft-muted">
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-secondary"
                            style="font-size: 16px">local_fire_department</span>
                          <strong>{{ daySummary.kcal }}</strong> kcal
                        </span>
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-primary" style="font-size: 16px">restaurant</span>
                          {{ daySummary.count }} {{ daySummary.count === 1 ? 'meal' : 'meals' }}
                        </span>
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-outline" style="font-size: 16px">timer</span>
                          {{ daySummary.minutes }}m prep
                        </span>
                        <span v-if="daySummary.pantryPercent !== null"
                          class="d-flex align-items-center gap-1 text-fft-primary fw-medium">
                          <span class="material-symbols-outlined" style="font-size: 16px">inventory_2</span>
                          {{ daySummary.pantryPercent }}% in pantry
                        </span>
                      </div>
                    </div>
                    <button v-if="daySummary.count > 0" type="button"
                      class="btn fft-btn-soft d-flex align-items-center gap-1 flex-shrink-0" @click="openAddMeal()">
                      <span class="material-symbols-outlined" style="font-size: 16px">add</span>Add Meal
                    </button>
                  </div>

                  <!-- Shopping sync -->
                  <div
                    class="fft-sync-bar d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                    <div class="d-flex align-items-center gap-2 px-3 py-1">
                      <div class="fft-round-icon fft-bg-green-light text-fft-primary">
                        <span class="material-symbols-outlined" style="font-size: 20px">shopping_cart_checkout</span>
                      </div>
                      <div class="d-flex flex-column">
                        <span class="fft-label-md">Ready to shop?</span>
                        <span class="fft-body-sm text-fft-muted">{{ ctaText }}</span>
                        <router-link :to="shoppingListLink" class="fft-inline-link d-inline-flex align-items-center gap-1">
                          Go to shopping list
                          <span class="material-symbols-outlined" style="font-size: 16px">arrow_forward</span>
                        </router-link>
                      </div>
                    </div>
                    <button type="button"
                      class="btn fft-btn-primary d-flex align-items-center justify-content-center gap-2 flex-shrink-0"
                      :disabled="syncState !== 'idle' || !hasPlan" @click="sendToGrocery">
                      <span class="material-symbols-outlined" :class="{ 'fft-spin': syncState === 'syncing' }"
                        style="font-size: 18px">{{ syncIcon }}</span>
                      <span>{{ syncLabel }}</span>
                    </button>
                  </div>
                </div>

                <!-- Empty day -->
                <div v-if="activeEntries.length === 0 && !loading"
                  class="fft-card fft-card-bordered text-center py-5 d-flex flex-column align-items-center gap-2">
                  <span class="material-symbols-outlined text-fft-outline" style="font-size: 40px">edit_calendar</span>
                  <h3 class="fft-headline-sm m-0">Nothing planned for {{ activeDayLong }} yet</h3>
                  <p class="fft-body-sm text-fft-muted m-0">Add a meal to get started.</p>
                  <button class="btn fft-btn-primary d-flex align-items-center gap-1 mt-2" type="button"
                    :disabled="saving" @click="openAddMeal()">
                    <span class="material-symbols-outlined" style="font-size: 18px">add</span>
                    <span>Add Meal</span>
                  </button>
                </div>

                <!-- Meal cards: recipe info on top, one action bar underneath (same layout for every card) -->
                <div v-else class="d-flex flex-column gap-3">
                  <article v-for="entry in activeEntries" :key="entry.id"
                    class="fft-card fft-card-bordered fft-hover-lift p-0 overflow-hidden fft-meal"
                    :class="[`fft-meal--${statusMeta(entry.status).tone}`, { 'fft-meal--skipped': entry.status === 'Skipped' }]"
                    data-testid="meal-card">
                    <div class="d-flex flex-column flex-md-row">
                      <!-- Every card has a photo: the recipe's own, or a placeholder if it has none (or it fails to load) -->
                      <div class="fft-meal-img position-relative flex-shrink-0">
                        <img :src="entry.recipe.image || MEAL_PLACEHOLDER" :alt="entry.recipe.image ? entry.recipe.title : ''"
                          class="fft-cover" loading="lazy" @error="usePlaceholder" />
                      </div>

                      <div class="p-3 d-flex flex-column gap-2 flex-grow-1 fft-min-0">
                        <div class="d-flex align-items-start justify-content-between gap-2">
                          <div class="d-flex align-items-center flex-wrap gap-2">
                            <span class="fft-pill fft-slot-pill" :class="SLOT_PILL[entry.slotKey]">
                              <span class="material-symbols-outlined" aria-hidden="true">{{ slotMeta(entry.slotKey).icon }}</span>
                              {{ entry.mealSlot }}
                            </span>
                            <span v-for="tag in entry.recipe.tags.slice(0, 2)" :key="tag"
                              class="fft-pill fft-pill-gray fw-semibold">{{ tag }}</span>
                          </div>
                          <!-- big status badge: the first thing you see on each card -->
                          <span class="fft-status-badge" :class="`fft-status-badge--${statusMeta(entry.status).tone}`">
                            <span class="material-symbols-outlined" aria-hidden="true">{{ statusMeta(entry.status).icon }}</span>
                            {{ statusMeta(entry.status).label }}
                          </span>
                        </div>

                        <h3 class="fft-headline-sm m-0">{{ entry.recipe.title }}</h3>
                        <p v-if="entry.recipe.description" class="fft-body-sm text-fft-muted m-0 fft-clamp-2">
                          {{ entry.recipe.description }}</p>

                        <!-- the dots between items are drawn by .fft-meta-list, so none dangle at the start of a line -->
                        <div class="fft-meta-list fft-label-sm text-fft-muted">
                          <span class="fw-semibold text-fft-dark">{{ entry.recipe.nutrition.calories ?? '–' }} kcal</span>
                          <span>{{ entry.recipe.nutrition.protein ?? '–' }}g protein</span>
                          <span>{{ entry.recipe.nutrition.carbs ?? '–' }}g carbs</span>
                          <span>{{ entry.servings }} {{ entry.servings === 1 ? 'serving' : 'servings' }}</span>
                          <span v-if="entry.recipe.prepMinutes">{{ entry.recipe.prepMinutes }}m prep</span>
                        </div>

                        <div v-if="entry.recipe.ingredients.length" class="d-flex align-items-center flex-wrap gap-2">
                          <span class="fft-label-sm text-fft-outline">Pantry:</span>
                          <span v-for="ing in entry.recipe.ingredients.filter((i) => i.inPantry).slice(0, 4)"
                            :key="ing.name" class="fft-label-sm text-fft-primary d-flex align-items-center">
                            <span class="material-symbols-outlined" style="font-size: 14px">check</span>{{ ing.name }}
                          </span>
                          <span v-if="entry.recipe.ingredients.some((i) => !i.inPantry)" class="fft-pill fft-pill-peach fw-semibold">
                            {{ entry.recipe.ingredients.filter((i) => !i.inPantry).length }} to buy
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Action bar: status toggle + meal time picker, then recipe / swap / remove -->
                    <div class="fft-meal-actions">
                      <div :key="`${entry.id}-${controlsKey}`" class="fft-controls-row">
                        <!-- Status: all three choices visible, one tap to change (was a dropdown) -->
                        <div class="fft-status-toggle" role="radiogroup" :aria-label="`Status of ${entry.recipe.title}`">
                          <button v-for="s in STATUS_OPTIONS" :key="s.value" type="button" role="radio"
                            class="fft-status-option" :class="`fft-status-option--${s.tone}`"
                            :aria-checked="entry.status === s.value" :disabled="saving"
                            @click="changeStatus(entry, s.value)">
                            <span class="material-symbols-outlined" aria-hidden="true">{{ s.icon }}</span>
                            {{ s.label }}
                          </button>
                        </div>

                        <div class="fft-picker" :class="{ 'is-disabled': saving }"
                          title="Moving to a meal time that's already taken swaps the two meals">
                          <span class="material-symbols-outlined fft-picker-icon" aria-hidden="true">{{
                            slotMeta(entry.slotKey).icon }}</span>
                          <span class="fft-picker-text">
                            <span class="fft-picker-label">Meal time</span>
                            <span class="fft-picker-value">{{ slotMeta(entry.slotKey).label }}</span>
                          </span>
                          <span class="material-symbols-outlined fft-picker-chevron" aria-hidden="true">expand_more</span>
                          <select class="fft-picker-select" aria-label="Meal time" :value="entry.slotKey"
                            :disabled="saving" @change="changeMealTime(entry, $event.target.value)">
                            <option v-for="s in SLOT_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
                          </select>
                        </div>
                      </div>

                      <div class="fft-meal-buttons">
                        <button class="btn fft-btn-soft d-flex align-items-center gap-1" type="button"
                          @click="selectedEntry = entry">
                          <span class="material-symbols-outlined" style="font-size: 16px">menu_book</span>Recipe
                        </button>
                        <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button"
                          :disabled="saving" title="Swap for another recipe" @click="swapEntry = entry">
                          <span class="material-symbols-outlined" style="font-size: 16px">swap_horiz</span>Swap
                        </button>
                        <button class="btn fft-btn-ghost fft-btn-danger d-flex align-items-center gap-1" type="button"
                          :disabled="saving" :aria-label="`Remove ${entry.recipe.title}`" @click="removeEntry(entry)">
                          <span class="material-symbols-outlined" style="font-size: 16px">delete</span>Remove
                        </button>
                      </div>
                    </div>
                  </article>
                </div>

                <!-- Modals (teleported to <body>, so their position here doesn't matter) -->
                <AddMealModal v-if="addTarget" :default-date="addTarget.date" :default-slot="addTarget.mealSlot"
                  :recipes="recipeOptions" :search-results="recipeSearch" @search="searchRecipes"
                  @close="closeAddMeal" @add="addMealToPlan" />
                <RecipeModal v-if="selectedEntry" :entry="selectedEntry" @close="selectedEntry = null"
                  @update-status="onStatusChange" />
                <SwapMealModal v-if="swapEntry" :entry="swapEntry" :recipes="recipeOptions" @close="swapEntry = null"
                  @swap="swapMeal" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
<style scoped>
/* ===== Design tokens (from the original Tailwind config) ===== */
.foodforthought {
  --fft-background: #fafaf3;
  --fft-surface: #fafaf3;
  --fft-surface-lowest: #ffffff;
  --fft-surface-low: #f4f4ed;
  --fft-surface-container: #eeeee8;
  --fft-surface-high: #e8e9e2;
  --fft-surface-highest: #e3e3dc;
  --fft-on-surface: #1a1c18;
  --fft-on-surface-variant: #424842;
  --fft-outline: #727972;
  --fft-outline-variant: #c2c8c0;

  --fft-primary: #32533c;
  --fft-primary-container: #4a6b53;
  --fft-on-primary: #ffffff;
  --fft-on-primary-container: #c5eacc;
  --fft-primary-fixed: #c7ecce;
  --fft-primary-fixed-dim: #abcfb2;
  --fft-on-primary-fixed: #01210f;

  --fft-secondary: #a23e18;
  --fft-secondary-fixed: #ffdbcf;
  --fft-on-secondary-fixed: #390c00;

  --fft-tertiary: #6b4400;
  --fft-tertiary-fixed: #ffddb5;
  --fft-on-tertiary-fixed: #2a1800;

  --fft-radius: 0.5rem;
  --fft-radius-xl: 0.75rem;
  --fft-radius-2xl: 1rem;

  font-family: 'Inter', sans-serif;
  font-size: 15px;
  line-height: 24px;
  color: var(--fft-on-surface);
  background: var(--fft-background);
  min-height: 100vh;
  min-height: 100dvh;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

.foodforthought *::-webkit-scrollbar {
  display: none;
}

.foodforthought .material-symbols-outlined {
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

/* ===== Typography helpers ===== */
.foodforthought .fft-headline-lg {
  font: 600 32px/40px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
}

.foodforthought .fft-headline-md {
  font: 500 24px/32px 'Outfit', sans-serif;
}

.foodforthought .fft-headline-sm {
  font: 500 20px/28px 'Outfit', sans-serif;
}

.foodforthought h2.fft-headline-md,
.foodforthought h3.fft-headline-md,
.foodforthought h3.fft-headline-sm,
.foodforthought .fft-headline-sm.fw-semibold {
  font-weight: 600;
}

.foodforthought .fft-label-md {
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
}

.foodforthought .fft-label-sm {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}

.foodforthought .fft-body-sm {
  font: 400 13px/20px 'Inter', sans-serif;
}

.foodforthought .fft-upper {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.foodforthought .text-fft-primary {
  color: var(--fft-primary) !important;
}

.foodforthought .text-fft-secondary {
  color: var(--fft-secondary) !important;
}

.foodforthought .text-fft-muted {
  color: var(--fft-on-surface-variant) !important;
}

.foodforthought .text-fft-outline {
  color: var(--fft-outline) !important;
}

.foodforthought .text-fft-dark {
  color: var(--fft-on-surface) !important;
}

.foodforthought .fft-min-0 {
  min-width: 0;
}

.foodforthought .fft-cover {
  object-fit: cover;
}

/* ===== Week switcher + icon buttons ===== */

.foodforthought .fft-week-switcher {
  background: var(--fft-surface-low);
  padding: 4px;
  border-radius: var(--fft-radius);
}

.foodforthought .fft-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--fft-radius);
  background: var(--fft-surface-low);
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s, color 0.15s;
}

.foodforthought .fft-icon-btn:hover {
  background: var(--fft-surface-high);
  color: var(--fft-on-surface);
}

.foodforthought .fft-icon-btn .material-symbols-outlined {
  font-size: 20px;
}

.foodforthought .fft-icon-btn-sm {
  width: 32px;
  height: 32px;
  background: transparent;
}

.foodforthought .fft-icon-btn-sm .material-symbols-outlined {
  font-size: 18px;
}

/* ===== Buttons ===== */
.foodforthought .btn {
  border: 0;
  border-radius: var(--fft-radius);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  padding: 8px 16px;
  transition: background-color 0.15s, color 0.15s;
}

.foodforthought .fft-btn-primary {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.foodforthought .fft-btn-primary:hover {
  background: var(--fft-primary-container);
  color: var(--fft-on-primary);
}

.foodforthought .fft-btn-soft {
  background: var(--fft-surface-low);
  color: var(--fft-on-surface);
}

.foodforthought .fft-btn-soft:hover {
  background: var(--fft-surface-high);
  color: var(--fft-on-surface);
}

.foodforthought .fft-btn-ghost {
  background: transparent;
  color: var(--fft-outline);
  padding: 8px 12px;
}

.foodforthought .fft-btn-ghost:hover {
  color: var(--fft-on-surface);
  background: transparent;
}

/* ===== Main layout ===== */
.foodforthought .fft-main {
  padding-top: 0;
  background: var(--fft-background);
  min-height: 100vh;
  min-height: 100dvh;
}

.foodforthought .fft-container {
  /* same content width on the planner, shopping list and pantry */
  max-width: 1140px;
  padding-left: 0;
  padding-right: 0;
}

/* ===== Control bar ===== */
.foodforthought .fft-controls {
  background: var(--fft-surface-low);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.foodforthought .fft-tag {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fft-primary);
  background: var(--fft-primary-fixed);
  padding: 2px 8px;
  border-radius: 4px;
}

.foodforthought .fft-chip {
  border: 0;
  border-radius: 9999px;
  padding: 4px 12px;
  background: var(--fft-surface-high);
  color: var(--fft-on-surface-variant);
  font: 600 11px/14px 'Inter', sans-serif;
  transition: background-color 0.15s;
}

.foodforthought .fft-chip:hover {
  background: var(--fft-surface-highest);
}

.foodforthought .fft-chip:disabled {
  opacity: 0.5;
  cursor: default;
}

.foodforthought .fft-chip.active {
  background: var(--fft-primary-container);
  color: var(--fft-on-primary-container);
}

/* ===== Cards, tiles, pills ===== */
.foodforthought .fft-tile {
  background: var(--fft-surface-lowest);
  padding: 16px;
  border-radius: var(--fft-radius-xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.foodforthought .fft-round-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.foodforthought .fft-bg-green-light {
  background: var(--fft-primary-fixed);
}

.foodforthought .fft-bg-peach {
  background: var(--fft-secondary-fixed);
}

.foodforthought .fft-card {
  background: var(--fft-surface-lowest);
  padding: 16px;
  border-radius: var(--fft-radius-2xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.foodforthought .fft-card-bordered {
  border: 1px solid rgba(194, 200, 192, 0.4);
}

.foodforthought .fft-hover-lift {
  transition: box-shadow 0.2s;
}

@media (hover: hover) and (pointer: fine) {
.foodforthought .fft-hover-lift:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
}

.foodforthought .fft-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}

.foodforthought .fft-pill-gray {
  background: var(--fft-surface-high);
  color: var(--fft-on-surface-variant);
}

.foodforthought .fft-pill-green {
  background: var(--fft-primary-fixed);
  color: var(--fft-on-primary-fixed);
}

.foodforthought .fft-pill-peach {
  background: var(--fft-secondary-fixed);
  color: var(--fft-on-secondary-fixed);
}

.foodforthought .fft-pill-amber {
  background: var(--fft-tertiary-fixed);
  color: var(--fft-on-tertiary-fixed);
}

/* ===== Day strip ===== */
.foodforthought .fft-day-strip {
  background: var(--fft-surface-low);
  padding: 4px;
  border-radius: var(--fft-radius-2xl);
  overflow-x: auto;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.foodforthought .fft-day-strip-inner {
  min-width: max-content;
}

.foodforthought .fft-day {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 0;
  padding: 8px 16px;
  border-radius: var(--fft-radius-xl);
  background: rgba(255, 255, 255, 0.7);
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s;
}

.foodforthought .fft-day:hover {
  background: var(--fft-surface-lowest);
}

.foodforthought .fft-day-count {
  font: 600 11px/14px 'Inter', sans-serif;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--fft-surface-container);
  color: var(--fft-outline);
}

.foodforthought .fft-day-kcal {
  font: 400 12px/18px 'Inter', sans-serif;
  color: var(--fft-outline);
  margin-top: 2px;
}

.foodforthought .fft-today-pill {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 9999px;
  background: var(--fft-primary-fixed);
  color: var(--fft-on-primary-fixed);
}

.foodforthought .fft-day.active {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  padding: 8px 24px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.foodforthought .fft-day.active .fft-day-kcal {
  color: var(--fft-primary-fixed);
  font-weight: 500;
}

.foodforthought .fft-day.active .fft-day-count {
  background: rgba(255, 255, 255, 0.2);
  color: var(--fft-on-primary);
}

/* ===== Meal photo (same on every card) ===== */
.foodforthought .fft-meal-img {
  width: 100%;
  height: 170px;
  background: #e1ede1;
  overflow: hidden;
}

/* the photo fills its box instead of setting the card's height */
.foodforthought .fft-meal-img img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

@media (min-width: 768px) {
  .foodforthought .fft-meal-img {
    width: 220px;
    height: auto;
    min-height: 180px;
  }
}

/* ===== Meal card action bar ===== */
.foodforthought .fft-meal-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--fft-outline-variant, rgba(194, 200, 192, 0.6));
  background: var(--fft-surface-low);
}

.foodforthought .fft-meal-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.foodforthought .fft-btn-danger:hover {
  color: var(--fft-secondary);
}

/* a skipped meal fades back so the meals still to cook stand out */
.foodforthought .fft-meal--skipped > :first-child {
  opacity: 0.6;
}

.foodforthought .fft-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* "380 kcal · 14g protein · 1 serving": dots go BETWEEN items. The list is shifted left and
   clipped, so the dot in front of the first item on each line is hidden, even after wrapping. */
.foodforthought .fft-meta-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  row-gap: 4px;
  margin-left: -14px;
  clip-path: inset(-4px -4px -4px 14px);
}

.foodforthought .fft-meta-list > * {
  position: relative;
  padding-left: 14px;
}

.foodforthought .fft-meta-list > *::before {
  content: '·';
  position: absolute;
  left: 4px;
  font-weight: 700;
  color: var(--fft-outline);
}

/* ===== Weekly macro split ===== */
.foodforthought .fft-macro-bar {
  display: flex;
  height: 10px;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--fft-surface-high);
}

.foodforthought .fft-macro-bar > span {
  height: 100%;
  transition: width 0.3s ease;
}

.foodforthought .fft-macro-bar > span + span {
  border-left: 2px solid var(--fft-surface-lowest);
}

.foodforthought .fft-macro-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 400 13px/18px 'Inter', sans-serif;
  color: var(--fft-on-surface-variant);
}

.foodforthought .fft-macro-legend strong {
  font-weight: 600;
  color: var(--fft-on-surface);
}

.foodforthought .fft-macro-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.foodforthought .fft-macro-protein { background: var(--fft-primary); }

.foodforthought .fft-macro-carbs { background: #c9a227; }

.foodforthought .fft-macro-fat { background: var(--fft-secondary); }

/* ===== "Ready to shop?" bar under the day summary ===== */
.foodforthought .fft-sync-bar {
  padding: 12px 16px;
  border-top: 1px solid var(--fft-outline-variant, rgba(194, 200, 192, 0.6));
  background: var(--fft-surface-low);
}

.foodforthought .fft-sync-bar > :first-child {
  padding: 0 !important;
}



/* ===== Meal time picker =====
   Each picker is a styled pill with a real <select> stretched invisibly over it:
   clicking anywhere on the pill opens the native list (keyboard, screen readers and
   phone pickers still work), while the pill shows the saved value. */
.foodforthought .fft-controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* ---------- Meal slot label (Breakfast / Lunch / Dinner / Snack) ---------- */
.foodforthought .fft-slot-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px 5px 10px;
  font: 600 15px/20px 'Outfit', sans-serif;
  letter-spacing: 0.01em;
}
.foodforthought .fft-slot-pill .material-symbols-outlined { font-size: 18px; }

/* ---------- Meal status: badge, coloured card edge, and the 3-way toggle ----------
   amber = Planned, green = Cooked, rust = Skipped (the same three colours everywhere) */
.foodforthought .fft-meal {
  border-left-width: 6px;
  border-left-style: solid;
}
.foodforthought .fft-meal--planned { border-left-color: #d99a2b; }
.foodforthought .fft-meal--cooked { border-left-color: #2f6b45; }
.foodforthought .fft-meal--skipped { border-left-color: #b8573a; }

.foodforthought .fft-status-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 6px 10px;
  border-radius: 9999px;
  font: 600 14px/20px 'Inter', sans-serif;
}
.foodforthought .fft-status-badge .material-symbols-outlined {
  font-size: 20px;
  font-variation-settings: 'FILL' 1;
}
.foodforthought .fft-status-badge--planned { background: #fff1d9; color: #6b4400; }
.foodforthought .fft-status-badge--cooked { background: #2f6b45; color: #fff; }
.foodforthought .fft-status-badge--skipped { background: #fbe3da; color: #8a2f14; }

.foodforthought .fft-status-toggle {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: 14px;
  background: var(--fft-surface-high);
}
.foodforthought .fft-status-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px; /* easy to tap on a phone */
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--fft-on-surface-variant);
  font: 600 14px/20px 'Inter', sans-serif;
  transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
}
.foodforthought .fft-status-option .material-symbols-outlined { font-size: 20px; }
.foodforthought .fft-status-option:hover:not(:disabled) { background: rgba(255, 255, 255, 0.7); color: var(--fft-on-surface); }
.foodforthought .fft-status-option:focus-visible { outline: 2px solid var(--fft-primary); outline-offset: 1px; }
.foodforthought .fft-status-option:disabled { cursor: progress; }
.foodforthought .fft-status-option[aria-checked='true'] { color: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
.foodforthought .fft-status-option[aria-checked='true'] .material-symbols-outlined { font-variation-settings: 'FILL' 1; }
.foodforthought .fft-status-option--planned[aria-checked='true'] { background: #8f5c0f; }
.foodforthought .fft-status-option--cooked[aria-checked='true'] { background: #2f6b45; }
.foodforthought .fft-status-option--skipped[aria-checked='true'] { background: #a23e18; }

/* ---------- Pill ---------- */
.foodforthought .fft-picker {
  --tone-bg: var(--fft-surface-low, #f4f4ed);
  --tone-bg-hover: var(--fft-surface-high, #e8e9e2);
  --tone-fg: var(--fft-on-surface, #1a1c18);
  --tone-icon: var(--fft-outline, #727972);
  --tone-border: rgba(194, 200, 192, 0.6);

  position: relative;
  /* the invisible <select> is stretched over this */
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 168px;
  padding: 6px 8px 6px 10px;
  border-radius: var(--fft-radius-xl, 0.75rem);
  border: 1px solid var(--tone-border);
  background: var(--tone-bg);
  color: var(--tone-fg);
  transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.foodforthought .fft-picker:hover {
  background: var(--tone-bg-hover);
}

/* keyboard focus lands on the hidden <select>, so show the ring on the pill */
.foodforthought .fft-picker:focus-within {
  border-color: var(--fft-primary, #32533c);
  box-shadow: 0 0 0 3px rgba(50, 83, 60, 0.18);
}

/* ---------- Contents ---------- */
.foodforthought .fft-picker-icon {
  font-size: 18px;
  color: var(--tone-icon);
  flex-shrink: 0;
}

.foodforthought .fft-picker-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.15;
}

.foodforthought .fft-picker-label {
  font: 600 10px/12px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fft-outline, #727972);
}

.foodforthought .fft-picker-value {
  font: 600 13px/18px 'Inter', sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.foodforthought .fft-picker-chevron {
  font-size: 18px;
  color: var(--tone-icon);
  flex-shrink: 0;
  transition: transform 0.15s;
}

@media (hover: hover) and (pointer: fine) {
.foodforthought .fft-picker:hover .fft-picker-chevron {
  transform: translateY(1px);
}
}

/* ---------- The real <select>, invisible but clickable ---------- */
.foodforthought .fft-picker-select {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  font-size: 16px;
  /* stops iOS zooming in when the picker opens */
}

/* ---------- Disabled while saving ---------- */
.foodforthought .fft-picker.is-disabled {
  opacity: 0.6;
}

.foodforthought .fft-picker.is-disabled .fft-picker-select {
  cursor: progress;
}

@media (max-width: 575.98px) {
  /* phone: the two pickers side by side, buttons on their own row below */
  .foodforthought .fft-meal-actions .fft-controls-row {
    width: 100%;
    flex-direction: column;
  }

  /* status toggle fills the width, meal time picker underneath */
  .foodforthought .fft-status-toggle {
    display: flex;
    width: 100%;
  }
  .foodforthought .fft-status-option {
    flex: 1;
    padding: 0 8px;
    font-size: 13px;
  }

  .foodforthought .fft-meal-actions .fft-picker {
    flex: 1 1 auto;
    min-width: 0;
    padding-left: 10px;
    padding-right: 8px;
  }


  .foodforthought .fft-meal-buttons {
    width: 100%;
    justify-content: space-between;
  }

  .foodforthought .fft-headline-lg {
    font-size: 24px;
    line-height: 30px;
  }

  .foodforthought .fft-sync-bar .btn {
    width: 100%;
  }

}

/* ===== "Go to shopping list" link ===== */
.foodforthought .fft-inline-link {
  align-self: flex-start;
  margin-top: 2px;
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  color: var(--fft-primary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s, color 0.15s;
}

.foodforthought .fft-inline-link:hover {
  color: var(--fft-primary-container);
  border-bottom-color: currentColor;
}

@media (hover: hover) and (pointer: fine) {
.foodforthought .fft-inline-link:hover .material-symbols-outlined {
  transform: translateX(2px);
}
}

.foodforthought .fft-inline-link .material-symbols-outlined {
  transition: transform 0.15s;
}

.foodforthought .fft-inline-link:focus-visible {
  outline: 2px solid var(--fft-primary);
  outline-offset: 2px;
  border-radius: 2px;
}

.foodforthought .fft-spin {
  animation: fft-spin 0.7s linear infinite;
}

@keyframes fft-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
