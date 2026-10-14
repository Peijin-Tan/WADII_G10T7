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

const url = "http://localhost:8000"

async function getWeeklyPlan() {
    try {
        const res = await axios.get(`${url}/`)
    } catch (error) {
        console.log(error)
    }
}

/* ---------- Control bar ---------- */
const metrics = computed(() => [
  { label: 'Planned Meals', value: hasPlan.value ? '21' : '0', unit: '/ 21', icon: 'restaurant_menu', bg: 'sw-bg-green-light text-sw-primary' },
  { label: 'Daily Calorie Avg', value: hasPlan.value ? '2,050' : '—', unit: hasPlan.value ? 'kcal' : '', icon: 'local_fire_department', bg: 'sw-bg-peach text-sw-secondary' },
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
  if (sameDay(d, today)) return { text: 'In Progress', class: 'sw-pill-green' }
  return d < today
    ? { text: 'Completed', class: 'sw-pill-gray' }
    : { text: 'Upcoming', class: 'sw-pill-amber' }
})

const ctaText = computed(() =>
  hasPlan.value
    ? "34 ingredients automatically calculated from this week's 21 planned recipes."
    : 'Plan some meals for this week to build your grocery list.'
)

/* ---------- Meals ---------- */
const meals = [
  {
    slot: 'Breakfast • 08:00 AM',
    slotClass: 'sw-pill-gray',
    logged: true,
    tags: [{ text: 'Fiber-Rich', class: 'sw-pill-gray' }],
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
    slotClass: 'sw-pill-green',
    tags: [
      { text: 'Vegan', class: 'sw-pill-gray' },
      { text: '10m Fast Prep', class: 'sw-pill-peach' },
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
  { name: 'Protein', grams: '130g', percent: 88, colorClass: 'sw-ring-primary' },
  { name: 'Carbs', grams: '210g', percent: 96, colorClass: 'sw-ring-secondary' },
  { name: 'Fats', grams: '65g', percent: 82, colorClass: 'sw-ring-tertiary' },
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
  <div class="savorweek">
    <main class="sw-main">
      <!-- ============ CONTROL BAR + STATS ============ -->
      <section class="sw-controls px-4 py-3">
        <div class="container-fluid sw-container d-flex flex-column gap-3">
          <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
            <div class="d-flex align-items-center flex-wrap gap-3">
              <div class="d-flex align-items-baseline gap-2">
                <span class="sw-headline-lg">Week of {{ weekRange }}</span>
                <span class="sw-tag">{{ weekLabel }}</span>
              </div>

              <!-- Week navigator -->
              <div class="sw-week-switcher d-flex align-items-center gap-1">
                <button class="sw-icon-btn sw-icon-btn-sm" title="Previous week" aria-label="Previous week" type="button" @click="weekOffset--">
                  <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <button
                  type="button"
                  class="sw-chip"
                  :disabled="weekOffset === 0"
                  title="Jump to the current week"
                  @click="weekOffset = 0"
                >
                  This week
                </button>
                <button class="sw-icon-btn sw-icon-btn-sm" title="Next week" aria-label="Next week" type="button" @click="weekOffset++">
                  <span class="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Metric tiles -->
          <div class="row g-3 pt-1">
            <div v-for="m in metrics" :key="m.label" class="col-6 col-md-3">
              <div class="sw-tile d-flex align-items-center justify-content-between h-100">
                <div class="d-flex flex-column">
                  <span class="sw-label-sm sw-upper text-sw-muted">{{ m.label }}</span>
                  <span class="sw-headline-md" :class="{ 'text-sw-primary': m.accent }">
                    {{ m.value }}
                    <span v-if="m.unit" class="sw-body-sm text-sw-outline">{{ m.unit }}</span>
                    <span v-if="m.note" class="sw-label-sm text-sw-primary ms-1">{{ m.note }}</span>
                  </span>
                </div>
                <div class="sw-round-icon" :class="m.bg">
                  <span class="material-symbols-outlined" style="font-size: 20px">{{ m.icon }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ PLANNER ============ -->
      <section class="px-4 py-4">
        <div class="container-fluid sw-container-wide">
          <div class="row g-4 align-items-start">
            <!-- Left: day picker + meals -->
            <div class="col-12 col-xl">
              <div class="d-flex flex-column gap-4">
                <!-- Day tabs -->
                <div class="sw-day-strip">
                  <div class="d-flex align-items-center gap-1 p-1 sw-day-strip-inner">
                    <button
                      v-for="(d, i) in days"
                      :key="d.name"
                      type="button"
                      class="sw-day"
                      :class="{ active: activeIndex === i }"
                      @click="activeIndex = i"
                    >
                      <div class="d-flex align-items-center gap-2">
                        <span class="sw-label-md fw-semibold">{{ d.name }}</span>
                        <span v-if="d.today" class="sw-today-pill">Today</span>
                        <span v-else class="sw-day-count">{{ d.meals }}</span>
                      </div>
                      <span class="sw-day-kcal">
                        {{ d.kcal }} kcal<template v-if="d.today"> · {{ d.meals }}</template>
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Day summary -->
                <div class="sw-card sw-card-bordered d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
                  <div class="d-flex flex-column gap-1">
                    <div class="d-flex align-items-center flex-wrap gap-2">
                      <h2 class="sw-headline-md m-0">{{ activeDayLong }}</h2>
                      <span class="sw-pill" :class="dayStatus.class">{{ dayStatus.text }}</span>
                    </div>
                    <div v-if="!hasPlan" class="sw-label-sm text-sw-muted">No meals planned yet</div>
                    <div v-if="hasPlan" class="d-flex align-items-center flex-wrap gap-3 sw-label-sm text-sw-muted">
                      <span class="d-flex align-items-center gap-1">
                        <span class="material-symbols-outlined text-sw-secondary" style="font-size: 16px">local_fire_department</span>
                        <strong>2,110</strong> kcal target
                      </span>
                      <span class="text-sw-outline">•</span>
                      <span class="d-flex align-items-center gap-1">
                        <span class="material-symbols-outlined text-sw-primary" style="font-size: 16px">restaurant</span>
                        3 meals planned
                      </span>
                      <span class="text-sw-outline">•</span>
                      <span class="d-flex align-items-center gap-1">
                        <span class="material-symbols-outlined text-sw-outline" style="font-size: 16px">timer</span>
                        45m active cook time
                      </span>
                      <span class="text-sw-outline">•</span>
                      <span class="d-flex align-items-center gap-1 text-sw-primary fw-medium">
                        <span class="material-symbols-outlined" style="font-size: 16px">inventory_2</span>
                        100% pantry stock ready
                      </span>
                    </div>
                  </div>

                  <div class="d-flex align-items-center gap-2">
                    <button class="btn sw-btn-soft d-flex align-items-center gap-1" type="button">
                      <span class="material-symbols-outlined" style="font-size: 18px">print</span>
                      <span>Print Day Card</span>
                    </button>
                    <button class="btn sw-btn-primary d-flex align-items-center gap-1" type="button">
                      <span class="material-symbols-outlined" style="font-size: 18px">add</span>
                      <span>Add Meal / Snack</span>
                    </button>
                  </div>
                </div>

                <!-- Meal cards -->
                <div v-if="!hasPlan" class="sw-card sw-card-bordered text-center py-5 d-flex flex-column align-items-center gap-2">
                  <span class="material-symbols-outlined text-sw-outline" style="font-size: 40px">edit_calendar</span>
                  <h3 class="sw-headline-sm m-0">Nothing planned for {{ activeDayLong }} yet</h3>
                  <p class="sw-body-sm text-sw-muted m-0">Drag a recipe from the Pantry Drawer or add a meal to get started.</p>
                  <button class="btn sw-btn-primary d-flex align-items-center gap-1 mt-2" type="button">
                    <span class="material-symbols-outlined" style="font-size: 18px">add</span>
                    <span>Add Meal</span>
                  </button>
                </div>

                <div v-if="hasPlan" class="d-flex flex-column gap-3">
                  <!-- Breakfast / Lunch -->
                  <div v-for="meal in meals" :key="meal.title" class="sw-card sw-card-bordered sw-hover-lift">
                    <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                      <div class="d-flex flex-column gap-2 flex-grow-1 sw-min-0">
                        <div class="d-flex align-items-center flex-wrap gap-2">
                          <span class="sw-pill sw-upper fw-semibold" :class="meal.slotClass">{{ meal.slot }}</span>
                          <span v-if="meal.logged" class="d-flex align-items-center gap-1 sw-label-sm text-sw-primary fw-semibold">
                            <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>Logged Cooked
                          </span>
                          <span
                            v-for="tag in meal.tags"
                            :key="tag.text"
                            class="sw-pill fw-semibold"
                            :class="tag.class"
                          >{{ tag.text }}</span>
                        </div>

                        <h3 class="sw-headline-sm m-0">{{ meal.title }}</h3>
                        <p class="sw-body-sm text-sw-muted m-0">{{ meal.desc }}</p>

                        <div class="d-flex align-items-center flex-wrap gap-3 sw-label-sm text-sw-muted pt-1">
                          <span class="fw-semibold text-sw-dark">{{ meal.kcal }} kcal</span>
                          <span>•</span>
                          <span>{{ meal.protein }}g Protein</span>
                          <span>•</span>
                          <span>{{ meal.carbs }}g Carbs</span>
                          <span>•</span>
                          <span>{{ meal.prep }}</span>
                        </div>

                        <div class="d-flex align-items-center flex-wrap gap-2 pt-1">
                          <span class="sw-label-sm text-sw-outline">Pantry Check:</span>
                          <span
                            v-for="item in meal.pantry"
                            :key="item"
                            class="sw-label-sm text-sw-primary d-flex align-items-center"
                          >
                            <span class="material-symbols-outlined" style="font-size: 14px">check</span> {{ item }}
                          </span>
                        </div>
                      </div>

                      <div class="d-flex flex-md-column align-items-stretch justify-content-end gap-2 flex-shrink-0">
                        <button v-if="meal.canPrep" class="btn sw-btn-primary d-flex align-items-center gap-1" type="button">
                          <span class="material-symbols-outlined" style="font-size: 16px">done</span>Mark Prepped
                        </button>
                        <button class="btn sw-btn-soft d-flex align-items-center gap-1" type="button">
                          <span class="material-symbols-outlined" style="font-size: 16px">menu_book</span>Recipe Steps
                        </button>
                        <button class="btn sw-btn-ghost d-flex align-items-center gap-1" type="button">
                          <span class="material-symbols-outlined" style="font-size: 16px">swap_horiz</span>{{ meal.canPrep ? 'Swap' : 'Swap Meal' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Dinner highlight -->
                  <div class="sw-card sw-card-bordered p-0 overflow-hidden sw-hover-lift">
                    <div class="d-flex flex-column flex-lg-row">
                      <div class="sw-dinner-img position-relative flex-shrink-0">
                        <img :src="images.dinner" alt="Moroccan Chickpea Stew" class="w-100 h-100 sw-cover" />
                        <div class="sw-overlay-badge d-flex align-items-center gap-1">
                          <span class="material-symbols-outlined" style="font-size: 14px">star</span>Dinner Highlight
                        </div>
                        <div class="sw-overlay-time">07:00 PM Planned</div>
                      </div>

                      <div class="p-3 d-flex flex-column justify-content-between gap-3 flex-grow-1 sw-min-0">
                        <div class="d-flex flex-column gap-2">
                          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                            <div class="d-flex align-items-center flex-wrap gap-2">
                              <span class="sw-pill sw-pill-green fw-semibold">Plant-Based / Comfort</span>
                              <span class="sw-pill sw-pill-amber fw-semibold">High-Fiber</span>
                              <span class="sw-pill sw-pill-gray fw-semibold">Pantry Ready (100%)</span>
                            </div>
                            <span class="sw-label-sm text-sw-primary fw-semibold d-flex align-items-center gap-1">
                              <span class="material-symbols-outlined" style="font-size: 16px">schedule</span>30m · 4 Servings
                            </span>
                          </div>

                          <h3 class="sw-headline-md m-0">Moroccan Spiced Lentil &amp; Sweet Potato Stew</h3>
                          <p class="sw-body-sm text-sw-muted m-0">
                            Simmered with warming cinnamon, ground cumin, tender sweet potatoes, chickpeas, and fresh cilantro leaves.
                          </p>

                          <div class="d-flex align-items-center flex-wrap gap-3 sw-label-sm text-sw-muted">
                            <span class="fw-semibold text-sw-dark" style="font-size: 15px">620 kcal</span>
                            <span>•</span>
                            <span class="fw-medium text-sw-dark">32g Protein</span>
                            <span>•</span>
                            <span class="fw-medium text-sw-dark">68g Carbs</span>
                            <span>•</span>
                            <span class="fw-medium text-sw-dark">18g Fat</span>
                          </div>

                          <div class="sw-steps">
                            <span class="sw-label-sm sw-upper text-sw-outline fw-semibold">3-Step Cooking Flow</span>
                            <div class="row g-2 sw-step-text text-sw-muted mt-0">
                              <div v-for="(step, i) in cookingSteps" :key="i" class="col-12 col-sm-4 d-flex align-items-start gap-2">
                                <span class="sw-step-num">{{ i + 1 }}</span>
                                <span>{{ step }}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                          <div class="d-flex align-items-center gap-2">
                            <button class="btn sw-btn-primary sw-btn-lg d-flex align-items-center gap-2" type="button">
                              <span class="material-symbols-outlined" style="font-size: 18px">play_circle</span>
                              <span>Start Cooking Mode</span>
                            </button>
                            <button class="btn sw-btn-soft sw-btn-lg d-flex align-items-center gap-1" type="button">
                              <span class="material-symbols-outlined" style="font-size: 18px">menu_book</span>
                              <span>View Recipe Details</span>
                            </button>
                          </div>
                          <div class="d-flex align-items-center gap-1">
                            <button class="btn sw-btn-ghost d-flex align-items-center gap-1" type="button">
                              <span class="material-symbols-outlined" style="font-size: 16px">shopping_cart</span>
                              <span>Add Extras to Grocery</span>
                            </button>
<button class="btn sw-btn-ghost d-flex align-items-center gap-1" type="button">
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
            <aside class="col-12 col-xl-auto sw-sidebar">
              <div class="d-flex flex-column gap-3">
                <!-- Macro rings -->
                <div class="sw-card sw-card-lg d-flex flex-column gap-3">
                  <div class="d-flex align-items-center justify-content-between">
                    <div>
                      <span class="sw-label-sm sw-upper text-sw-outline fw-semibold">Weekly Balance</span>
                      <p class="sw-headline-sm m-0">Macro Targets</p>
                    </div>
                    <span class="sw-pill sw-pill-green fw-medium">94% on track</span>
                  </div>

                  <div class="d-flex align-items-center justify-content-between gap-2 py-1">
                    <div v-for="ring in macros" :key="ring.name" class="d-flex flex-column align-items-center gap-1">
                      <div class="position-relative d-flex align-items-center justify-content-center sw-ring">
                        <svg class="sw-ring-svg" viewBox="0 0 36 36">
                          <path
                            class="sw-ring-track"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke-width="3.5"
                          />
                          <path
                            :class="ring.colorClass"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            :stroke-dasharray="`${ring.percent}, 100`"
                            stroke-linecap="round"
                            stroke-width="3.5"
                          />
                        </svg>
                        <span class="position-absolute sw-label-md fw-semibold">{{ ring.percent }}%</span>
                      </div>
                      <span class="sw-label-sm fw-semibold">{{ ring.grams }}</span>
                      <span class="sw-label-sm text-sw-outline">{{ ring.name }}</span>
                    </div>
                  </div>
                </div>

                <!-- Pantry drawer -->
                <div class="sw-card sw-card-lg d-flex flex-column gap-3">
                  <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center gap-1">
                      <span class="material-symbols-outlined text-sw-primary" style="font-size: 20px">shelves</span>
                      <p class="sw-headline-sm m-0">Pantry Drawer</p>
                    </div>
                    <span class="sw-label-sm text-sw-muted">Drag to day</span>
                  </div>

                  <p class="sw-body-sm text-sw-muted m-0">
                    Recipes matching ingredients currently stored in your kitchen.
                  </p>

                  <div class="d-flex flex-column gap-1">
                    <div
                      v-for="r in pantryRecipes"
                      :key="r.title"
                      class="sw-draggable d-flex align-items-center justify-content-between"
                      draggable="true"
                    >
                      <div class="d-flex align-items-center gap-2 sw-min-0">
                        <div class="sw-thumb flex-shrink-0">
                          <img :src="r.img" :alt="r.title" class="w-100 h-100 sw-cover" />
                        </div>
                        <div class="d-flex flex-column sw-min-0">
                          <span class="sw-label-md text-truncate">{{ r.title }}</span>
                          <span class="sw-label-sm text-sw-outline">{{ r.meta }}</span>
                        </div>
                      </div>
                      <span class="material-symbols-outlined text-sw-outline sw-drag-handle" style="font-size: 18px">drag_indicator</span>
                    </div>
                  </div>
                </div>

                <!-- Grocery CTA -->
                <div class="sw-cta d-flex flex-column gap-2">
                  <div class="d-flex align-items-center justify-content-between">
                    <span class="sw-label-sm sw-upper fw-semibold sw-fixed-light">Shopping Sync</span>
                    <span class="material-symbols-outlined sw-fixed-light" style="font-size: 20px">shopping_cart_checkout</span>
                  </div>
                  <div>
                    <p class="sw-headline-sm m-0">Ready to Shop?</p>
                    <p class="sw-body-sm sw-cta-sub mt-1 mb-0">
                      {{ ctaText }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn sw-cta-btn w-100 d-flex align-items-center justify-content-center gap-2 mt-1"
                    :disabled="syncState !== 'idle' || !hasPlan"
                    @click="sendToGrocery"
                  >
                    <span
                      class="material-symbols-outlined"
                      :class="{ 'sw-spin': syncState === 'syncing' }"
                      style="font-size: 18px"
                    >{{ syncIcon }}</span>
                    <span>{{ syncLabel }}</span>
                  </button>
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
.savorweek {
  --sw-background: #fafaf3;
  --sw-surface: #fafaf3;
  --sw-surface-lowest: #ffffff;
  --sw-surface-low: #f4f4ed;
  --sw-surface-container: #eeeee8;
  --sw-surface-high: #e8e9e2;
  --sw-surface-highest: #e3e3dc;
  --sw-on-surface: #1a1c18;
  --sw-on-surface-variant: #424842;
  --sw-outline: #727972;
  --sw-outline-variant: #c2c8c0;

  --sw-primary: #32533c;
  --sw-primary-container: #4a6b53;
  --sw-on-primary: #ffffff;
  --sw-on-primary-container: #c5eacc;
  --sw-primary-fixed: #c7ecce;
  --sw-primary-fixed-dim: #abcfb2;
  --sw-on-primary-fixed: #01210f;

  --sw-secondary: #a23e18;
  --sw-secondary-fixed: #ffdbcf;
  --sw-on-secondary-fixed: #390c00;

  --sw-tertiary: #6b4400;
  --sw-tertiary-fixed: #ffddb5;
  --sw-on-tertiary-fixed: #2a1800;

  --sw-radius: 0.5rem;
  --sw-radius-xl: 0.75rem;
  --sw-radius-2xl: 1rem;

  font-family: 'Inter', sans-serif;
  font-size: 15px;
  line-height: 24px;
  color: var(--sw-on-surface);
  background: var(--sw-background);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

.savorweek *::-webkit-scrollbar { display: none; }

.savorweek .material-symbols-outlined {
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
.savorweek .sw-headline-lg { font: 600 32px/40px 'Outfit', sans-serif; letter-spacing: -0.01em; }
.savorweek .sw-headline-md { font: 500 24px/32px 'Outfit', sans-serif; }
.savorweek .sw-headline-sm { font: 500 20px/28px 'Outfit', sans-serif; }
.savorweek h2.sw-headline-md,
.savorweek h3.sw-headline-md,
.savorweek h3.sw-headline-sm,
.savorweek .sw-headline-sm.fw-semibold { font-weight: 600; }
.savorweek .sw-brand { font: 500 24px/32px 'Outfit', sans-serif; color: var(--sw-primary); letter-spacing: -0.01em; }
.savorweek .sw-label-md { font: 600 12px/16px 'Inter', sans-serif; letter-spacing: 0.02em; }
.savorweek .sw-label-sm { font: 600 11px/14px 'Inter', sans-serif; letter-spacing: 0.03em; }
.savorweek .sw-body-sm { font: 400 13px/20px 'Inter', sans-serif; }
.savorweek .sw-upper { text-transform: uppercase; letter-spacing: 0.06em; }

.savorweek .text-sw-primary { color: var(--sw-primary) !important; }
.savorweek .text-sw-secondary { color: var(--sw-secondary) !important; }
.savorweek .text-sw-muted { color: var(--sw-on-surface-variant) !important; }
.savorweek .text-sw-outline { color: var(--sw-outline) !important; }
.savorweek .text-sw-dark { color: var(--sw-on-surface) !important; }
.savorweek .sw-fixed-light { color: var(--sw-primary-fixed); }
.savorweek .sw-min-0 { min-width: 0; }
.savorweek .sw-cover { object-fit: cover; }

/* ===== Header ===== */
.savorweek .sw-header {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 1030;
  background: rgba(250, 250, 243, 0.9);
  backdrop-filter: blur(20px);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
}
.savorweek .sw-header-inner { height: 80px; }
.savorweek .sw-logo { height: 32px; width: auto; object-fit: contain; }

.savorweek .sw-nav {
  padding: 4px;
  background: var(--sw-surface-low);
  border-radius: var(--sw-radius);
}
.savorweek .sw-nav-link {
  padding: 8px 16px;
  border-radius: var(--sw-radius);
  font: 600 14px/20px 'Inter', sans-serif;
  letter-spacing: 0.01em;
  color: var(--sw-on-surface-variant);
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}
.savorweek .sw-nav-link:hover { background: var(--sw-surface-high); color: var(--sw-on-surface); }
.savorweek .sw-nav-link.active {
  background: var(--sw-primary-container);
  color: var(--sw-on-primary-container);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.savorweek .sw-search { width: 100%; max-width: 320px; }
.savorweek .sw-search-icon {
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  font-size: 20px; color: var(--sw-outline); pointer-events: none;
}
.savorweek .sw-search-input {
  padding: 8px 16px 8px 40px;
  background: var(--sw-surface-lowest);
  border: 0;
  border-radius: var(--sw-radius);
  font: 400 13px/20px 'Inter', sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.savorweek .sw-search-input:focus {
  box-shadow: 0 0 0 2px var(--sw-primary);
  background: var(--sw-surface-lowest);
}

.savorweek .sw-week-switcher {
  background: var(--sw-surface-low);
  padding: 4px;
  border-radius: var(--sw-radius);
}

.savorweek .sw-icon-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: 0;
  border-radius: var(--sw-radius);
  background: var(--sw-surface-low);
  color: var(--sw-on-surface-variant);
  transition: background-color 0.15s, color 0.15s;
}
.savorweek .sw-icon-btn:hover { background: var(--sw-surface-high); color: var(--sw-on-surface); }
.savorweek .sw-icon-btn .material-symbols-outlined { font-size: 20px; }
.savorweek .sw-icon-btn-sm { width: 32px; height: 32px; background: transparent; }
.savorweek .sw-icon-btn-sm .material-symbols-outlined { font-size: 18px; }
.savorweek .sw-notif-dot {
  position: absolute; top: 8px; right: 8px;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--sw-secondary);
}
.savorweek .sw-avatar {
  width: 32px; height: 32px; border-radius: 50%; object-fit: cover;
  box-shadow: 0 0 0 2px var(--sw-primary-fixed);
}

/* ===== Buttons ===== */
.savorweek .btn { border: 0; border-radius: var(--sw-radius); font: 600 12px/16px 'Inter', sans-serif; letter-spacing: 0.02em; padding: 8px 16px; transition: background-color 0.15s, color 0.15s; }
.savorweek .sw-btn-primary { background: var(--sw-primary); color: var(--sw-on-primary); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.savorweek .sw-btn-primary:hover { background: var(--sw-primary-container); color: var(--sw-on-primary); }
.savorweek .sw-btn-soft { background: var(--sw-surface-low); color: var(--sw-on-surface); }
.savorweek .sw-btn-soft:hover { background: var(--sw-surface-high); color: var(--sw-on-surface); }
.savorweek .sw-btn-ghost { background: transparent; color: var(--sw-outline); padding: 8px 12px; }
.savorweek .sw-btn-ghost:hover { color: var(--sw-on-surface); background: transparent; }
.savorweek .sw-btn-lg { border-radius: var(--sw-radius-xl); padding: 10px 20px; }

/* ===== Main layout ===== */
.savorweek .sw-main { padding-top: 0; background: var(--sw-background); min-height: 100vh; }
.savorweek .sw-container { max-width: 1280px; }
.savorweek .sw-container-wide { max-width: 1720px; }

/* ===== Control bar ===== */
.savorweek .sw-controls { background: var(--sw-surface-low); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
.savorweek .sw-tag {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sw-primary);
  background: var(--sw-primary-fixed);
  padding: 2px 8px;
  border-radius: 4px;
}
.savorweek .sw-segmented { background: var(--sw-surface-highest); padding: 4px; border-radius: var(--sw-radius); }
.savorweek .sw-segment {
  border: 0; background: transparent;
  padding: 4px 8px; border-radius: 4px;
  font: 600 11px/14px 'Inter', sans-serif;
  color: var(--sw-on-surface-variant);
  transition: color 0.15s;
}
.savorweek .sw-segment:hover { color: var(--sw-on-surface); }
.savorweek .sw-segment.active { background: var(--sw-surface); color: var(--sw-on-surface); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06); }

.savorweek .sw-chip {
  border: 0; border-radius: 9999px;
  padding: 4px 12px;
  background: var(--sw-surface-high);
  color: var(--sw-on-surface-variant);
  font: 600 11px/14px 'Inter', sans-serif;
  transition: background-color 0.15s;
}
.savorweek .sw-chip:hover { background: var(--sw-surface-highest); }
.savorweek .sw-chip:disabled { opacity: 0.5; cursor: default; }
.savorweek .sw-chip.active { background: var(--sw-primary-container); color: var(--sw-on-primary-container); }

/* ===== Cards, tiles, pills ===== */
.savorweek .sw-tile { background: var(--sw-surface-lowest); padding: 16px; border-radius: var(--sw-radius-xl); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.savorweek .sw-round-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.savorweek .sw-bg-green-light { background: var(--sw-primary-fixed); }
.savorweek .sw-bg-gray { background: var(--sw-surface-high); }
.savorweek .sw-bg-peach { background: var(--sw-secondary-fixed); }
.savorweek .sw-bg-green-mid { background: var(--sw-primary-fixed-dim); color: var(--sw-on-primary-fixed); }

.savorweek .sw-card {
  background: var(--sw-surface-lowest);
  padding: 16px;
  border-radius: var(--sw-radius-2xl);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.savorweek .sw-card-lg { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
.savorweek .sw-card-bordered { border: 1px solid rgba(194, 200, 192, 0.4); }
.savorweek .sw-hover-lift { transition: box-shadow 0.2s; }
.savorweek .sw-hover-lift:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }

.savorweek .sw-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
}
.savorweek .sw-pill-gray { background: var(--sw-surface-high); color: var(--sw-on-surface-variant); }
.savorweek .sw-pill-green { background: var(--sw-primary-fixed); color: var(--sw-on-primary-fixed); }
.savorweek .sw-pill-peach { background: var(--sw-secondary-fixed); color: var(--sw-on-secondary-fixed); }
.savorweek .sw-pill-amber { background: var(--sw-tertiary-fixed); color: var(--sw-on-tertiary-fixed); }

/* ===== Day strip ===== */
.savorweek .sw-day-strip { background: var(--sw-surface-low); padding: 4px; border-radius: var(--sw-radius-2xl); overflow-x: auto; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); }
.savorweek .sw-day-strip-inner { min-width: max-content; }
.savorweek .sw-day {
  display: flex; flex-direction: column; align-items: center;
  border: 0;
  padding: 8px 16px;
  border-radius: var(--sw-radius-xl);
  background: rgba(255, 255, 255, 0.7);
  color: var(--sw-on-surface-variant);
  transition: background-color 0.15s;
}
.savorweek .sw-day:hover { background: var(--sw-surface-lowest); }
.savorweek .sw-day-count { font: 600 11px/14px 'Inter', sans-serif; padding: 1px 6px; border-radius: 4px; background: var(--sw-surface-container); color: var(--sw-outline); }
.savorweek .sw-day-kcal { font: 400 12px/18px 'Inter', sans-serif; color: var(--sw-outline); margin-top: 2px; }
.savorweek .sw-today-pill {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 9999px;
  background: var(--sw-primary-fixed); color: var(--sw-on-primary-fixed);
}
.savorweek .sw-day.active { background: var(--sw-primary); color: var(--sw-on-primary); padding: 8px 24px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
.savorweek .sw-day.active .sw-day-kcal { color: var(--sw-primary-fixed); font-weight: 500; }
.savorweek .sw-day.active .sw-day-count { background: rgba(255, 255, 255, 0.2); color: var(--sw-on-primary); }

/* ===== Dinner highlight ===== */
.savorweek .sw-dinner-img { width: 100%; height: 224px; overflow: hidden; }
@media (min-width: 992px) {
  .savorweek .sw-dinner-img { width: 320px; height: auto; min-height: 100%; }
}
.savorweek .sw-overlay-badge {
  position: absolute; top: 12px; left: 12px;
  padding: 4px 12px; border-radius: 9999px;
  background: var(--sw-primary); color: var(--sw-on-primary);
  font: 600 11px/14px 'Inter', sans-serif;
}
.savorweek .sw-overlay-time {
  position: absolute; bottom: 12px; left: 12px;
  padding: 2px 8px; border-radius: 4px;
  background: rgba(250, 250, 243, 0.9);
  font: 500 11px/14px 'Inter', sans-serif;
}
.savorweek .sw-steps { background: rgba(244, 244, 237, 0.7); padding: 8px; border-radius: var(--sw-radius-xl); display: flex; flex-direction: column; gap: 6px; }
.savorweek .sw-step-text { font-size: 12px; line-height: 18px; }
.savorweek .sw-step-num {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--sw-primary-fixed); color: var(--sw-on-primary-fixed);
  display: flex; align-items: center; justify-content: center;
  font: 700 11px/1 'Inter', sans-serif; flex-shrink: 0;
}

/* ===== Sidebar ===== */
@media (min-width: 1200px) {
  .savorweek .sw-sidebar { width: 320px; flex-shrink: 0; }
}

.savorweek .sw-ring { width: 64px; height: 64px; }
.savorweek .sw-ring-svg { width: 64px; height: 64px; transform: rotate(-90deg); }
.savorweek .sw-ring-track { stroke: var(--sw-surface-high); }
.savorweek .sw-ring-primary { stroke: var(--sw-primary); }
.savorweek .sw-ring-secondary { stroke: var(--sw-secondary); }
.savorweek .sw-ring-tertiary { stroke: var(--sw-tertiary); }

.savorweek .sw-draggable {
  padding: 8px;
  border-radius: var(--sw-radius-xl);
  background: var(--sw-surface-low);
  cursor: grab;
  transition: background-color 0.15s;
}
.savorweek .sw-draggable:hover { background: var(--sw-surface-high); }
.savorweek .sw-draggable:active { cursor: grabbing; }
.savorweek .sw-drag-handle { opacity: 0; transition: opacity 0.15s; }
.savorweek .sw-draggable:hover .sw-drag-handle { opacity: 1; }
.savorweek .sw-thumb { width: 40px; height: 40px; border-radius: var(--sw-radius); overflow: hidden; background: var(--sw-surface-highest); }

.savorweek .sw-cta {
  background: var(--sw-primary);
  color: var(--sw-on-primary);
  padding: 16px;
  border-radius: var(--sw-radius-2xl);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.savorweek .sw-cta-sub { color: var(--sw-on-primary-container); }
.savorweek .sw-cta-btn {
  background: var(--sw-surface);
  color: var(--sw-primary);
  border-radius: var(--sw-radius-xl);
  padding: 10px 16px;
}
.savorweek .sw-cta-btn:hover:not(:disabled) { background: var(--sw-surface-lowest); color: var(--sw-primary); }
.savorweek .sw-cta-btn:disabled { background: var(--sw-surface); color: var(--sw-primary); opacity: 0.95; }

.savorweek .sw-spin { animation: sw-spin 1s linear infinite; }
@keyframes sw-spin { to { transform: rotate(360deg); } }

/* ===== Footer ===== */
.savorweek .sw-footer { background: var(--sw-surface-low); margin-top: 40px; box-shadow: 0 -1px 8px rgba(0, 0, 0, 0.02); }
.savorweek .sw-footer-link {
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  color: var(--sw-on-surface-variant);
  text-decoration: none;
  transition: color 0.15s;
}
.savorweek .sw-footer-link:hover { color: var(--sw-on-surface); }
</style>