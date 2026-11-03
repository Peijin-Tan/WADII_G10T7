<script setup>
/* Dashboard: "This week" grid + next-open-slot suggestion + "Today" checklist.

   Data (all from the planner API, so it matches the Weekly Plan page exactly):
     GET   /planner?start=YYYY-MM-DD       -> this week's meals { entries: [{ id, dayOfWeek, mealSlot, status, recipe }] }
     GET   /planner/recipe-options          -> saved recipes, each with pantryMatch (% of ingredients in the pantry)
     PATCH /planner/entries/:id { status }  -> Cooked / Skipped / Planned (Cooked also takes ingredients from the pantry)
     POST  /planner/entries                 -> "Plan it for Thursday dinner"

   Using recipe-options for the suggestion means no Spoonacular quota is used on every dashboard visit. */
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createApi, errorMessage } from '@/services/api'
import { addDays, toISODate, mondayOf, startOfToday } from '@/utils/dates'

const api = createApi('/planner')

// Tells the Dashboard heading how today is going, e.g. "2 meals left to log today"
const emit = defineEmits(['summary'])
const router = useRouter()

/* ---------- Dates ---------- */
const today = startOfToday()
const todayIndex = (today.getDay() + 6) % 7 // Monday = 0
const weekStart = mondayOf(today)
const weekStartISO = toISODate(weekStart)

const days = Array.from({ length: 7 }, (_, i) => {
  const date = addDays(weekStart, i)
  return {
    index: i,
    short: date.toLocaleDateString('en-SG', { weekday: 'short' }), // "Mon"
    long: date.toLocaleDateString('en-SG', { weekday: 'long' }), //   "Monday"
    dayNumber: date.getDate(),
  }
})

const weekRange = (() => {
  const end = addDays(weekStart, 6)
  const month = (d) => d.toLocaleDateString('en-SG', { month: 'short' })
  return weekStart.getMonth() === end.getMonth()
    ? `${weekStart.getDate()}–${end.getDate()} ${month(end)}`
    : `${weekStart.getDate()} ${month(weekStart)} – ${end.getDate()} ${month(end)}`
})()

/* ---------- Loading ---------- */
const entries = ref([])
const recipes = ref([])
const loading = ref(true)
const error = ref('')
const busyIds = ref([]) // entries currently being saved
const justChanged = ref('') // entry id that plays the "pop" animation after a change

/* ---------- Little message bar under the grid ("Mee goreng marked cooked · Undo") ---------- */
const notice = ref(null) // { text, tone: 'success' | 'info' | 'error', undo: fn | null }
let noticeTimer = null

function showNotice(text, { tone = 'success', undo = null } = {}) {
  notice.value = { text, tone, undo }
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = null }, 6000)
}

async function runUndo() {
  const undo = notice.value?.undo
  notice.value = null
  clearTimeout(noticeTimer)
  if (undo) await undo()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [week, options] = await Promise.all([
      api.get('/', { params: { start: weekStartISO } }),
      api.get('/recipe-options', { params: { limit: 100 } }).catch(() => ({ data: [] })), // suggestion is optional
    ])
    entries.value = week.data.entries
    recipes.value = options.data
  } catch (err) {
    error.value = errorMessage(err, 'Could not load your meal plan.')
  } finally {
    loading.value = false
  }
}
onMounted(load)

/* ---------- Grid ---------- */
const BASE_SLOTS = ['breakfast', 'lunch', 'dinner']
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

// Snack row only appears if a snack is actually planned this week
const slots = computed(() =>
  entries.value.some((e) => e.mealSlot === 'snack') ? [...BASE_SLOTS, 'snack'] : BASE_SLOTS,
)

// grid['2-dinner'] = the entry for Wednesday dinner (the first one, if there are several)
const grid = computed(() => {
  const map = {}
  for (const e of entries.value) {
    const key = `${e.dayOfWeek}-${e.mealSlot}`
    if (!map[key]) map[key] = e
  }
  return map
})

const cellFor = (day, slot) => grid.value[`${day}-${slot}`]
const canChange = (day) => day <= todayIndex // you can only log meals that have happened (up to today)

/* ---------- Changing a meal's status ---------- */
const NEXT_STATUS = { Planned: 'Cooked', Cooked: 'Skipped', Skipped: 'Planned' }

// Tapping a grid cell cycles Planned → Cooked → Skipped → Planned
function cycle(entry) {
  return setStatus(entry, NEXT_STATUS[entry.status] || 'Cooked')
}

