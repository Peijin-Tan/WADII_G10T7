<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import axios from 'axios'
import viewRecipeModal from '../components/Mealplan/viewRecipe.vue'
import swapRecipeModal from '../components/Mealplan/swapRecipe.vue'
import addMealModal from '../components/Mealplan/addmeal.vue'

/* Bootstrap must be loaded once in your app entry (main.js):
   import 'bootstrap/dist/css/bootstrap.min.css'
   Material Symbols + fonts are loaded in the <style> block below. */

/* ---------- API ---------- */
// All planner requests go to the Express router mounted at /planner.
const api = axios.create({ baseURL: 'http://localhost:8000/planner' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/* ---------- Date helpers ---------- */
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
// 'YYYY-MM-DD' in local time (toISOString() would shift to UTC and give the previous day in Singapore)
function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const fmt = (d, opts) => d.toLocaleDateString('en-US', opts)
const sameDay = (a, b) => a.getTime() === b.getTime()
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const today = new Date()
today.setHours(0, 0, 0, 0)
const todayIndex = (today.getDay() + 6) % 7 // Monday = 0
const thisMonday = addDays(today, -todayIndex)

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
      errorMsg.value = err.response?.data?.message || 'Could not load your meal plan. Is the server running?'
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

// Every write endpoint returns the updated week, so we just replace our copy
async function saveChange(request) {
  saving.value = true
  errorMsg.value = ''
  try {
    const res = await request
    latestRequest++ // a load that was still in flight is now out of date
    loading.value = false
    plan.value = res.data
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Could not save your change. Please try again.'
  } finally {
    saving.value = false
  }
}

/* ---------- Turning API entries into what the cards + modals need ---------- */
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
const SLOT_TIMES = { breakfast: '08:00 AM', lunch: '12:30 PM', dinner: '07:00 PM', snack: '03:30 PM' }
const SLOT_PILL = { breakfast: 'fft-pill-gray', lunch: 'fft-pill-green', dinner: 'fft-pill-amber', snack: 'fft-pill-peach' }

const entries = computed(() =>
  plan.value.entries.map((e) => ({
    ...e,
    slotKey: e.mealSlot, // 'dinner' (what the API uses)
    mealSlot: capitalize(e.mealSlot), // 'Dinner' (what the modals display)
    time: SLOT_TIMES[e.mealSlot],
    day: fmt(addDays(weekStart.value, e.dayOfWeek), { weekday: 'long' }),
  }))
)

const hasPlan = computed(() => entries.value.length > 0)

const kcalOf = (entry) => entry.recipe.nutrition.calories || 0
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

const dayStatus = computed(() => {
  const d = days.value[activeIndex.value].date
  if (sameDay(d, today)) return { text: 'In Progress', class: 'fft-pill-green' }
  return d < today
    ? { text: 'Completed', class: 'fft-pill-gray' }
    : { text: 'Upcoming', class: 'fft-pill-amber' }
})

const daySummary = computed(() => {
  const list = activeEntries.value
  const ingredients = list.flatMap((e) => e.recipe.ingredients)
  const inPantry = ingredients.filter((i) => i.inPantry).length
  return {
    kcal: sum(list, kcalOf).toLocaleString(),
    count: list.length,
    minutes: sum(list, (e) => e.recipe.prepMinutes || 0),
    pantryPercent: ingredients.length ? Math.round((inPantry / ingredients.length) * 100) : null,
  }
})

function pantryPercent(entry) {
  const ings = entry.recipe.ingredients
  return ings.length ? Math.round((ings.filter((i) => i.inPantry).length / ings.length) * 100) : null
}

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
  if (payload.recipe.custom) {
    const n = payload.recipe.nutrition
    body.customMeal = { title: payload.recipe.title, calories: n.calories, protein: n.protein, carbs: n.carbs, fat: n.fat }
  } else {
    body.recipeId = payload.recipe.id
  }
  await saveChange(api.post('/entries', body))
  activeIndex.value = dayOfWeek // jump to the day the meal was added to
}

// from viewRecipe.vue (and the "Mark Cooked" button): { entryId, status }
function onStatusChange({ entryId, status }) {
  return saveChange(api.patch(`/entries/${entryId}`, { status }))
}

// from swapRecipe.vue: { entryId, recipe }
function swapMeal({ entryId, recipe }) {
  return saveChange(api.patch(`/entries/${entryId}`, { recipeId: recipe.id }))
}

function removeEntry(entry) {
  if (!window.confirm(`Remove ${entry.recipe.title} from ${entry.day} ${entry.mealSlot}?`)) return
  return saveChange(api.delete(`/entries/${entry.id}`))
}

/* ---------- Sidebar ---------- */
// Share of the week's calories that come from each macro (protein & carbs = 4 kcal/g, fat = 9 kcal/g)
const macros = computed(() => {
  const eaten = entries.value.filter((e) => e.status !== 'Skipped')
  const grams = (key) => Math.round(sum(eaten, (e) => e.recipe.nutrition[key] || 0))
  const protein = grams('protein')
  const carbs = grams('carbs')
  const fat = grams('fat')
  const totalKcal = protein * 4 + carbs * 4 + fat * 9
  const pct = (kcal) => (totalKcal ? Math.round((kcal / totalKcal) * 100) : 0)
  return [
    { name: 'Protein', grams: `${protein}g`, percent: pct(protein * 4), colorClass: 'fft-ring-primary' },
    { name: 'Carbs', grams: `${carbs}g`, percent: pct(carbs * 4), colorClass: 'fft-ring-secondary' },
    { name: 'Fats', grams: `${fat}g`, percent: pct(fat * 9), colorClass: 'fft-ring-tertiary' },
  ]
})

/* ---------- Grocery sync button ---------- */
// Still a visual placeholder: the shopping-list API isn't built yet
const syncState = ref('idle') // idle | syncing | done

const syncLabel = computed(() => {
  if (syncState.value === 'syncing') return `Syncing ${missingIngredients.value.length} Items...`
  if (syncState.value === 'done') return 'Ingredients Synced!'
  return 'Send Ingredients to Grocery List'
})
const syncIcon = computed(() => {
  if (syncState.value === 'syncing') return 'sync'
  if (syncState.value === 'done') return 'check'
  return 'post_add'
})

function sendToGrocery() {
  syncState.value = 'syncing'
  setTimeout(() => {
    syncState.value = 'done'
    setTimeout(() => {
      syncState.value = 'idle'
    }, 2500)
  }, 900)
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
              <div class="d-flex align-items-baseline gap-2">
                <span class="fft-headline-lg">Week of {{ weekRange }}</span>
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

          <!-- Metric tiles -->
          <div class="row g-3 pt-1">
            <div v-for="m in metrics" :key="m.label" class="col-6 col-md-3">
              <div class="fft-tile d-flex align-items-center justify-content-between h-100">
                <div class="d-flex flex-column">
                  <span class="fft-label-sm fft-upper text-fft-muted">{{ m.label }}</span>
                  <span class="fft-headline-md" :class="{ 'text-fft-primary': m.accent }">
                    {{ m.value }}
                    <span v-if="m.unit" class="fft-body-sm text-fft-outline">{{ m.unit }}</span>
                    <span v-if="m.note" class="fft-label-sm text-fft-primary ms-1">{{ m.note }}</span>
                  </span>
                </div>
                <div class="fft-round-icon" :class="m.bg">
                  <span class="material-symbols-outlined" style="font-size: 20px">{{ m.icon }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ PLANNER ============ -->
      <section class="px-4 py-4">
        <div class="container-fluid fft-container-wide">
          <div v-if="errorMsg" class="alert alert-danger d-flex align-items-center justify-content-between gap-2"
            role="alert">
            <span>{{ errorMsg }}</span>
            <button type="button" class="btn-close" aria-label="Dismiss" @click="errorMsg = ''"></button>
          </div>

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
                      <div v-else class="d-flex align-items-center flex-wrap gap-3 fft-label-sm text-fft-muted">
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-secondary"
                            style="font-size: 16px">local_fire_department</span>
                          <strong>{{ daySummary.kcal }}</strong> kcal planned
                        </span>
                        <span class="text-fft-outline">•</span>
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-primary"
                            style="font-size: 16px">restaurant</span>
                          {{ daySummary.count }} {{ daySummary.count === 1 ? 'meal' : 'meals' }} planned
                        </span>
                        <span class="text-fft-outline">•</span>
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-outline" style="font-size: 16px">timer</span>
                          {{ daySummary.minutes }}m prep time
                        </span>
                        <template v-if="daySummary.pantryPercent !== null">
                          <span class="text-fft-outline">•</span>
                          <span class="d-flex align-items-center gap-1 text-fft-primary fw-medium">
                            <span class="material-symbols-outlined" style="font-size: 16px">inventory_2</span>
                            {{ daySummary.pantryPercent }}% pantry stock ready
                          </span>
                        </template>
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

                <!-- Meal cards -->
                <div v-else class="d-flex flex-column gap-3">
                  <template v-for="entry in activeEntries" :key="entry.id">
                    <!-- Dinner highlight (dinner with a photo) -->
                    <div v-if="entry.slotKey === 'dinner' && entry.recipe.image"
                      class="fft-card fft-card-bordered p-0 overflow-hidden fft-hover-lift">
                      <div class="d-flex flex-column flex-lg-row">
                        <div class="fft-dinner-img position-relative flex-shrink-0">
                          <img :src="entry.recipe.image" :alt="entry.recipe.title" class="w-100 h-100 fft-cover" />
                          <div class="fft-overlay-badge d-flex align-items-center gap-1">
                            <span class="material-symbols-outlined" style="font-size: 14px">star</span>Dinner Highlight
                          </div>
                          <div class="fft-overlay-time">{{ entry.time }} {{ entry.status }}</div>
                        </div>

                        <div class="p-3 d-flex flex-column justify-content-between gap-3 flex-grow-1 fft-min-0">
                          <div class="d-flex flex-column gap-2">
                            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                              <div class="d-flex align-items-center flex-wrap gap-2">
                                <span v-for="tag in entry.recipe.tags.slice(0, 2)" :key="tag"
                                  class="fft-pill fft-pill-green fw-semibold">{{ tag }}</span>
                                <span v-if="pantryPercent(entry) !== null" class="fft-pill fft-pill-gray fw-semibold">
                                  Pantry Ready ({{ pantryPercent(entry) }}%)
                                </span>
                                <span v-if="entry.status === 'Cooked'"
                                  class="d-flex align-items-center gap-1 fft-label-sm text-fft-primary fw-semibold">
                                  <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>Logged
                                  Cooked
                                </span>
                                <span v-else-if="entry.status === 'Skipped'"
                                  class="fft-pill fft-pill-peach fw-semibold">Skipped</span>
                              </div>
                              <span class="fft-label-sm text-fft-primary fw-semibold d-flex align-items-center gap-1">
                                <span class="material-symbols-outlined" style="font-size: 16px">schedule</span>
                                {{ entry.recipe.prepMinutes }}m · {{ entry.servings }} Servings
                              </span>
                            </div>

                            <h3 class="fft-headline-md m-0">{{ entry.recipe.title }}</h3>
                            <p class="fft-body-sm text-fft-muted m-0">{{ entry.recipe.description }}</p>

                            <div class="d-flex align-items-center flex-wrap gap-3 fft-label-sm text-fft-muted">
                              <span class="fw-semibold text-fft-dark" style="font-size: 15px">
                                {{ entry.recipe.nutrition.calories ?? '–' }} kcal</span>
                              <span>•</span>
                              <span class="fw-medium text-fft-dark">{{ entry.recipe.nutrition.protein ?? '–' }}g Protein</span>
                              <span>•</span>
                              <span class="fw-medium text-fft-dark">{{ entry.recipe.nutrition.carbs ?? '–' }}g Carbs</span>
                              <span>•</span>
                              <span class="fw-medium text-fft-dark">{{ entry.recipe.nutrition.fat ?? '–' }}g Fat</span>
                            </div>
                          </div>

                          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <div class="d-flex align-items-center gap-2">
                              <button v-if="entry.status === 'Planned'"
                                class="btn fft-btn-primary fft-btn-lg d-flex align-items-center gap-2" type="button"
                                :disabled="saving" @click="onStatusChange({ entryId: entry.id, status: 'Cooked' })">
                                <span class="material-symbols-outlined" style="font-size: 18px">done</span>
                                <span>Mark Cooked</span>
                              </button>
                              <button class="btn fft-btn-soft fft-btn-lg d-flex align-items-center gap-1" type="button"
                                @click="selectedEntry = entry">
                                <span class="material-symbols-outlined" style="font-size: 18px">menu_book</span>
                                <span>View Recipe Details</span>
                              </button>
                            </div>
                            <div class="d-flex align-items-center gap-1">
                              <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button"
                                :disabled="saving" @click="swapEntry = entry">
                                <span class="material-symbols-outlined" style="font-size: 16px">swap_horiz</span>
                                <span>Swap</span>
                              </button>
                              <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button"
                                :disabled="saving" @click="removeEntry(entry)">
                                <span class="material-symbols-outlined" style="font-size: 16px">delete</span>
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Standard meal card -->
                    <div v-else class="fft-card fft-card-bordered fft-hover-lift">
                      <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                        <div class="d-flex flex-column gap-2 flex-grow-1 fft-min-0">
                          <div class="d-flex align-items-center flex-wrap gap-2">
                            <span class="fft-pill fft-upper fw-semibold" :class="SLOT_PILL[entry.slotKey]">
                              {{ entry.mealSlot }} • {{ entry.time }}
                            </span>
                            <span v-if="entry.status === 'Cooked'"
                              class="d-flex align-items-center gap-1 fft-label-sm text-fft-primary fw-semibold">
                              <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>Logged
                              Cooked
                            </span>
                            <span v-else-if="entry.status === 'Skipped'"
                              class="fft-pill fft-pill-peach fw-semibold">Skipped</span>
                            <span v-for="tag in entry.recipe.tags.slice(0, 3)" :key="tag"
                              class="fft-pill fft-pill-gray fw-semibold">{{ tag }}</span>
                          </div>

                          <h3 class="fft-headline-sm m-0">{{ entry.recipe.title }}</h3>
                          <p class="fft-body-sm text-fft-muted m-0">{{ entry.recipe.description }}</p>

                          <div class="d-flex align-items-center flex-wrap gap-3 fft-label-sm text-fft-muted pt-1">
                            <span class="fw-semibold text-fft-dark">{{ entry.recipe.nutrition.calories ?? '–' }} kcal</span>
                            <span>•</span>
                            <span>{{ entry.recipe.nutrition.protein ?? '–' }}g Protein</span>
                            <span>•</span>
                            <span>{{ entry.recipe.nutrition.carbs ?? '–' }}g Carbs</span>
                            <span>•</span>
                            <span>{{ entry.servings }} {{ entry.servings === 1 ? 'serving' : 'servings' }}</span>
                            <template v-if="entry.recipe.prepMinutes">
                              <span>•</span>
                              <span>{{ entry.recipe.prepMinutes }}m prep time</span>
                            </template>
                          </div>

                          <div v-if="entry.recipe.ingredients.length" class="d-flex align-items-center flex-wrap gap-2 pt-1">
                            <span class="fft-label-sm text-fft-outline">Pantry Check:</span>
                            <span v-for="ing in entry.recipe.ingredients.filter((i) => i.inPantry).slice(0, 4)"
                              :key="ing.name" class="fft-label-sm text-fft-primary d-flex align-items-center">
                              <span class="material-symbols-outlined" style="font-size: 14px">check</span> {{ ing.name }}
                            </span>
                            <span v-if="entry.recipe.ingredients.some((i) => !i.inPantry)"
                              class="fft-label-sm text-fft-secondary">
                              {{ entry.recipe.ingredients.filter((i) => !i.inPantry).length }} missing
                            </span>
                          </div>
                        </div>

                        <div class="d-flex flex-md-column align-items-stretch justify-content-end flex-wrap gap-2 flex-shrink-0">
                          <button v-if="entry.status === 'Planned'"
                            class="btn fft-btn-primary d-flex align-items-center gap-1" type="button" :disabled="saving"
                            @click="onStatusChange({ entryId: entry.id, status: 'Cooked' })">
                            <span class="material-symbols-outlined" style="font-size: 16px">done</span>Mark Cooked
                          </button>
                          <button class="btn fft-btn-soft d-flex align-items-center gap-1" type="button"
                            @click="selectedEntry = entry">
                            <span class="material-symbols-outlined" style="font-size: 16px">menu_book</span>Recipe Steps
                          </button>
                          <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button"
                            :disabled="saving" @click="swapEntry = entry">
                            <span class="material-symbols-outlined" style="font-size: 16px">swap_horiz</span>Swap Meal
                          </button>
                          <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button"
                            :disabled="saving" @click="removeEntry(entry)">
                            <span class="material-symbols-outlined" style="font-size: 16px">delete</span>Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- Modals (teleported to <body>, so their position here doesn't matter) -->
                <addMealModal v-if="addTarget" :default-date="addTarget.date" :default-slot="addTarget.mealSlot"
                  :recipes="recipeOptions" @close="addTarget = null" @add="addMealToPlan" />
                <viewRecipeModal v-if="selectedEntry" :entry="selectedEntry" @close="selectedEntry = null"
                  @update-status="onStatusChange" />
                <swapRecipeModal v-if="swapEntry" :entry="swapEntry" :recipes="recipeOptions"
                  @close="swapEntry = null" @swap="swapMeal" />
              </div>
            </div>

            <!-- Right: sidebar -->
            <aside class="col-12 col-xl-auto fft-sidebar">
              <div class="d-flex flex-column gap-3">
                <!-- Macro rings -->
                <div class="fft-card fft-card-lg d-flex flex-column gap-3">
                  <div class="d-flex align-items-center justify-content-between">
                    <div>
                      <span class="fft-label-sm fft-upper text-fft-outline fw-semibold">Weekly Balance</span>
                      <p class="fft-headline-sm m-0">Macro Split</p>
                    </div>
                    <span class="fft-pill fft-pill-green fw-medium">% of calories</span>
                  </div>

                  <div class="d-flex align-items-center justify-content-between gap-2 py-1">
                    <div v-for="ring in macros" :key="ring.name" class="d-flex flex-column align-items-center gap-1">
                      <div class="position-relative d-flex align-items-center justify-content-center fft-ring">
                        <svg class="fft-ring-svg" viewBox="0 0 36 36">
                          <path class="fft-ring-track"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none" stroke-width="3.5" />
                          <path :class="ring.colorClass"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none" :stroke-dasharray="`${ring.percent}, 100`" stroke-linecap="round"
                            stroke-width="3.5" />
                        </svg>
                        <span class="position-absolute fft-label-md fw-semibold">{{ ring.percent }}%</span>
                      </div>
                      <span class="fft-label-sm fw-semibold">{{ ring.grams }}</span>
                      <span class="fft-label-sm text-fft-outline">{{ ring.name }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

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

.foodforthought .fft-brand {
  font: 500 24px/32px 'Outfit', sans-serif;
  color: var(--fft-primary);
  letter-spacing: -0.01em;
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

.foodforthought .fft-fixed-light {
  color: var(--fft-primary-fixed);
}

.foodforthought .fft-min-0 {
  min-width: 0;
}

.foodforthought .fft-cover {
  object-fit: cover;
}

/* ===== Header ===== */
.foodforthought .fft-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1030;
  background: rgba(250, 250, 243, 0.9);
  backdrop-filter: blur(20px);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
}

.foodforthought .fft-header-inner {
  height: 80px;
}

.foodforthought .fft-logo {
  height: 32px;
  width: auto;
  object-fit: contain;
}

.foodforthought .fft-nav {
  padding: 4px;
  background: var(--fft-surface-low);
  border-radius: var(--fft-radius);
}

.foodforthought .fft-nav-link {
  padding: 8px 16px;
  border-radius: var(--fft-radius);
  font: 600 14px/20px 'Inter', sans-serif;
  letter-spacing: 0.01em;
  color: var(--fft-on-surface-variant);
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}

.foodforthought .fft-nav-link:hover {
  background: var(--fft-surface-high);
  color: var(--fft-on-surface);
}

.foodforthought .fft-nav-link.active {
  background: var(--fft-primary-container);
  color: var(--fft-on-primary-container);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.foodforthought .fft-search {
  width: 100%;
  max-width: 320px;
}

.foodforthought .fft-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--fft-outline);
  pointer-events: none;
}

.foodforthought .fft-search-input {
  padding: 8px 16px 8px 40px;
  background: var(--fft-surface-lowest);
  border: 0;
  border-radius: var(--fft-radius);
  font: 400 13px/20px 'Inter', sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}

.foodforthought .fft-search-input:focus {
  box-shadow: 0 0 0 2px var(--fft-primary);
  background: var(--fft-surface-lowest);
}

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

.foodforthought .fft-notif-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fft-secondary);
}

.foodforthought .fft-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 2px var(--fft-primary-fixed);
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

.foodforthought .fft-btn-lg {
  border-radius: var(--fft-radius-xl);
  padding: 10px 20px;
}

/* ===== Main layout ===== */
.foodforthought .fft-main {
  padding-top: 0;
  background: var(--fft-background);
  min-height: 100vh;
}

.foodforthought .fft-container {
  max-width: 1280px;
}

.foodforthought .fft-container-wide {
  max-width: 1720px;
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

.foodforthought .fft-segmented {
  background: var(--fft-surface-highest);
  padding: 4px;
  border-radius: var(--fft-radius);
}

.foodforthought .fft-segment {
  border: 0;
  background: transparent;
  padding: 4px 8px;
  border-radius: 4px;
  font: 600 11px/14px 'Inter', sans-serif;
  color: var(--fft-on-surface-variant);
  transition: color 0.15s;
}

.foodforthought .fft-segment:hover {
  color: var(--fft-on-surface);
}

.foodforthought .fft-segment.active {
  background: var(--fft-surface);
  color: var(--fft-on-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
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

.foodforthought .fft-bg-gray {
  background: var(--fft-surface-high);
}

.foodforthought .fft-bg-peach {
  background: var(--fft-secondary-fixed);
}

.foodforthought .fft-bg-green-mid {
  background: var(--fft-primary-fixed-dim);
  color: var(--fft-on-primary-fixed);
}

.foodforthought .fft-card {
  background: var(--fft-surface-lowest);
  padding: 16px;
  border-radius: var(--fft-radius-2xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.foodforthought .fft-card-lg {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.foodforthought .fft-card-bordered {
  border: 1px solid rgba(194, 200, 192, 0.4);
}

.foodforthought .fft-hover-lift {
  transition: box-shadow 0.2s;
}

.foodforthought .fft-hover-lift:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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

/* ===== Dinner highlight ===== */
.foodforthought .fft-dinner-img {
  width: 100%;
  height: 224px;
  overflow: hidden;
}

@media (min-width: 992px) {
  .foodforthought .fft-dinner-img {
    width: 320px;
    height: auto;
    min-height: 100%;
  }
}

.foodforthought .fft-overlay-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 12px;
  border-radius: 9999px;
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  font: 600 11px/14px 'Inter', sans-serif;
}

.foodforthought .fft-overlay-time {
  position: absolute;
  bottom: 12px;
  left: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(250, 250, 243, 0.9);
  font: 500 11px/14px 'Inter', sans-serif;
}

/* ===== Sidebar ===== */
@media (min-width: 1200px) {
  .foodforthought .fft-sidebar {
    width: 320px;
    flex-shrink: 0;
  }
}

.foodforthought .fft-ring {
  width: 64px;
  height: 64px;
}

.foodforthought .fft-ring-svg {
  width: 64px;
  height: 64px;
  transform: rotate(-90deg);
}

.foodforthought .fft-ring-track {
  stroke: var(--fft-surface-high);
}

.foodforthought .fft-ring-primary {
  stroke: var(--fft-primary);
}

.foodforthought .fft-ring-secondary {
  stroke: var(--fft-secondary);
}

.foodforthought .fft-ring-tertiary {
  stroke: var(--fft-tertiary);
}

.foodforthought .fft-cta {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  padding: 16px;
  border-radius: var(--fft-radius-2xl);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.foodforthought .fft-cta-sub {
  color: var(--fft-on-primary-container);
}

.foodforthought .fft-cta-btn {
  background: var(--fft-surface);
  color: var(--fft-primary);
  border-radius: var(--fft-radius-xl);
  padding: 10px 16px;
}

.foodforthought .fft-cta-btn:hover:not(:disabled) {
  background: var(--fft-surface-lowest);
  color: var(--fft-primary);
}

.foodforthought .fft-cta-btn:disabled {
  background: var(--fft-surface);
  color: var(--fft-primary);
  opacity: 0.95;
}

.foodforthought .fft-spin {
  animation: fft-spin 1s linear infinite;
}

@keyframes fft-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Footer ===== */
.foodforthought .fft-footer {
  background: var(--fft-surface-low);
  margin-top: 40px;
  box-shadow: 0 -1px 8px rgba(0, 0, 0, 0.02);
}

.foodforthought .fft-footer-link {
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  color: var(--fft-on-surface-variant);
  text-decoration: none;
  transition: color 0.15s;
}

.foodforthought .fft-footer-link:hover {
  color: var(--fft-on-surface);
}
</style>