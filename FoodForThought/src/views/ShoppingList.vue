<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'

/* ---------------------------------------------------------------
   Data  (swap these for your backend / store later)
   Tag `dot` picks the little coloured dot: primary | primary-container |
   secondary | tertiary | neutral. Leave it out for a plain pill.
---------------------------------------------------------------- */
let nextId = 1
const item = (name, meta, tags = [], extra = {}) => ({
  id: nextId++,
  name,
  meta,
  tags,
  checked: false,
  inPantry: false,
  ...extra,
})

const aisles = ref([
  {
    id: 'produce',
    title: 'Produce & Fresh Herbs',
    sub: 'Aisle 1 • Ambient & Cold Mist Island',
    icon: 'nutrition',
    tone: 'green',
    items: [
      item('Baby spinach', '5 oz clamshell • $3.49', [
        { label: 'Tuscan Chicken', dot: 'secondary' },
        { label: 'Green Frittata', dot: 'tertiary' },
      ]),
      item('Cherry tomatoes', '1 pint • $3.99', [{ label: 'Tuscan Chicken', dot: 'secondary' }]),
      item('Fresh basil', '1 bunch (hydroponic) • $2.49', [
        { label: 'Tuscan Chicken', dot: 'secondary' },
        { label: 'Lemon Pasta', dot: 'primary' },
      ]),
      item('Asparagus spears', '1 bunch (approx. 1 lb) • $4.29', [
        { label: 'Salmon Traybake', dot: 'primary-container' },
      ]),
      item('Lemons', '3 count • $2.10', [
        { label: 'Lemon Pasta', dot: 'primary' },
        { label: 'Salmon Traybake', dot: 'primary-container' },
      ]),
      item('Garlic bulb', '2 bulbs • $1.20', [{ label: 'Shared Across 4 Meals', dot: 'neutral' }]),
    ],
  },
  {
    id: 'meat',
    title: 'Meat & Seafood',
    sub: 'Aisle 2 • Cold Butchery & Fishery Counter',
    icon: 'set_meal',
    tone: 'peach',
    items: [
      item('Chicken breasts (boneless, organic)', '2 lbs • $14.99', [
        { label: 'Tuscan Chicken (Wed)', dot: 'secondary', variant: 'peach' },
      ]),
      item('Atlantic Salmon fillets', '4x 6oz center-cut fillets • $22.40', [
        { label: 'Salmon Traybake (Mon)', dot: 'secondary', variant: 'peach' },
      ]),
    ],
  },
  {
    id: 'dairy',
    title: 'Dairy & Refrigerated',
    sub: 'Aisle 4 • Dairy Case & Artisan Cheeses',
    icon: 'egg',
    tone: 'amber',
    items: [
      item('Heavy cream', '1 pint (organic) • $3.69', [{ label: 'Tuscan Chicken' }]),
      item('Greek yogurt (plain 5%)', '32 oz tub • $5.99', [{ label: 'Breakfast Bowls (Daily)' }]),
      item('Parmigiano-Reggiano', '6 oz wedge, aged 24m • $7.80', [
        { label: 'Lemon Pasta' },
        { label: 'Tuscan Chicken' },
      ]),
      item('Feta block in brine', '7 oz • $4.50', [{ label: 'Quinoa Salad' }]),
    ],
  },
  {
    id: 'pantry',
    title: 'Pantry, Grains & Spices',
    sub: 'Aisles 7 & 9 • Dry Goods & Condiments',
    icon: 'kitchen',
    tone: 'neutral',
    items: [
      item('Tri-color Quinoa', '16 oz bag • $3.99', [{ label: 'Quinoa Mediterranean Bowl' }]),
      item('Penne rigate (bronze cut)', '16 oz • $2.29', [{ label: 'Lemon Pasta' }]),
      item('Extra Virgin Olive Oil', '750ml • 65% remaining at home', [
        { label: '$0.00 saved', variant: 'high' },
      ], { inPantry: true, checked: true }),
      item('Dijon mustard', '8 oz jar • $2.75', [{ label: 'Salad Vinaigrettes' }]),
    ],
  },
])

