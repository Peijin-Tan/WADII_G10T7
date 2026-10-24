<script setup>
import { ref, computed, watch } from 'vue'
import axios from "axios";

/* Bootstrap must be loaded once in your app entry (main.js):
   import 'bootstrap/dist/css/bootstrap.min.css'
   Material Symbols + fonts are loaded in the <style> block below. */

const images = {
  logo: 'https://lh3.googleusercontent.com/aida/AEtjO1W5jsZiponCyp6oX_bVJjGqnshEAT6K24qw_Xm2B8uUySK4upexVslwp_BhbxHY2Q02WX10yQS7C2xMfGUa-ze30FQU2ydnpfFRDIdTmK0oqcxO4-n2EfDwg1L0yrq60C-GoisPo6gTOpZcJ000sBN7OmKP6U9E6Z_j4buN8Pek13Cr6D3JL-AfGcXG66z5hNs75blSyxHIw4jugwMLiedQEqVglS6un3dQmdeoAZ0x',
  avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB3oG6XLP0L5HhXmr7nV_d_hl50ix4lGiZQ0kuDbP0XtRO1ipuH91kh8Yp7P_pTMQ7fcx3IaXa3zJgpBgg9G8tnEkxK9a4-fNTQ2PCs6G1-DmO1SyppBRpyQVNTPnihBYmU1wy97GDkuqG1mPpF4yuT5Fk3RjOeTAQ0_zSZ6jQP-g7-TSs1Er6zPZC9wADCJEnckhg_EdCUtQB46jPa0yb-JvKtvqoVsY-xFXz5i30',
  dinner: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrBiTZwMj93RE5tKown8jikEfqDVBC-G24ZpeJGfw5PGVPq41_ZHqO1M9Id9fP4D0mNnZaSvv6B3Fi7mIoCV_bBhAeO6JAyR9bhktig1xa8cG3k7-TLWYJPjSNlncajfar5e6ZzBY52npTG8rV6043bpuyHab5x3Ir9X3V3KWEoiHaazRIDlUDQP7U1XCr9K9f1Yohht5l2iXJD9OnRyIuJaWccRf72WxWCqxMNNk',
}

/* ---------- API ---------- */
// All planner requests go to the Express router mounted at /planner.
const api = axios.create({ baseURL: 'http://localhost:8000/planner' })

// The login page saves the JWT in the auth store (persisted in localStorage as 'foodforthought_auth').
// We only send the token: the server works out the userId from it (requireAuth -> req.user),
// so the page never needs to know or send the userId itself.
const auth = useAuthStore()
const router = useRouter()