// Today's Cooked / Skipped buttons: pressing the active one again puts it back to Planned
function toggle(entry, status) {
  return setStatus(entry, entry.status === status ? 'Planned' : status)
}

async function setStatus(entry, status, { quiet = false } = {}) {
  if (busyIds.value.includes(entry.id)) return
  const previous = entry.status
  const wasTodayDone = todayDone.value
  busyIds.value.push(entry.id)
  try {
    const { data } = await api.patch(`/entries/${entry.id}`, { status })
    entries.value = data.entries // the server sends back the whole updated week
    popCell(entry.id)
    if (quiet) return

    // e.g. "Mee goreng marked cooked · 4 pantry items used"
    const used = data.pantryUpdate?.deducted?.length || 0
    const extra = status === 'Cooked' && used ? ` · ${used} pantry ${used === 1 ? 'item' : 'items'} used` : ''
    const done = !wasTodayDone && todayDone.value ? " That's all of today's meals logged!" : ''
    showNotice(`${entry.recipe.title} marked ${status.toLowerCase()}${extra}.${done}`, {
      tone: status === 'Cooked' ? 'success' : 'info',
      undo: () => setStatus(entry, previous, { quiet: true }),
    })
  } catch (err) {
    showNotice(errorMessage(err, 'Could not update that meal.'), { tone: 'error' })
  } finally {
    busyIds.value = busyIds.value.filter((id) => id !== entry.id)
  }
}

function popCell(id) {
  justChanged.value = ''
  requestAnimationFrame(() => {
    justChanged.value = id
    setTimeout(() => { if (justChanged.value === id) justChanged.value = '' }, 500)
  })
}

// "+ Plan" → Weekly Plan page with the Add Meal modal open for that day and meal
function planSlot(day, slot) {
  router.push({ path: '/planner', query: { day, add: slot } })
}

/* ---------- Suggestion for the next open slot ---------- */
// After these hours, today's meal is "over" and we don't suggest planning it
const SLOT_ENDS_AT = { breakfast: 11, lunch: 15, dinner: 21 }

const openSlot = computed(() => {
  const hour = new Date().getHours()
  for (let day = todayIndex; day < 7; day++) {
    for (const slot of BASE_SLOTS) {
      if (day === todayIndex && hour >= SLOT_ENDS_AT[slot]) continue
      if (!cellFor(day, slot)) return { day, slot }
    }
  }
  return null // the rest of the week is planned
})

// Best saved recipe for it: most ingredients already in the pantry, not already on this week's plan,
// quicker recipes first when it's a tie
const suggestion = computed(() => {
  if (!openSlot.value) return null
  const plannedIds = new Set(entries.value.map((e) => e.recipe?.id).filter(Boolean))
  const best = recipes.value
    .filter((r) => !plannedIds.has(r.id) && r.pantryMatch > 0)
    .sort((a, b) => b.pantryMatch - a.pantryMatch || (a.prepMinutes || 999) - (b.prepMinutes || 999))[0]
  if (!best) return null
  const missing = best.ingredients.filter((i) => !i.inPantry).map((i) => i.name.toLowerCase())
  return { recipe: best, missing }
})

const openSlotLabel = computed(() => {
  if (!openSlot.value) return ''
  const { day, slot } = openSlot.value
  return day === todayIndex ? `Today's ${slot}` : `${days[day].long} ${slot}`
})

const planningSuggestion = ref(false)

async function planSuggestion() {
  if (!suggestion.value || !openSlot.value || planningSuggestion.value) return
  const { recipe } = suggestion.value
  const { day, slot } = openSlot.value
  const label = openSlotLabel.value.replace("Today's", "today's") // "Thursday dinner" or "today's dinner"
  planningSuggestion.value = true
  try {
    const before = new Set(entries.value.map((e) => e.id))
    const { data } = await api.post('/entries', {
      start: weekStartISO,
      dayOfWeek: day,
      mealSlot: slot,
      servings: Math.min(Math.max(recipe.servings || 2, 1), 12),
      recipeId: recipe.id,
    })
    entries.value = data.entries
    const added = data.entries.find((e) => !before.has(e.id))
    if (added) popCell(added.id)
    showNotice(`Planned ${recipe.title} for ${label}.`, {
      undo: added
        ? async () => {
            const res = await api.delete(`/entries/${added.id}`)
            entries.value = res.data.entries
          }
        : null,
    })
  } catch (err) {
    showNotice(errorMessage(err, 'Could not add that meal.'), { tone: 'error' })
  } finally {
    planningSuggestion.value = false
  }
}