const routeSteps = [
  { label: '1. Produce & Fresh Greens', sub: '6 items • Est. 4 mins', dot: 'primary' },
  { label: '2. Dry Goods & Pantry Aisles', sub: '4 items • Est. 5 mins' },
  { label: '3. Refrigerated & Cheeses', sub: '4 items • Est. 3 mins' },
  { label: '4. Fresh Fishery & Poultry', sub: 'Keep chilled till checkout', dot: 'secondary', subTone: 'secondary' },
]

const savings = [
  { title: 'Full Fresh Basil Bunch', sub: 'Shared in 2 recipes (100% utilized)', badge: '0% waste' },
  { title: 'Olive Oil & Spices', sub: 'Deducted from home pantry', badge: 'Saved $16' },
  { title: 'Heavy Cream (16 oz)', sub: '12 oz Tuscan Chicken + 4 oz soup base', badge: 'Zero spoil' },
]

const featuredMeals = [
  {
    name: 'Tuscan Chicken',
    alt: 'A rustic pan of creamy Tuscan chicken with sun-dried tomatoes, baby spinach and golden chicken cutlets in garlic parmesan cream sauce.',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD3yZxYQ-9Ny1Z9Czwb4yX2SjKs5IoX7cs8OfaXIXNXAW90W-x8-rVsDa86BymsPiqHf0s3fbivjKQUAP4KxYBVTnZlMeXmEg-6JeW6EW0_FsGv9oonl1kLZ3s8QWFzUFuGe56DuHc2Cdv5hElLap17NYAJZfowkWMrkgG5pEZb0K8y5rlxkssIAvOfqxMyfegAY1WEgI0fju_bBezViQ0R9lCn1-MNx70sOpm5RnA',
  },
  {
    name: 'Salmon Traybake',
    alt: 'Oven-roasted Atlantic salmon fillets with lemon wheels, asparagus and fresh dill on a ceramic baking sheet.',
    src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCbBTf4ASBZDxarhUTDZTXKSa2d6wbwqCihp7rLp6hQPPKWBlqSLA21Z1VZy0G-5d2D0-6uZp_jvOcRnBBHJQxq_jbYDA2fe0Pcy9DuneIizVb7HuGqZxwYMXxPot9u5NSp5bmyVlxsZxi36icWigRPxBYhtc1Q0PXLSViux6KWvHgNZ56N_LjiQj7pAKOnfxcB96EBAuSQUE3KAA2uDrefuW997AW23qT3F6zQITY',
  },
]

const categoryOptions = computed(() => aisles.value.map((a) => ({ id: a.id, title: a.title })))

/* ---------------------------------------------------------------
   Stats
---------------------------------------------------------------- */
const allItems = computed(() => aisles.value.flatMap((a) => a.items))
const total = computed(() => allItems.value.length)
const bought = computed(() => allItems.value.filter((i) => i.checked).length)
const unbought = computed(() => total.value - bought.value)
const inPantryCount = computed(() => allItems.value.filter((i) => i.inPantry).length)
const percent = computed(() => (total.value === 0 ? 0 : Math.round((bought.value / total.value) * 100)))

/* ---------------------------------------------------------------
   Filters
---------------------------------------------------------------- */
const filter = ref('all') // 'all' | 'tobuy' | 'pantry'
const hidePantry = ref(false)

const filters = computed(() => [
  { key: 'all', label: 'All Items', count: total.value },
  { key: 'tobuy', label: 'To Buy', count: unbought.value },
  { key: 'pantry', label: 'In Pantry', count: inPantryCount.value },
])

function visibleItems(aisle) {
  return aisle.items.filter((i) => {
    if (hidePantry.value && i.inPantry) return false
    if (filter.value === 'tobuy') return !i.checked
    if (filter.value === 'pantry') return i.inPantry
    return true
  })
}

const visibleAisles = computed(() => aisles.value.filter((a) => visibleItems(a).length > 0))

/* ---------------------------------------------------------------
   Add custom item
---------------------------------------------------------------- */
const newItemName = ref('')
const newItemCategory = ref('produce')

function addItem() {
  const name = newItemName.value.trim()
  if (!name) return
  const aisle = aisles.value.find((a) => a.id === newItemCategory.value) ?? aisles.value[0]
  aisle.items.push(item(name, 'Custom added item', [{ label: 'Manual' }]))
  newItemName.value = ''
}

/* ---------------------------------------------------------------
   Delivery sync (demo)
---------------------------------------------------------------- */
const syncState = ref('idle') // 'idle' | 'loading' | 'done'
const timers = []