// send the login token with every planner request
api.interceptors.request.use((config) => {
  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`
  return config
})

// no token / expired token (they last 1h) -> log out and go to the login page
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      auth.logout()
      router.push('/login')
    }
    return Promise.reject(err)
  }
)

/* ---------- Control bar ---------- */
const metrics = computed(() => [
  { label: 'Planned Meals', value: hasPlan.value ? '21' : '0', unit: '/ 21', icon: 'restaurant_menu', bg: 'fft-bg-green-light text-fft-primary' },
  { label: 'Daily Calorie Avg', value: hasPlan.value ? '2,050' : '—', unit: hasPlan.value ? 'kcal' : '', icon: 'local_fire_department', bg: 'fft-bg-peach text-fft-secondary' },
])

/* ---------- Week navigation ---------- */
const weekOffset = ref(0) // 0 = this week, 1 = next week, -1 = last week

const today = new Date()
today.setHours(0, 0, 0, 0)

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
const fmt = (d, opts) => d.toLocaleDateString('en-US', opts)
const sameDay = (a, b) => a.getTime() === b.getTime()

const todayIndex = (today.getDay() + 6) % 7 // Monday = 0
const thisMonday = addDays(today, -todayIndex)

const weekStart = computed(() => addDays(thisMonday, weekOffset.value * 7))
const weekEnd = computed(() => addDays(weekStart.value, 6))

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

/* Demo data only exists for the current week; other weeks start empty.
   Replace hasPlan with a lookup into your real meal-plan data. */
const hasPlan = computed(() => weekOffset.value === 0)

/* ---------- Days ---------- */
// sum daily recpies calories (from recipe collection)
const sampleKcal = ['2,080', '1,970', '2,110', '2,040', '2,190', '2,140', '1,820']

const days = computed(() =>
  sampleKcal.map((kcal, i) => {
    const date = addDays(weekStart.value, i)
    return {
      date,
      name: `${fmt(date, { weekday: 'short' })} ${date.getDate()}`,
      today: sameDay(date, today),
      meals: hasPlan.value ? '3/3' : '0/3',
      kcal: hasPlan.value ? kcal : '0',
    }
  })
)

const activeIndex = ref(todayIndex)
watch(weekOffset, (n) => {
  activeIndex.value = n === 0 ? todayIndex : 0
})

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

const ctaText = computed(() =>
  hasPlan.value
    ? "34 ingredients automatically calculated from this week's 21 planned recipes."
    : 'Plan some meals for this week to build your grocery list.'
)

/* ---------- Meals ---------- */
/* mealplan database --> recipeID (from recipe collection), get recipe info ()
*/

const meals = [
  {
    slot: 'Breakfast • 08:00 AM',
    slotClass: 'fft-pill-gray',
    logged: true,
    tags: [{ text: 'Fiber-Rich', class: 'fft-pill-gray' }],
    title: 'Cinnamon Apple Steel-Cut Oatmeal',
    desc: 'Topped with warm caramelized gala apples, toasted pecans, and a delicate maple drizzle.',
    kcal: 360,
    protein: 12,
    carbs: 54,
    prep: '15m prep time',
    pantry: ['Steel-cut oats', 'Gala apple', 'Ground cinnamon', 'Almond milk'],
    canPrep: false,
  },
  {
    slot: 'Lunch • 12:30 PM',
    slotClass: 'fft-pill-green',
    tags: [
      { text: 'Vegan', class: 'fft-pill-gray' },
      { text: '10m Fast Prep', class: 'fft-pill-peach' },
    ],
    title: 'Green Goddess Chickpea & Avocado Salad Bowl',
    desc: 'Tossed baby kale, diced ripe avocado, roasted spiced chickpeas, and creamy green goddess dressing.',
    kcal: 480,
    protein: 18,
    carbs: 52,
    prep: '10m active prep',
    pantry: ['Organic chickpeas', 'Baby kale', 'Avocado', 'Lemon tahini'],
    canPrep: true,
  },
]

const cookingSteps = [
  'Sauté onions, ginger & spices in olive oil',
  'Add sweet potatoes, lentils & rich broth',
  'Simmer 20m, finish with lime & cilantro',
]

/* ---------- Sidebar ---------- */
const macros = [
  { name: 'Protein', grams: '130g', percent: 88, colorClass: 'fft-ring-primary' },
  { name: 'Carbs', grams: '210g', percent: 96, colorClass: 'fft-ring-secondary' },
  { name: 'Fats', grams: '65g', percent: 82, colorClass: 'fft-ring-tertiary' },
]

const pantryRecipes = [
  {
    title: 'Quick Coconut Chickpea Curry',
    meta: '20m · 100% pantry match',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD2_KLBLwOIHa5Ig9zQX_u3Ny_4Yir0fuOETLsNlpfTmgo4Fpez_nIcgqz1Lh-ObSkAXibATHb16H7N1t7wsyNyZijh6CyLEG4e7muCoIC3rpvOihB6nFW4uJI9gx34AD7UiW9tjOP6rxLQsr421wUi0wLs_-71ysHuW9qW6hr1ZQHRRLASeNTYGY3a4o-78KlVe2GLnnAJ1NT5vlfSkFPDSrVGVsjlRU3uQ0r2Yms',
  },
  {
    title: 'Honey Mustard Chicken Bake',
    meta: '25m · 4 ingredients needed',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAEG0ALIiU0nFVCYKL32ZMfXUGdVMhkbf0fPbgD5Muk72k9fwKZraafPp5dJNRi81KNJnkv_F1xRAxIZaVRst9gAwlZQvdnCvjtE5oLF6R36m5JdP69QzX35SzoxEY7p7eTtq5qUsI-ep5wC-V7hARM-hB3WlowmL0rJk3Hi49aQ6DMkQkHF4BC24kLJ4mA6Qp7R36bM-m2M2zHtFRyYgRYoGUhnguaXr_yRR8hAVI',
  },
  {
    title: 'Tuscan Kale Caesar Crunch',
    meta: '12m · Fast & Raw',
    img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC67wkKXveo-2b9W1UJjMTc0oUHnVvDquADL1dzG1plqp8T0mUxVYv1bBXvKSaAhpsNEitz5cZrpx2evoc_PJ6L5lYP-cemJT2SzFz-LZscYhFynaMmeBoRWcxWdZi-8_ie_c3LDtrQvNETGGZiqyj632Ha5sdkDytL81gc-SRf6XTFDDznD1V8aqWHNlcR9jc8vePBgk4Nxl6fYs1K4PHQ4NUxbZQZzkKUrTd0UMg',
  },
]

/* ---------- Grocery sync button ---------- */
const syncState = ref('idle') // idle | syncing | done

// TRY auto sync??
const syncLabel = computed(() => {
  if (syncState.value === 'syncing') return 'Syncing 34 Items...'
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
                        <span v-else class="fft-day-count">{{ d.meals }}</span>
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
                      <div v-if="!hasPlan" class="fft-label-sm text-fft-muted">No meals planned yet</div>
                      <div v-if="hasPlan" class="d-flex align-items-center flex-wrap gap-3 fft-label-sm text-fft-muted">
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-secondary"
                            style="font-size: 16px">local_fire_department</span>
                          <strong>2,110</strong> kcal target
                        </span>
                        <span class="text-fft-outline">•</span>
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-primary"
                            style="font-size: 16px">restaurant</span>
                          3 meals planned
                        </span>
                        <span class="text-fft-outline">•</span>
                        <span class="d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined text-fft-outline" style="font-size: 16px">timer</span>
                          45m active cook time
                        </span>
                        <span class="text-fft-outline">•</span>
                        <span class="d-flex align-items-center gap-1 text-fft-primary fw-medium">
                          <span class="material-symbols-outlined" style="font-size: 16px">inventory_2</span>
                          100% pantry stock ready
                        </span>
                      </div>
                    </div>
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

                <!-- Meal cards -->
                <div v-if="!hasPlan"
                  class="fft-card fft-card-bordered text-center py-5 d-flex flex-column align-items-center gap-2">
                  <span class="material-symbols-outlined text-fft-outline" style="font-size: 40px">edit_calendar</span>
                  <h3 class="fft-headline-sm m-0">Nothing planned for {{ activeDayLong }} yet</h3>
                  <p class="fft-body-sm text-fft-muted m-0">Drag a recipe from the Pantry Drawer or add a meal to get
                    started.</p>
                  <button class="btn fft-btn-primary d-flex align-items-center gap-1 mt-2" type="button">
                    <span class="material-symbols-outlined" style="font-size: 18px">add</span>
                    <span>Add Meal</span>
                  </button>
                </div>

                <div v-if="hasPlan" class="d-flex flex-column gap-3">
                  <!-- Breakfast / Lunch -->
                  <div v-for="meal in meals" :key="meal.title" class="fft-card fft-card-bordered fft-hover-lift">
                    <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                      <div class="d-flex flex-column gap-2 flex-grow-1 fft-min-0">
                        <div class="d-flex align-items-center flex-wrap gap-2">
                          <span class="fft-pill fft-upper fw-semibold" :class="meal.slotClass">{{ meal.slot }}</span>
                          <span v-if="meal.logged"
                            class="d-flex align-items-center gap-1 fft-label-sm text-fft-primary fw-semibold">
                            <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>Logged
                            Cooked
                          </span>
                          <span v-for="tag in meal.tags" :key="tag.text" class="fft-pill fw-semibold"
                            :class="tag.class">{{ tag.text
                            }}</span>
                        </div>

                        <h3 class="fft-headline-sm m-0">{{ meal.title }}</h3>
                        <p class="fft-body-sm text-fft-muted m-0">{{ meal.desc }}</p>

                        <div class="d-flex align-items-center flex-wrap gap-3 fft-label-sm text-fft-muted pt-1">
                          <span class="fw-semibold text-fft-dark">{{ meal.kcal }} kcal</span>
                          <span>•</span>
                          <span>{{ meal.protein }}g Protein</span>
                          <span>•</span>
                          <span>{{ meal.carbs }}g Carbs</span>
                          <span>•</span>
                          <span>{{ meal.prep }}</span>
                        </div>

                        <div class="d-flex align-items-center flex-wrap gap-2 pt-1">
                          <span class="fft-label-sm text-fft-outline">Pantry Check:</span>
                          <span v-for="item in meal.pantry" :key="item"
                            class="fft-label-sm text-fft-primary d-flex align-items-center">
                            <span class="material-symbols-outlined" style="font-size: 14px">check</span> {{ item }}
                          </span>
                        </div>
                      </div>

                      <div class="d-flex flex-md-column align-items-stretch justify-content-end gap-2 flex-shrink-0">
                        <button v-if="meal.canPrep" class="btn fft-btn-primary d-flex align-items-center gap-1"
                          type="button">
                          <span class="material-symbols-outlined" style="font-size: 16px">done</span>Mark Prepped
                        </button>
                        <button class="btn fft-btn-soft d-flex align-items-center gap-1" type="button">
                          <span class="material-symbols-outlined" style="font-size: 16px">menu_book</span>Recipe Steps
                        </button>
                        <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button">
                          <span class="material-symbols-outlined" style="font-size: 16px">swap_horiz</span>{{
                            meal.canPrep ? 'Swap' :
                              'Swap Meal' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Dinner highlight -->
                  <div class="fft-card fft-card-bordered p-0 overflow-hidden fft-hover-lift">
                    <div class="d-flex flex-column flex-lg-row">
                      <div class="fft-dinner-img position-relative flex-shrink-0">
                        <img :src="images.dinner" alt="Moroccan Chickpea Stew" class="w-100 h-100 fft-cover" />
                        <div class="fft-overlay-badge d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined" style="font-size: 14px">star</span>Dinner Highlight
                        </div>
                        <div class="fft-overlay-time">07:00 PM Planned</div>
                      </div>

                      <div class="p-3 d-flex flex-column justify-content-between gap-3 flex-grow-1 fft-min-0">
                        <div class="d-flex flex-column gap-2">
                          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <div class="d-flex align-items-center flex-wrap gap-2">
                              <span class="fft-pill fft-pill-green fw-semibold">Plant-Based / Comfort</span>
                              <span class="fft-pill fft-pill-amber fw-semibold">High-Fiber</span>
                              <span class="fft-pill fft-pill-gray fw-semibold">Pantry Ready (100%)</span>
                            </div>
                            <span class="fft-label-sm text-fft-primary fw-semibold d-flex align-items-center gap-1">
                              <span class="material-symbols-outlined" style="font-size: 16px">schedule</span>30m · 4
                              Servings
                            </span>
                          </div>

                          <h3 class="fft-headline-md m-0">Moroccan Spiced Lentil &amp; Sweet Potato Stew</h3>
                          <p class="fft-body-sm text-fft-muted m-0">
                            Simmered with warming cinnamon, ground cumin, tender sweet potatoes, chickpeas, and fresh
                            cilantro leaves.
                          </p>

                          <div class="d-flex align-items-center flex-wrap gap-3 fft-label-sm text-fft-muted">
                            <span class="fw-semibold text-fft-dark" style="font-size: 15px">620 kcal</span>
                            <span>•</span>
                            <span class="fw-medium text-fft-dark">32g Protein</span>
                            <span>•</span>
                            <span class="fw-medium text-fft-dark">68g Carbs</span>
                            <span>•</span>
                            <span class="fw-medium text-fft-dark">18g Fat</span>
                          </div>
                        </div>

                        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                          <div class="d-flex align-items-center gap-2">
                            <button class="btn fft-btn-primary fft-btn-lg d-flex align-items-center gap-2"
                              type="button">
                              <span class="material-symbols-outlined" style="font-size: 18px">play_circle</span>
                              <span>Start Cooking Mode</span>
                            </button>
                            <button class="btn fft-btn-soft fft-btn-lg d-flex align-items-center gap-1" type="button">
                              <span class="material-symbols-outlined" style="font-size: 18px">menu_book</span>
                              <span>View Recipe Details</span>
                            </button>
                          </div>
                          <div class="d-flex align-items-center gap-1">
                            <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button">
                              <span class="material-symbols-outlined" style="font-size: 16px">shopping_cart</span>
                              <span>Add Extras to Grocery</span>
                            </button>
                            <button class="btn fft-btn-ghost d-flex align-items-center gap-1" type="button">
                              <span class="material-symbols-outlined" style="font-size: 16px">swap_horiz</span>
                              <span>Swap</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
                      <p class="fft-headline-sm m-0">Macro Targets</p>
                    </div>
                    <span class="fft-pill fft-pill-green fw-medium">94% on track</span>
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

                <!-- Pantry drawer -->
                <div class="fft-card fft-card-lg d-flex flex-column gap-3">
                  <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-1">
                      <span class="material-symbols-outlined text-fft-primary" style="font-size: 20px">shelves</span>
                      <p class="fft-headline-sm m-0">Pantry Drawer</p>
                    </div>
                    <span class="fft-label-sm text-fft-muted">Drag to day</span>
                  </div>

                  <p class="fft-body-sm text-fft-muted m-0">
                    Recipes matching ingredients currently stored in your kitchen.
                  </p>

                  <div class="d-flex flex-column gap-1">
                    <div v-for="r in pantryRecipes" :key="r.title"
                      class="fft-draggable d-flex align-items-center justify-content-between" draggable="true">
                      <div class="d-flex align-items-center gap-2 fft-min-0">
                        <div class="fft-thumb flex-shrink-0">
                          <img :src="r.img" :alt="r.title" class="w-100 h-100 fft-cover" />
                        </div>
                        <div class="d-flex flex-column fft-min-0">
                          <span class="fft-label-md text-truncate">{{ r.title }}</span>
                          <span class="fft-label-sm text-fft-outline">{{ r.meta }}</span>
                        </div>
                      </div>
                      <span class="material-symbols-outlined text-fft-outline fft-drag-handle"
                        style="font-size: 18px">drag_indicator</span>
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

.foodforthought .fft-draggable {
  padding: 8px;
  border-radius: var(--fft-radius-xl);
  background: var(--fft-surface-low);
  cursor: grab;
  transition: background-color 0.15s;
}

.foodforthought .fft-draggable:hover {
  background: var(--fft-surface-high);
}

.foodforthought .fft-draggable:active {
  cursor: grabbing;
}

.foodforthought .fft-drag-handle {
  opacity: 0;
  transition: opacity 0.15s;
}

.foodforthought .fft-draggable:hover .fft-drag-handle {
  opacity: 1;
}

.foodforthought .fft-thumb {
  width: 40px;
  height: 40px;
  border-radius: var(--fft-radius);
  overflow: hidden;
  background: var(--fft-surface-highest);
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