/* ---------- Today ---------- */
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
const todayEntries = computed(() =>
  entries.value
    .filter((e) => e.dayOfWeek === todayIndex)
    .sort((a, b) => SLOT_ORDER.indexOf(a.mealSlot) - SLOT_ORDER.indexOf(b.mealSlot)),
)
const todayCooked = computed(() => todayEntries.value.filter((e) => e.status === 'Cooked').length)
// "Done" = every meal today is either Cooked or Skipped
const todayDone = computed(
  () => todayEntries.value.length > 0 && todayEntries.value.every((e) => e.status !== 'Planned'),
)
const todayPercent = computed(() =>
  todayEntries.value.length ? Math.round((todayCooked.value / todayEntries.value.length) * 100) : 0,
)

watch(
  [loading, todayEntries],
  () => {
    if (loading.value || error.value) return
    emit('summary', {
      total: todayEntries.value.length,
      left: todayEntries.value.filter((e) => e.status === 'Planned').length,
    })
  },
  { immediate: true },
)
</script>


<template>
  <div class="wag">
    <!-- ===================== This week ===================== -->
    <section class="wag-week" aria-labelledby="wag-week-title">
      <header class="wag-head">
        <div>
          <h2 id="wag-week-title" class="wag-title">This week</h2>
          <p class="wag-sub">{{ weekRange }}</p>
        </div>
        <RouterLink to="/planner" class="wag-link" aria-label="Open meal plan">
          <span>Open meal plan</span>
          <span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>
        </RouterLink>
      </header>

      <div v-if="error" class="wag-error" role="alert">
        <span>{{ error }}</span>
        <button type="button" class="wag-btn-quiet" @click="load">Try again</button>
      </div>

      <template v-else>
        <!-- Scrolls sideways on narrow screens; the meal names column stays put -->
        <div class="wag-scroll">
          <div class="wag-grid" role="grid" :aria-busy="loading" aria-label="Meals planned this week">
            <!-- Header row -->
            <div class="wag-corner" role="columnheader"></div>
            <div v-for="d in days" :key="d.index" class="wag-dayhead" :class="{ 'is-today': d.index === todayIndex }"
              role="columnheader" :aria-current="d.index === todayIndex ? 'date' : null">
              <span class="wag-dayname">{{ d.short }}</span>
              <span class="wag-daynum">{{ d.dayNumber }}</span>
            </div>

            <!-- One row per meal time -->
            <template v-for="(slot, row) in slots" :key="slot">
              <div class="wag-slot" role="rowheader">{{ SLOT_LABEL[slot] }}</div>

              <template v-for="d in days" :key="slot + d.index">
                <!-- Loading placeholder -->
                <div v-if="loading" class="wag-cell wag-skeleton" aria-hidden="true"></div>

                <!-- Planned / Cooked / Skipped meal -->
                <button v-else-if="cellFor(d.index, slot)" type="button" class="wag-cell"
                  :class="[
                    `is-${cellFor(d.index, slot).status.toLowerCase()}`,
                    {
                      'is-today': d.index === todayIndex,
                      'is-past': d.index < todayIndex,
                      'is-locked': !canChange(d.index),
                      'is-busy': busyIds.includes(cellFor(d.index, slot).id),
                      'is-pop': justChanged === cellFor(d.index, slot).id,
                    },
                  ]"
                  :style="{ animationDelay: (row * 7 + d.index) * 22 + 'ms' }"
                  :title="cellFor(d.index, slot).recipe.title"
                  :aria-label="`${d.long} ${slot}: ${cellFor(d.index, slot).recipe.title}, ${cellFor(d.index, slot).status}.${canChange(d.index) ? ' Tap to change.' : ''}`"
                  @click="canChange(d.index) ? cycle(cellFor(d.index, slot)) : router.push('/planner')">
                  <span class="wag-meal">{{ cellFor(d.index, slot).recipe.title }}</span>
                  <span class="wag-status">
                    <span class="wag-dot" aria-hidden="true"></span>{{ cellFor(d.index, slot).status }}
                  </span>
                </button>

                <!-- Empty slot -->
                <button v-else type="button" class="wag-cell is-open"
                  :class="{
                    'is-next': openSlot && openSlot.day === d.index && openSlot.slot === slot,
                    'is-past': d.index < todayIndex,
                  }"
                  :style="{ animationDelay: (row * 7 + d.index) * 22 + 'ms' }"
                  :aria-label="`Plan ${d.long} ${slot}`" @click="planSlot(d.index, slot)">
                  <span class="material-symbols-outlined" aria-hidden="true">add</span>
                  <span>Plan</span>
                </button>
              </template>
            </template>
          </div>
        </div>

        <!-- Legend -->
        <div class="wag-legend">
          <span><span class="wag-key is-cooked"></span>Cooked</span>
          <span><span class="wag-key is-planned"></span>Planned</span>
          <span><span class="wag-key is-skipped"></span>Skipped</span>
          <span><span class="wag-key is-open"></span>Open</span>
          <span class="wag-hint">Tap a meal up to today to change it</span>
        </div>

        <!-- Result of the last change, with Undo -->
        <Transition name="wag-fade">
          <div v-if="notice" class="wag-notice" :class="`is-${notice.tone}`" role="status">
            <span>{{ notice.text }}</span>
            <button v-if="notice.undo" type="button" class="wag-undo" @click="runUndo">Undo</button>
          </div>
        </Transition>
      </template>
    </section>

    <div v-if="!error" class="wag-lower">
      <!-- ===================== Today ===================== -->
      <section class="wag-today" aria-labelledby="wag-today-title">
        <header class="wag-today-head">
          <h2 id="wag-today-title" class="wag-title">Today</h2>
          <p v-if="!loading && todayEntries.length" class="wag-sub" :class="{ 'is-done': todayDone }">
            {{ todayDone ? 'All logged' : `${todayCooked} of ${todayEntries.length} cooked` }}
          </p>
        </header>
        <div v-if="!loading && todayEntries.length" class="wag-meter" aria-hidden="true">
          <span :style="{ width: todayPercent + '%' }"></span>
        </div>

        <div v-if="loading" class="wag-skeleton wag-skeleton-rows" aria-hidden="true"></div>

        <div v-else-if="todayEntries.length === 0" class="wag-today-empty">
          <p class="m-0">Nothing planned for today.</p>
          <button type="button" class="wag-btn-quiet" @click="planSlot(todayIndex, 'dinner')">Plan tonight's dinner</button>
        </div>

        <ul v-else class="wag-rows">
          <li v-for="e in todayEntries" :key="e.id" class="wag-row"
            :class="{ 'is-pop': justChanged === e.id, 'is-skipped': e.status === 'Skipped', 'is-cooked': e.status === 'Cooked' }">
            <div class="wag-row-when">
              <span>{{ SLOT_LABEL[e.mealSlot] }}</span>
              <span v-if="e.recipe.prepMinutes" class="wag-row-time">{{ e.recipe.prepMinutes }} min</span>
            </div>
            <p class="wag-row-title">{{ e.recipe.title }}</p>
            <div class="wag-seg" role="group" :aria-label="`Log ${e.recipe.title}`">
              <button type="button" class="wag-seg-btn" :class="{ active: e.status === 'Cooked' }"
                :aria-pressed="e.status === 'Cooked'" :disabled="busyIds.includes(e.id)" @click="toggle(e, 'Cooked')">
                <span class="material-symbols-outlined" aria-hidden="true">check</span>Cooked
              </button>
              <button type="button" class="wag-seg-btn is-skip" :class="{ active: e.status === 'Skipped' }"
                :aria-pressed="e.status === 'Skipped'" :disabled="busyIds.includes(e.id)" @click="toggle(e, 'Skipped')">
                Skipped
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- ===================== Next open slot ===================== -->
      <Transition name="wag-fade" mode="out-in">
        <div v-if="loading" key="loading" class="wag-next wag-skeleton" aria-hidden="true"></div>

        <aside v-else-if="openSlot && suggestion" :key="openSlotLabel + suggestion.recipe.id" class="wag-next"
          aria-labelledby="wag-next-title">
          <p class="wag-next-when">{{ openSlotLabel }} is open</p>
          <h3 id="wag-next-title" class="wag-next-title">{{ suggestion.recipe.title }}</h3>

          <div class="wag-match">
            <div class="wag-match-bar" aria-hidden="true"><span :style="{ width: suggestion.recipe.pantryMatch + '%' }"></span></div>
            <p class="m-0">{{ suggestion.recipe.pantryMatch }}% of it is already in your pantry</p>
          </div>

          <dl class="wag-facts">
            <div v-if="suggestion.recipe.prepMinutes">
              <dt>Time</dt>
              <dd>{{ suggestion.recipe.prepMinutes }} min</dd>
            </div>
            <div>
              <dt>{{ suggestion.missing.length ? 'You\'ll need' : 'Shopping' }}</dt>
              <dd>
                {{ suggestion.missing.length === 0 ? 'Nothing to buy'
                  : suggestion.missing.length <= 2 ? suggestion.missing.join(', ')
                  : `${suggestion.missing.length} more ingredients` }}
              </dd>
            </div>
          </dl>

          <button type="button" class="wag-cta" :disabled="planningSuggestion" @click="planSuggestion">
            {{ planningSuggestion ? 'Planning...' : `Plan it for ${openSlotLabel}` }}
          </button>
        </aside>

        <aside v-else-if="openSlot" key="no-suggestion" class="wag-next">
          <p class="wag-next-when">{{ openSlotLabel }} is open</p>
          <h3 class="wag-next-title">Pick something to cook</h3>
          <p class="wag-next-text">Add what's in your kitchen to the pantry and we'll suggest recipes that use it.</p>
          <button type="button" class="wag-cta" @click="planSlot(openSlot.day, openSlot.slot)">
            Plan {{ openSlotLabel }}
          </button>
        </aside>

        <aside v-else key="full" class="wag-next is-full">
          <span class="material-symbols-outlined wag-full-icon" aria-hidden="true">event_available</span>
          <h3 class="wag-next-title">Every meal this week is planned</h3>
          <p class="wag-next-text">Build your shopping list so you have everything in time.</p>
          <RouterLink to="/shoppinglist" class="wag-cta">Open shopping list</RouterLink>
        </aside>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* Colours come from theme.css (the Dashboard page has class="fft-page").
   Peach is the "suggestion" colour: it marks the one thing the app is recommending. */