function syncDelivery() {
  if (syncState.value !== 'idle') return
  syncState.value = 'loading'
  timers.push(
    setTimeout(() => {
      syncState.value = 'done'
      timers.push(setTimeout(() => (syncState.value = 'idle'), 3500))
    }, 1200),
  )
}

onBeforeUnmount(() => timers.forEach(clearTimeout))

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
              <span class="sw-pill sw-pill--hero">
                <span class="sw-dot sw-dot--primary"></span>
                Auto-Compiled from 7 Planned Meals
              </span>
              <span class="sw-label-md sw-text-tertiary">Week of Oct 21 – 27, 2024</span>
            </div>
            <h1 class="sw-headline-lg">Shopping List &amp; Market Route</h1>
            <p class="sw-body-md sw-text-variant">
              Cross-referenced with your home inventory. Zero wasted herbs, synced quantities, and sequenced by optimal
              market aisle flow.
            </p>
          </div>

          <!-- Progress + actions -->
          <div
            class="sw-hero-actions d-flex flex-column flex-sm-row flex-lg-column flex-xl-row align-items-stretch align-items-sm-center gap-3 w-100"
          >
            <div class="sw-card d-flex align-items-center gap-3 p-3">
              <div class="sw-ring">
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <path
                    class="sw-ring-track"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    class="sw-ring-bar"
                    :stroke-dasharray="`${percent}, 100`"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div class="sw-ring-label">
                  <span class="sw-label-sm">{{ percent }}%</span>
                </div>
              </div>
              <div class="d-flex flex-column">
                <span class="sw-label-lg">{{ bought }} of {{ total }} items</span>
                <span class="sw-label-sm sw-text-outline">
                  Est. basket total:
                  <strong class="fw-semibold" style="color: var(--sw-on-surface)">$94.50</strong>
                </span>
              </div>
            </div>

            <div class="d-flex align-items-center gap-2">
              <button
                type="button"
                class="btn sw-btn sw-btn-highest shadow-sm flex-fill flex-sm-grow-0"
                @click="printList"
              >
                <span class="material-symbols-outlined sw-ico-18">print</span>
                <span>Print</span>
              </button>

              <button
                type="button"
                class="btn sw-btn shadow-sm flex-fill flex-sm-grow-0"
                :class="syncState === 'done' ? 'sw-btn-primary' : 'sw-btn-secondary'"
                :disabled="syncState !== 'idle'"
                @click="syncDelivery"
              >
                <template v-if="syncState === 'loading'">
                  <span class="material-symbols-outlined sw-ico-18 sw-spin">refresh</span>
                  <span>Connecting cart...</span>
                </template>
                <template v-else-if="syncState === 'done'">
                  <span class="material-symbols-outlined sw-ico-18">check</span>
                  <span>Ready in Instacart!</span>
                </template>
                <template v-else>
                  <span class="material-symbols-outlined sw-ico-18">local_shipping</span>
                  <span>Sync with Delivery</span>
                </template>
              </button>
            </div>
          </div>
        </div>

        <!-- Quick filter bar -->
        <div class="sw-filterbar d-flex flex-wrap align-items-center justify-content-between gap-3">
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
            <span class="sw-label-md sw-text-variant">Hide pantry staples already in stock</span>
          </label>
        </div>
      </div>
    </section>

    <!-- ===================== Main grid ===================== -->
    <div class="row g-4 align-items-start">
      <!-- ---------- Left: aisle lists ---------- -->
      <div class="col-12 col-lg-8">
        <div class="d-flex flex-column gap-4">
          <!-- Quick add -->
          <div class="sw-card d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center gap-2 p-3">
            <div class="sw-addbox">
              <span class="material-symbols-outlined sw-ico-20 sw-text-outline">add_circle</span>
              <input
                v-model="newItemName"
                type="text"
                class="form-control sw-bare-input"
                placeholder="Add custom item (e.g. Maldon flaky salt, Oat milk)..."
                aria-label="Custom item name"
                @keydown.enter="addItem"
              />
            </div>
            <div class="d-flex align-items-center gap-1">
              <select v-model="newItemCategory" class="form-select sw-select" aria-label="Aisle">
                <option v-for="c in categoryOptions" :key="c.id" :value="c.id">{{ c.title }}</option>
              </select>
              <button type="button" class="btn sw-btn sw-btn-primary flex-shrink-0" @click="addItem">Add Item</button>
            </div>
          </div>

          <!-- Aisle sections -->
          <section v-for="aisle in visibleAisles" :key="aisle.id" class="sw-card sw-aisle">
            <div class="sw-aisle-head">
              <div class="d-flex align-items-center gap-2">
                <span class="sw-aisle-icon" :class="`sw-aisle-icon--${aisle.tone}`">
                  <span class="material-symbols-outlined sw-ico-18">{{ aisle.icon }}</span>
                </span>
                <div>
                  <h2 class="sw-headline-sm">{{ aisle.title }}</h2>
                  <span class="sw-label-sm sw-text-variant">{{ aisle.sub }}</span>
                </div>
              </div>
              <span class="sw-pill">{{ aisle.items.length }} {{ aisle.items.length === 1 ? 'item' : 'items' }}</span>
            </div>

            <div class="sw-aisle-body">
              <label
                v-for="it in visibleItems(aisle)"
                :key="it.id"
                class="sw-row"
                :class="{ 'sw-row--stocked': it.inPantry, 'is-bought': it.checked }"
              >
                <div class="sw-row-main">
                  <input v-model="it.checked" type="checkbox" class="form-check-input sw-check" />
                  <div class="sw-row-text">
                    <div v-if="it.inPantry" class="d-flex align-items-center gap-1">
                      <span class="sw-item-name">{{ it.name }}</span>
                      <span class="sw-badge-stock">In Pantry</span>
                    </div>
                    <span v-else class="sw-item-name">{{ it.name }}</span>
                    <span class="sw-meta">{{ it.meta }}</span>
                  </div>
                </div>

                <div class="sw-tags">
                  <span
                    v-for="tag in it.tags"
                    :key="tag.label"
                    class="sw-pill"
                    :class="tag.variant && `sw-pill--${tag.variant}`"
                  >
                    <span v-if="tag.dot" class="sw-dot" :class="`sw-dot--${tag.dot}`"></span>
                    {{ tag.label }}
                  </span>
                </div>
              </label>
            </div>
          </section>

          <p v-if="visibleAisles.length === 0" class="sw-body-md sw-text-variant text-center py-4 m-0">
            Nothing to show with the current filters.
          </p>
        </div>
      </div>

      <!-- ---------- Right: route helper + waste avoidance ---------- -->
      <div class="col-12 col-lg-4">
        <div class="d-flex flex-column gap-4">
          <!-- Store route -->
          <section class="sw-card d-flex flex-column gap-3 p-4">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-1">
                <span class="material-symbols-outlined sw-ico-22 sw-text-primary">navigation</span>
                <h3 class="sw-headline-sm">Store Route Helper</h3>
              </div>
              <span class="sw-pill sw-pill--green">Optimized</span>
            </div>
            <p class="sw-body-sm sw-text-variant">
              Aisle sequence ordered by temperature sensitivity so chilled dairy and seafood stay cold longest.
            </p>

            <div class="sw-timeline">
              <div v-for="step in routeSteps" :key="step.label" class="sw-step">
                <span class="sw-step-dot" :class="step.dot && `sw-step-dot--${step.dot}`"></span>
                <div class="d-flex flex-column">
                  <span class="sw-label-md">{{ step.label }}</span>
                  <span class="sw-body-sm" :class="step.subTone === 'secondary' ? 'sw-text-secondary' : 'sw-text-outline'">
                    {{ step.sub }}
                  </span>
                </div>
              </div>
            </div>

            <div class="sw-trip">
              <span class="sw-label-sm d-flex align-items-center gap-1">
                <span class="material-symbols-outlined sw-ico-16 sw-text-primary">timer</span>
                Expected in-store trip
              </span>
              <span class="sw-label-md fw-semibold" style="color: var(--sw-on-surface)">18 – 22 mins</span>
            </div>
          </section>

          <!-- Pantry cross-check -->
          <section class="sw-card sw-card--low d-flex flex-column gap-3 p-4">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-1">
                <span class="material-symbols-outlined sw-ico-22 sw-text-primary">eco</span>
                <h3 class="sw-headline-sm">Pantry Cross-Check</h3>
              </div>
              <span class="sw-label-sm sw-text-secondary fw-semibold">$28.40 saved</span>
            </div>
            <p class="sw-body-sm sw-text-variant">
              By automatically re-routing shared ingredients across multiple meals, your kitchen avoided buying
              redundant containers:
            </p>

            <div class="d-flex flex-column gap-2">
              <div v-for="s in savings" :key="s.title" class="sw-saving">
                <div class="d-flex align-items-center gap-2 sw-saving-text">
                  <span class="material-symbols-outlined sw-ico-20 sw-text-primary flex-shrink-0">check_circle</span>
                  <div class="sw-saving-text">
                    <span class="sw-label-md text-truncate">{{ s.title }}</span>
                    <span class="sw-label-sm sw-text-outline">{{ s.sub }}</span>
                  </div>
                </div>
                <span class="sw-label-sm sw-text-primary fw-semibold flex-shrink-0">{{ s.badge }}</span>
              </div>
            </div>

            <div class="sw-tip">
              <span class="material-symbols-outlined sw-ico-18 sw-text-primary flex-shrink-0 mt-1">tips_and_updates</span>
              <p class="sw-label-sm sw-text-variant m-0">
                <strong>Chef’s Note:</strong> Freeze remaining lemon zest in parchment before squeezing for salad
                dressing to double kitchen aroma efficiency.
              </p>
            </div>
          </section>

          <!-- Featured meals -->
          <section class="sw-card d-flex flex-column gap-2 p-3">
            <span class="sw-eyebrow">Primary Featured Meals</span>
            <div class="row g-2">
              <div v-for="m in featuredMeals" :key="m.name" class="col-6">
                <div class="sw-thumb">
                  <img :src="m.src" :alt="m.alt" />
                  <div class="sw-thumb-caption">
                    <span class="sw-label-sm text-truncate">{{ m.name }}</span>
                  </div>
                </div>
              </div>
            </div>
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
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  color: var(--sw-on-surface);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 15px;
  line-height: 24px;
  -webkit-font-smoothing: antialiased;
}