.wag {
  --wag-ink: var(--fft-text);
  --wag-leaf: var(--fft-primary);
  --wag-peach-bg: #fff3ed;
  --wag-peach-line: #f7cfbf;
  --wag-peach-ink: #5c2410;
  --wag-radius-lg: 20px;
  --wag-radius-sm: 10px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ---------- Shared bits ---------- */
.wag-title {
  margin: 0;
  font: 600 22px/28px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
  color: var(--wag-ink);
}

.wag-sub {
  margin: 2px 0 0;
  font: 400 14px/20px 'Inter', sans-serif;
  color: var(--fft-muted);
}

.wag-sub.is-done {
  color: var(--wag-leaf);
  font-weight: 600;
}

.wag-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--fft-border);
  border-radius: 9999px;
  color: var(--wag-leaf);
  font: 600 13px/18px 'Inter', sans-serif;
  text-decoration: none;
  transition: background-color var(--dur-fast, 150ms), border-color var(--dur-fast, 150ms);
}

.wag-link:hover {
  background: var(--fft-surface-low);
  border-color: var(--wag-leaf);
  color: var(--wag-leaf);
}

.wag-link .material-symbols-outlined {
  font-size: 18px;
}

.wag-btn-quiet {
  border: 0;
  padding: 6px 0;
  background: none;
  color: var(--wag-leaf);
  font: 600 14px/20px 'Inter', sans-serif;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.wag-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--wag-radius-sm);
  background: #fdecea;
  color: #8c1d18;
}