/* ---------- Icons (Material Symbols) ---------- */
.material-symbols-outlined { line-height: 1; vertical-align: middle; user-select: none; }
.sw-ico-16 { font-size: 16px; }
.sw-ico-18 { font-size: 18px; }
.sw-ico-20 { font-size: 20px; }
.sw-ico-22 { font-size: 22px; }
.sw-spin { animation: sw-spin 1s linear infinite; }
@keyframes sw-spin { to { transform: rotate(360deg); } }

/* ---------- Typography scale ---------- */
.sw-headline-lg { font: 600 32px/40px 'Outfit', sans-serif; letter-spacing: -0.01em; margin: 0; }
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
  padding: 1.5rem;
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
.sw-pill--peach { background: rgba(255, 181, 156, 0.4); color: var(--sw-on-secondary-fixed); }
.sw-pill--high  { background: var(--sw-surface-high); }

.sw-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--sw-outline); }
.sw-dot--primary           { background: var(--sw-primary); }
.sw-dot--primary-container { background: var(--sw-primary-container); }
.sw-dot--secondary         { background: var(--sw-secondary); }
.sw-dot--tertiary          { background: var(--sw-tertiary); }

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
  --bs-btn-disabled-opacity: 1;
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
.form-check-input.sw-check--sm { width: 1rem; height: 1rem; border-radius: 0.25rem; }