/* ---------- This week (the hero) ---------- */
.wag-week {
  background: var(--fft-card);
  border: 1px solid rgb(194 200 192 / 45%);
  border-radius: var(--wag-radius-lg);
  padding: 24px 24px 20px;
  box-shadow: 0 1px 2px rgb(26 28 24 / 4%), 0 12px 32px -16px rgb(50 83 60 / 18%);
}

.wag-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}

.wag-scroll {
  overflow-x: auto;
  margin: -4px;
  padding: 4px; /* room for focus rings and the pop animation */
}

.wag-grid {
  display: grid;
  grid-template-columns: 92px repeat(7, minmax(100px, 1fr));
  gap: 8px;
  min-width: 800px;
}

.wag-dayhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 6px 6px;
  border-bottom: 2px solid transparent;
  color: var(--fft-muted);
}

.wag-dayname {
  font: 500 13px/18px 'Inter', sans-serif;
}

.wag-daynum {
  font: 500 18px/22px 'Outfit', sans-serif;
  color: var(--fft-secondary-text);
}

/* Today's column header: underlined in leaf green */
.wag-dayhead.is-today {
  border-bottom-color: var(--wag-leaf);
  color: var(--wag-leaf);
}

.wag-dayhead.is-today .wag-dayname {
  font-weight: 700;
}