/* ---------- Quick-add bar ---------- */
.sw-addbox { flex: 1; display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 1rem; background: var(--sw-surface-low); border-radius: var(--sw-radius); }
.sw-addbox:focus-within { box-shadow: 0 0 0 2px var(--sw-primary); }
.form-control.sw-bare-input { padding: 0; border: 0; background: transparent; box-shadow: none; color: var(--sw-on-surface); font: 400 13px/20px 'Inter', sans-serif; }
.sw-bare-input::placeholder { color: var(--sw-outline); opacity: 1; }

.form-select.sw-select {
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
.form-select.sw-select:focus { box-shadow: 0 0 0 2px var(--sw-primary); }

/* ---------- Aisle sections ---------- */
.sw-aisle { overflow: hidden; }
.sw-aisle-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 1rem 1.5rem; background: var(--sw-surface-low); }
.sw-aisle-icon { width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: var(--sw-radius); }
.sw-aisle-icon--green   { background: var(--sw-primary-fixed);   color: var(--sw-on-primary-fixed); }
.sw-aisle-icon--peach   { background: var(--sw-secondary-fixed); color: var(--sw-on-secondary-fixed); }
.sw-aisle-icon--amber   { background: var(--sw-tertiary-fixed);  color: var(--sw-on-tertiary-fixed); }
.sw-aisle-icon--neutral { background: var(--sw-surface-highest); color: var(--sw-on-surface-variant); }
.sw-aisle-body { display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem; }