.wag-dayhead.is-today .wag-daynum {
  color: var(--wag-leaf);
  font-weight: 700;
}

.wag-slot,
.wag-corner {
  position: sticky; /* stays visible when the grid scrolls sideways on phones */
  left: 0;
  z-index: 1;
  background: var(--fft-card);
}

.wag-slot {
  display: flex;
  align-items: center;
  color: var(--fft-secondary-text);
  font: 500 14px/20px 'Inter', sans-serif;
}

.wag-cell {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
  height: 76px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--wag-radius-sm);
  background: var(--fft-surface-low);
  color: var(--wag-ink);
  text-align: left;
  font: 400 13.5px/18px 'Inter', sans-serif;
  cursor: pointer;
  animation: wag-in 0.32s var(--ease-out, ease) both; /* cells settle in one after another (delay set inline) */
  transition:
    transform var(--dur-fast, 150ms) var(--ease-out, ease),
    box-shadow var(--dur-fast, 150ms),
    background-color 0.25s,
    color 0.25s;
}

.wag-cell:hover:not(.is-locked) {
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgb(26 28 24 / 8%);
}

.wag-cell:active:not(.is-locked) {
  transform: scale(0.97);
}

.wag-cell:focus-visible {
  outline: 2px solid var(--wag-leaf);
  outline-offset: 2px;
}

.wag-meal {
  display: -webkit-box; /* two lines max, then "…" */
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
}

.wag-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--fft-muted);
}

.wag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  flex-shrink: 0;
}

/* Cooked: solid leaf green */
.wag-cell.is-cooked {
  background: var(--wag-leaf);
  color: #fff;
}

.wag-cell.is-cooked .wag-status {
  color: rgb(255 255 255 / 85%);
}

.wag-cell.is-cooked .wag-dot {
  background: currentColor;
}

/* Planned: white with a soft outline so it reads as "still to do" */
.wag-cell.is-planned {
  background: var(--fft-card);
  border-color: var(--fft-surface-high);
}

/* Skipped: crossed out, faded, dash instead of a dot */
.wag-cell.is-skipped {
  background: transparent;
  border: 1px solid var(--fft-surface-high);
}

.wag-cell.is-skipped .wag-meal {
  text-decoration: line-through;
  color: var(--fft-muted);
  font-weight: 400;
}

.wag-cell.is-skipped .wag-dot {
  height: 0;
  border-radius: 0;
  border-width: 1.5px 0 0;
}

/* Today's column: leaf outline on planned meals */
.wag-cell.is-today.is-planned {
  border: 1.5px solid var(--wag-leaf);
}

.wag-cell.is-today.is-cooked {
  box-shadow: 0 0 0 2px var(--fft-card), 0 0 0 3.5px var(--wag-leaf);
}

.wag-cell.is-locked {
  cursor: default;
}

.wag-cell.is-busy {
  opacity: 0.55;
  pointer-events: none;
}

/* Open slot: quiet dashed "+ Plan" */
.wag-cell.is-open {
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: 1px dashed var(--fft-border);
  color: var(--fft-muted);
  font-weight: 500;
}

.wag-cell.is-open .material-symbols-outlined {
  font-size: 18px;
}

.wag-cell.is-open.is-past {
  opacity: 0.55;
}

.wag-cell.is-open:hover {
  border-color: var(--wag-leaf);
  color: var(--wag-leaf);
  background: var(--fft-surface-low);
}

/* The open slot the suggestion card is about: peach, so the two visibly connect */
.wag-cell.is-next {
  background: var(--wag-peach-bg);
  border: 1.5px dashed #e3a58c;
  color: var(--wag-peach-ink);
  animation: wag-in 0.32s var(--ease-out, ease) both, wag-breathe 2.6s ease-in-out 0.8s infinite;
}

.wag-cell.is-pop {
  animation: wag-pop 0.4s cubic-bezier(0.17, 0.89, 0.32, 1.4);
}

.wag-skeleton {
  background: linear-gradient(90deg, var(--fft-surface-low) 25%, var(--fft-surface-high) 50%, var(--fft-surface-low) 75%);
  background-size: 200% 100%;
  animation: wag-shimmer 1.2s linear infinite;
  border-color: transparent;
  cursor: default;
}

/* Legend */
.wag-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 18px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--fft-surface-low);
  color: var(--fft-muted);
  font: 400 13px/18px 'Inter', sans-serif;
}

.wag-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wag-hint {
  margin-left: auto;
}

.wag-key {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--fft-muted);
}

.wag-key.is-cooked {
  background: var(--wag-leaf);
  border-color: var(--wag-leaf);
}

.wag-key.is-skipped {
  width: 10px;
  height: 0;
  border-radius: 0;
  border-width: 1.5px 0 0;
}

.wag-key.is-open {
  border-style: dashed;
  border-color: var(--fft-border);
}

/* Message bar */
.wag-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 10px 10px 16px;
  border-radius: 12px;
  background: var(--wag-ink);
  color: #fafaf3;
  font: 500 14px/20px 'Inter', sans-serif;
}

.wag-notice.is-error {
  background: #8c1d18;
}

.wag-undo {
  flex-shrink: 0;
  border: 0;
  border-radius: 8px;
  padding: 4px 12px;
  background: rgb(199 236 206 / 14%);
  color: var(--fft-primary-light);
  font: 600 13px/18px 'Inter', sans-serif;
}

.wag-undo:hover {
  background: rgb(199 236 206 / 24%);
}

/* ---------- Today + suggestion row ---------- */
.wag-lower {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.wag-today {
  background: var(--fft-card);
  border: 1px solid rgb(194 200 192 / 45%);
  border-radius: var(--wag-radius-lg);
  padding: 22px 24px 10px;
}

.wag-today-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.wag-meter {
  height: 4px;
  margin: 14px 0 6px;
  border-radius: 9999px;
  background: var(--fft-surface-high);
  overflow: hidden;
}

.wag-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--wag-leaf);
  transition: width 0.4s var(--ease-out, ease);
}

.wag-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.wag-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--fft-surface-low);
}

.wag-row:first-child {
  border-top: 0;
}

.wag-row-when {
  display: flex;
  flex-direction: column;
  font: 500 13px/18px 'Inter', sans-serif;
  color: var(--fft-secondary-text);
}

.wag-row-time {
  color: var(--fft-muted);
  font-weight: 400;
}

.wag-row-title {
  margin: 0;
  font: 500 17px/24px 'Outfit', sans-serif;
  color: var(--wag-ink);
  transition: color 0.2s;
}

.wag-row.is-skipped .wag-row-title {
  text-decoration: line-through;
  color: var(--fft-muted);
}

.wag-row.is-pop {
  animation: wag-pop-soft 0.4s ease;
}

/* Cooked / Skipped as one segmented control */
.wag-seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 9999px;
  background: var(--fft-surface-low);
}

.wag-seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  border-radius: 9999px;
  padding: 6px 14px;
  background: transparent;
  color: var(--fft-secondary-text);
  font: 500 13px/18px 'Inter', sans-serif;
  transition:
    background-color var(--dur-fast, 150ms),
    color var(--dur-fast, 150ms),
    transform var(--dur-press, 160ms) var(--ease-out, ease);
}

.wag-seg-btn .material-symbols-outlined {
  display: none;
  font-size: 16px;
}

.wag-seg-btn:hover:not(:disabled):not(.active) {
  color: var(--wag-ink);
  background: var(--fft-surface-high);
}

.wag-seg-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.wag-seg-btn.active {
  background: var(--wag-leaf);
  color: #fff;
}

.wag-seg-btn.active .material-symbols-outlined {
  display: inline;
}

.wag-seg-btn.is-skip.active {
  background: var(--fft-card);
  color: var(--wag-ink);
  box-shadow: 0 1px 3px rgb(26 28 24 / 14%);
}

.wag-seg-btn:focus-visible {
  outline: 2px solid var(--wag-leaf);
  outline-offset: 1px;
}

.wag-today-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 0 14px;
  color: var(--fft-secondary-text);
}

.wag-skeleton-rows {
  height: 168px;
  margin: 16px 0 14px;
  border-radius: 12px;
}