/* ---------- Grocery rows ---------- */
.sw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: var(--sw-radius);
  cursor: pointer;
  transition: background-color 0.15s;
}
.sw-row:hover { background: rgba(244, 244, 237, 0.6); }
.sw-row:focus-within { outline: 2px solid rgba(50, 83, 60, 0.35); }
.sw-row--stocked { background: rgba(244, 244, 237, 0.4); }
.sw-row--stocked:hover { background: rgba(244, 244, 237, 0.7); }

.sw-row-main { display: flex; align-items: center; gap: 1rem; min-width: 0; }
.sw-row-text { display: flex; flex-direction: column; min-width: 0; }
.sw-row--stocked .sw-row-text { opacity: 0.6; }

.sw-item-name { font: 400 15px/24px 'Inter', sans-serif; color: var(--sw-on-surface); transition: opacity 0.15s; }
.sw-meta { font: 600 11px/14px 'Inter', sans-serif; letter-spacing: 0.03em; color: var(--sw-outline); }

.sw-row.is-bought .sw-item-name { text-decoration: line-through; opacity: 0.5; }
.sw-row--stocked.is-bought .sw-item-name { opacity: 1; }

.sw-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 0.25rem; flex-shrink: 0; }

/* ---------- Store route timeline ---------- */
.sw-timeline { position: relative; display: flex; flex-direction: column; gap: 1rem; margin-top: 0.25rem; padding-left: 1.5rem; }
.sw-timeline::before { content: ''; position: absolute; left: 6px; top: 0.5rem; bottom: 0.5rem; width: 2px; background: var(--sw-surface-highest); }
.sw-step { position: relative; display: flex; align-items: flex-start; gap: 0.5rem; }
.sw-step-dot { position: absolute; left: -1.5rem; top: 0.25rem; width: 14px; height: 14px; border-radius: 50%; background: var(--sw-surface-variant); box-shadow: 0 0 0 4px var(--sw-surface-lowest); }
.sw-step-dot--primary   { background: var(--sw-primary); }
.sw-step-dot--secondary { background: var(--sw-secondary); }

.sw-trip { margin-top: 0.25rem; padding: 0.5rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: var(--sw-surface-low); border-radius: var(--sw-radius); color: var(--sw-on-surface-variant); }

/* ---------- Pantry cross-check ---------- */
.sw-saving { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem; background: var(--sw-surface-lowest); border-radius: var(--sw-radius); }
.sw-saving-text { min-width: 0; }
.sw-saving-text .sw-label-md { display: block; }
.sw-tip { margin-top: 0.25rem; padding: 0.5rem; display: flex; align-items: flex-start; gap: 0.25rem; background: rgba(199, 236, 206, 0.3); border-radius: var(--sw-radius); }

/* ---------- Featured meal thumbnails ---------- */
.sw-eyebrow { font: 600 11px/16px 'Inter', sans-serif; letter-spacing: 0.05em; text-transform: uppercase; color: var(--sw-on-surface-variant); }
.sw-thumb { position: relative; overflow: hidden; border-radius: var(--sw-radius); }
.sw-thumb img { display: block; width: 100%; height: 6rem; object-fit: cover; transition: transform 0.3s; }
.sw-thumb:hover img { transform: scale(1.05); }
.sw-thumb-caption { position: absolute; inset: 0; display: flex; align-items: flex-end; padding: 0.25rem 0.5rem; background: linear-gradient(to top, rgba(26, 28, 24, 0.8), transparent 60%); color: #fff; }

@media (prefers-reduced-motion: reduce) {
  .sw-spin { animation: none; }
  .sw-ring-bar, .sw-thumb img, .sw-row, .sw-btn { transition: none; }
}
</style>