/* ---------- Suggestion card ---------- */
.wag-next {
  display: flex;
  flex-direction: column;
  min-height: 260px;
  padding: 22px 24px 24px;
  border: 1px solid var(--wag-peach-line);
  border-radius: var(--wag-radius-lg);
  background: var(--wag-peach-bg);
  color: var(--wag-peach-ink);
}

.wag-next-when {
  margin: 0 0 6px;
  font: 600 14px/20px 'Inter', sans-serif;
  color: #a2482a;
}

.wag-next-title {
  margin: 0 0 16px;
  font: 600 24px/30px 'Outfit', sans-serif;
  letter-spacing: -0.01em;
  color: var(--wag-ink);
  text-wrap: balance;
}

.wag-next-text {
  margin: 0 0 20px;
  font: 400 14px/22px 'Inter', sans-serif;
  color: var(--fft-secondary-text);
}

.wag-match {
  margin-bottom: 16px;
  font: 400 13px/18px 'Inter', sans-serif;
  color: var(--fft-secondary-text);
}

.wag-match-bar {
  height: 6px;
  margin-bottom: 8px;
  border-radius: 9999px;
  background: rgb(255 255 255 / 80%);
  overflow: hidden;
}

.wag-match-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--wag-leaf);
}

.wag-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 24px;
  margin: 0 0 22px;
}

.wag-facts > div {
  display: contents;
}

.wag-facts dt {
  font: 400 13px/20px 'Inter', sans-serif;
  color: var(--fft-muted);
}

.wag-facts dd {
  margin: 0;
  font: 500 14px/20px 'Inter', sans-serif;
  color: var(--wag-ink);
}

.wag-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: auto;
  border: 0;
  border-radius: 12px;
  padding: 13px 20px;
  background: var(--wag-leaf);
  color: #fff;
  font: 600 15px/20px 'Inter', sans-serif;
  text-decoration: none;
  transition:
    background-color var(--dur-fast, 150ms),
    transform var(--dur-press, 160ms) var(--ease-out, ease);
}

.wag-cta:hover:not(:disabled) {
  background: var(--fft-primary-hover);
  color: #fff;
}

.wag-cta:active:not(:disabled) {
  transform: scale(0.97);
}

.wag-cta:disabled {
  opacity: 0.6;
}

.wag-cta:focus-visible {
  outline: 2px solid var(--wag-leaf);
  outline-offset: 3px;
}

/* Whole week planned */
.wag-next.is-full {
  background: var(--fft-card);
  border-color: rgb(194 200 192 / 45%);
}

.wag-full-icon {
  margin-bottom: 10px;
  font-size: 32px;
  color: var(--wag-leaf);
}

/* ---------- Animations ---------- */
@keyframes wag-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@keyframes wag-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

@keyframes wag-pop-soft {
  0% { background-color: transparent; }
  30% { background-color: var(--fft-surface-low); }
  100% { background-color: transparent; }
}

@keyframes wag-breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgb(227 165 140 / 0%); }
  50% { box-shadow: 0 0 0 5px rgb(227 165 140 / 22%); }
}

@keyframes wag-shimmer {
  to { background-position: -200% 0; }
}

.wag-fade-enter-active,
.wag-fade-leave-active {
  transition: opacity 0.22s var(--ease-out, ease), transform 0.22s var(--ease-out, ease);
}

.wag-fade-enter-from,
.wag-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* ---------- Tablets ---------- */
@media (max-width: 991.98px) {
  .wag-lower {
    grid-template-columns: 1fr;
  }

  .wag-next {
    min-height: 0;
  }
}

/* ---------- Phones ---------- */
@media (max-width: 767.98px) {
  .wag-week,
  .wag-today,
  .wag-next {
    padding: 18px 16px;
    border-radius: 18px;
  }

  .wag-grid {
    grid-template-columns: 74px repeat(7, 96px);
    min-width: 0;
  }

  .wag-hint {
    flex-basis: 100%;
    margin-left: 0;
  }

  .wag-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 12px;
  }

  .wag-row-when {
    grid-column: 1 / -1;
    flex-direction: row;
    gap: 8px;
  }

  .wag-link span:not(.material-symbols-outlined) {
    display: none; /* icon only on phones */
  }

  .wag-link {
    padding: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wag-cell,
  .wag-cell.is-next,
  .wag-cell.is-pop,
  .wag-row.is-pop,
  .wag-skeleton {
    animation: none;
  }
}
</style>
