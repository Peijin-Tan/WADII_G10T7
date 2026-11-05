<!--
  ShoppingModeModal.vue
  "Start shopping" modal for the shopping list, used in the supermarket:
    1. "To buy": tap an item when you find it -> it moves to "In basket"
    2. "In basket": details start filled in from the list; edit what's different
       (e.g. a 2 kg bag of rice, a use-by date), or switch off "Add to pantry" for non-food
    3. "Add to pantry": review, then everything in the basket goes into the pantry

  Same pattern as the planner's modals: the parent page (ShoppingList.vue) owns the
  API calls and passes the list in as props; this component only shows it and emits.

  Props:  items, sections, saving, adding, error, notice
  Events: toggle(item)                 -> parent ticks / unticks it (PATCH /shoppinglist/items/:id)
          save-basket({ item, basket }) -> parent saves the details (PATCH /shoppinglist/items/:id/basket)
          add-to-pantry                -> parent calls POST /shoppinglist/add-to-pantry
          close
-->
<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { PANTRY_UNITS, PANTRY_CATEGORIES, LIST_TO_PANTRY_UNIT, formatQty } from '@/constants/pantry'

const props = defineProps({
  items: { type: Array, default: () => [] },
  sections: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  adding: { type: Boolean, default: false },
  error: { type: String, default: '' },
  notice: { type: String, default: '' },
})
const emit = defineEmits(['toggle', 'save-basket', 'add-to-pantry', 'close'])

/* ---------- Options: shared with the Pantry page (constants/pantry.js, must match models/Pantry.js) ---------- */
const UNITS = PANTRY_UNITS
const CATEGORIES = PANTRY_CATEGORIES

/* ---------- Formatting ---------- */
function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}
function toInputDate(value) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const buyText = (it) =>
  [{ quantity: it.quantity, unit: it.unit }, ...(it.alsoNeed || [])]
    .filter((a) => a.quantity > 0)
    .map((a) => formatQty(a.quantity, a.unit))
    .join(' + ')
const recipesOf = (it) => (it.usedIn || []).map((u) => u.title).filter(Boolean)

/* ---------- Basket details ---------- */
const PANTRY_UNIT = LIST_TO_PANTRY_UNIT
const PANTRY_CATEGORY = {
  produce: 'produce', 'dairy-eggs': 'dairy', 'grains-noodles': 'grains', 'canned-sauces': 'canned',
  'spices-condiments': 'condiments', frozen: 'frozen', 'meat-seafood': 'meat', other: 'other',
}
const SEAFOOD_WORDS = ['fish', 'prawn', 'shrimp', 'salmon', 'tuna', 'squid', 'crab', 'clam', 'mussel', 'scallop', 'cod', 'anchovy']
const isSeafood = (name) => String(name).toLowerCase().split(/[^a-z]+/).some((w) => SEAFOOD_WORDS.includes(w.replace(/s$/, '')))
function basketOf(it) {
  if (it.basket) return it.basket
  const unit = PANTRY_UNIT[it.unit]
  return {
    name: it.name,
    quantity: it.quantity > 0 ? it.quantity : 1,
    unit: unit || 'pcs',
    category: it.category === 'meat-seafood' && isSeafood(it.name) ? 'seafood' : PANTRY_CATEGORY[it.category] || 'other',
    expiryDate: null,
    addToPantry: Boolean(unit) && it.quantity > 0,
  }
}

/* ---------- Lists ---------- */
const toBuy = computed(() => props.items.filter((it) => !it.purchased && it.quantity > 0))
const inBasket = computed(() => props.items.filter((it) => it.purchased))

const toBuySections = computed(() =>
  props.sections
    .map((s) => ({ ...s, items: toBuy.value.filter((it) => (it.category || 'other') === s.id) }))
    .filter((s) => s.items.length > 0),
)

const goesToPantry = (it) => !it.addedToPantry && basketOf(it).addToPantry !== false
const readyItems = computed(() => inBasket.value.filter(goesToPantry))

const basketActive = computed(() => inBasket.value.filter((it) => !it.addedToPantry))
const addedCount = computed(() => inBasket.value.length - basketActive.value.length)

const basketSections = computed(() =>
  props.sections
    .map((s) => ({ ...s, items: basketActive.value.filter((it) => (it.category || 'other') === s.id) }))
    .filter((s) => s.items.length > 0),
)
const notForPantry = computed(() => inBasket.value.filter((it) => !it.addedToPantry && !goesToPantry(it)))

const totalToShop = computed(() => toBuy.value.length + inBasket.value.length)
const percent = computed(() =>
  totalToShop.value ? Math.round((inBasket.value.length / totalToShop.value) * 100) : 0,
)

/* ---------- Tabs (phones show one list at a time; desktop shows both) ---------- */
const tab = ref('buy')
const view = ref('shop')

/* ---------- Moving items ---------- */
const justMoved = ref(null)
let movedTimer = null

function putInBasket(it) {
  emit('toggle', it)
  justMoved.value = it._id
  clearTimeout(movedTimer)
  movedTimer = setTimeout(() => { justMoved.value = null }, 1500)
}
function backToList(it) {
  if (editingId.value === it._id) editingId.value = null
  emit('toggle', it)
}

/* ---------- Editing basket details ---------- */
const editingId = ref(null)
const draft = ref(null)

function startEdit(it) {
  const b = basketOf(it)
  editingId.value = it._id
  draft.value = {
    name: b.name,
    quantity: b.quantity,
    unit: b.unit,
    category: b.category,
    expiryDate: toInputDate(b.expiryDate),
    addToPantry: b.addToPantry !== false,
  }
}
function cancelEdit() {
  editingId.value = null
  draft.value = null
}
function saveEdit(it) {
  emit('save-basket', { item: it, basket: { ...draft.value, name: draft.value.name.trim() } })
  cancelEdit()
}
function togglePantry(it) {
  const b = basketOf(it)
  emit('save-basket', { item: it, basket: { ...b, expiryDate: toInputDate(b.expiryDate), addToPantry: !goesToPantry(it) } })
}

function saveField(it, field, value) {
  const b = basketOf(it)
  if (b[field] === value) return
  emit('save-basket', { item: it, basket: { ...b, expiryDate: toInputDate(b.expiryDate), [field]: value } })
}
function onQtyChange(it, e) {
  const value = Number(e.target.value)
  if (!(value > 0)) {
    e.target.value = basketOf(it).quantity
    return
  }
  saveField(it, 'quantity', Math.round(value * 1000) / 1000)
}

function basketSummary(it) {
  const b = basketOf(it)
  const parts = [formatQty(b.quantity, b.unit)]
  if (b.expiryDate) parts.push(`use by ${formatDate(b.expiryDate)}`)
  return parts.join(' · ')
}

/* ---------- Finish ---------- */
function confirmAdd() {
  emit('add-to-pantry')
  view.value = 'shop'
}

/* ---------- Modal behaviour ---------- */
function onKey(e) {
  if (e.key !== 'Escape') return
  if (editingId.value) cancelEdit()
  else if (view.value === 'review') view.value = 'shop'
  else emit('close')
}
onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearTimeout(movedTimer)
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div class="sm-backdrop" @click.self="emit('close')">
      <div class="sm-modal" role="dialog" aria-modal="true" aria-labelledby="sm-title" data-testid="shopping-mode">
        <!-- Header: progress -->
        <header class="sm-head">
          <div class="d-flex align-items-center justify-content-between gap-2">
            <div class="d-flex align-items-center gap-2 min-w-0">
              <span class="sm-head-icon"><span class="material-symbols-outlined">shopping_cart</span></span>
              <div class="min-w-0">
                <h2 id="sm-title" class="sm-title">Shopping mode</h2>
                <p class="sm-sub tabular-nums">{{ inBasket.length }} of {{ totalToShop }} in your basket</p>
              </div>
            </div>
            <button type="button" class="sm-iconbtn" aria-label="Close shopping mode" @click="emit('close')">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="sm-progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ transform: `scaleX(${percent / 100})` }"></span>
          </div>

          <!-- Phones: one list at a time -->
          <div v-if="view === 'shop'" class="sm-tabs d-lg-none" role="tablist">
            <button type="button" role="tab" :aria-selected="tab === 'buy'" :class="{ active: tab === 'buy' }"
              data-testid="sm-tab-buy" @click="tab = 'buy'">
              To buy <span class="sm-count">{{ toBuy.length }}</span>
            </button>
            <button type="button" role="tab" :aria-selected="tab === 'basket'" :class="{ active: tab === 'basket' }"
              data-testid="sm-tab-basket" @click="tab = 'basket'">
              In basket <span class="sm-count">{{ basketActive.length }}</span>
            </button>
          </div>
        </header>

        <div v-if="error" class="sm-alert sm-alert--error" role="alert">
          <span class="material-symbols-outlined">error</span>{{ error }}
        </div>
        <div v-else-if="notice" class="sm-alert sm-alert--ok" role="status">
          <span class="material-symbols-outlined">check_circle</span>{{ notice }}
        </div>

        <!-- ================= Shopping ================= -->
        <div v-if="view === 'shop'" class="sm-body">
          <!-- To buy -->
          <section class="sm-col" :class="{ 'sm-col--hidden': tab !== 'buy' }" aria-labelledby="sm-buy-title">
            <h3 id="sm-buy-title" class="sm-col-title d-none d-lg-flex">
              To buy <span class="sm-count">{{ toBuy.length }}</span>
            </h3>
            <p class="sm-hint">Tap an item when it's in your trolley.</p>

            <div v-if="toBuy.length === 0" class="sm-empty">
              <span class="material-symbols-outlined">task_alt</span>
              <p>Everything's in your basket.</p>
              <button v-if="readyItems.length" type="button" class="sm-btn sm-btn--soft d-lg-none" @click="tab = 'basket'">
                Check your basket
              </button>
            </div>

            <div v-for="s in toBuySections" :key="s.id" class="sm-aisle">
              <h4 class="sm-aisle-title"><span class="material-symbols-outlined">{{ s.icon }}</span>{{ s.title }}</h4>
              <button v-for="it in s.items" :key="it._id" type="button" class="sm-buy-row"
                :aria-label="`Put ${it.name} in basket`" data-testid="sm-buy-item" @click="putInBasket(it)">
                <span class="sm-tick" aria-hidden="true"></span>
                <span class="sm-buy-text">
                  <span class="sm-name">{{ it.name }}</span>
                  <span v-if="recipesOf(it).length" class="sm-note">for {{ recipesOf(it).slice(0, 2).join(', ') }}</span>
                </span>
                <span class="sm-qty">{{ buyText(it) }}</span>
              </button>
            </div>
          </section>

          <!-- In basket -->
          <section class="sm-col sm-col--basket" :class="{ 'sm-col--hidden': tab !== 'basket' }"
            aria-labelledby="sm-basket-title">
            <h3 id="sm-basket-title" class="sm-col-title d-none d-lg-flex">
              In basket <span class="sm-count">{{ basketActive.length }}</span>
            </h3>
            <p class="sm-hint">Change the amount to what you actually bought. <strong>Edit</strong> for the name or a use-by date.</p>

            <div v-if="basketActive.length === 0" class="sm-empty">
              <span class="material-symbols-outlined">shopping_basket</span>
              <p v-if="addedCount">Everything you've bought so far is in your pantry.</p>
              <p v-else>Your basket is empty. Tap items in "To buy" as you find them.</p>
            </div>

            <!-- Grouped by aisle, the same way as "To buy" -->
            <div v-for="s in basketSections" :key="s.id" class="sm-aisle">
              <h4 class="sm-aisle-title"><span class="material-symbols-outlined">{{ s.icon }}</span>{{ s.title }}</h4>
            <div v-for="it in s.items" :key="it._id" class="sm-basket-row"
              :class="{ 'is-new': justMoved === it._id, 'is-locked': it.addedToPantry, 'is-off': !it.addedToPantry && !goesToPantry(it) }"
              data-testid="sm-basket-item">
              <!-- Editing -->
              <form v-if="editingId === it._id" class="sm-form" data-testid="sm-basket-form" @submit.prevent="saveEdit(it)">
                <label class="sm-field sm-field--full">
                  <span>Name in your pantry</span>
                  <input v-model="draft.name" type="text" maxlength="60" required placeholder="e.g. Jasmine rice" />
                </label>
                <label class="sm-field">
                  <span>Amount</span>
                  <!-- selects the old amount on tap, so typing replaces it (clearing a number field on a phone is fiddly) -->
                  <input v-model.number="draft.quantity" type="number" min="0.01" step="any" required inputmode="decimal"
                    @focus="$event.target.select()" />
                </label>
                <label class="sm-field">
                  <span>Unit</span>
                  <select v-model="draft.unit">
                    <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                  </select>
                </label>
                <label class="sm-field">
                  <span>Category</span>
                  <select v-model="draft.category">
                    <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
                  </select>
                </label>
                <label class="sm-field">
                  <span>Use by <em>(optional)</em></span>
                  <input v-model="draft.expiryDate" type="date" />
                </label>
                <label class="sm-switch sm-field--full">
                  <input v-model="draft.addToPantry" type="checkbox" />
                  <span>Add to my pantry <em>(turn off for things like dish soap)</em></span>
                </label>
                <div class="sm-form-actions sm-field--full">
                  <button type="button" class="sm-btn sm-btn--ghost" @click="cancelEdit">Cancel</button>
                  <button type="submit" class="sm-btn sm-btn--primary" :disabled="saving">Save</button>
                </div>
              </form>

              <!-- Summary row:
                   [tick] name                               [undo]
                          [amount][unit v]  use-by    [pantry][Edit] -->
              <template v-else>
                <div class="sm-basket-top">
                  <span class="sm-tick sm-tick--done" aria-hidden="true">
                    <span class="material-symbols-outlined">check</span>
                  </span>
                  <div class="sm-buy-text">
                    <span class="sm-name">{{ basketOf(it).name }}</span>
                    <span class="sm-note">
                      <template v-if="it.addedToPantry">In your pantry</template>
                      <template v-else-if="!goesToPantry(it)">Not going to pantry</template>
                      <template v-else>
                        List said {{ buyText(it) }}<template v-if="basketOf(it).expiryDate"> ·
                          <span class="sm-useby">use by {{ formatDate(basketOf(it).expiryDate) }}</span></template>
                      </template>
                    </span>
                  </div>
                  <button v-if="!it.addedToPantry" type="button" class="sm-iconbtn sm-iconbtn--sm sm-undo"
                    title="Not bought after all" :aria-label="`Move ${it.name} back to To buy`" data-testid="sm-undo"
                    @click="backToList(it)">
                    <span class="material-symbols-outlined">undo</span>
                  </button>
                  <span v-else class="material-symbols-outlined sm-locked" title="Already in your pantry">lock</span>
                </div>

                <div v-if="!it.addedToPantry" class="sm-basket-controls">
                  <!-- What was actually bought: saved when you leave the field (or pick a unit) -->
                  <div v-if="goesToPantry(it)" class="sm-amount">
                    <input type="number" class="sm-amount-qty" min="0.01" step="any" inputmode="decimal"
                      :value="basketOf(it).quantity" :disabled="saving" :aria-label="`Amount of ${it.name} bought`"
                      data-testid="sm-qty" @focus="$event.target.select()" @change="onQtyChange(it, $event)" />
                    <select class="sm-amount-unit" :value="basketOf(it).unit" :disabled="saving"
                      :aria-label="`Unit for ${it.name}`" data-testid="sm-unit"
                      @change="saveField(it, 'unit', $event.target.value)">
                      <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                    </select>
                  </div>
                  <div class="sm-row-actions">
                    <button type="button" class="sm-iconbtn sm-iconbtn--sm"
                      :class="{ 'is-on': goesToPantry(it) }"
                      :title="goesToPantry(it) ? 'Don\'t add to pantry' : 'Add to pantry'"
                      :aria-label="goesToPantry(it) ? `Don't add ${it.name} to pantry` : `Add ${it.name} to pantry`"
                      :aria-pressed="goesToPantry(it)" :disabled="saving" @click="togglePantry(it)">
                      <span class="material-symbols-outlined">{{ goesToPantry(it) ? 'kitchen' : 'block' }}</span>
                    </button>
                    <button type="button" class="sm-btn sm-btn--soft sm-btn--sm" :disabled="saving"
                      title="Name, category and use-by date" data-testid="sm-edit" @click="startEdit(it)">Edit</button>
                  </div>
                </div>
              </template>
            </div>
            </div>

            <!-- Items already moved to the pantry are done: one line instead of a row each -->
            <p v-if="addedCount" class="sm-added-note" data-testid="sm-added-note">
              <span class="material-symbols-outlined">check_circle</span>
              {{ addedCount }} {{ addedCount === 1 ? 'item' : 'items' }} already added to your pantry
            </p>
          </section>
        </div>

        <!-- ================= Review before adding ================= -->
        <div v-else class="sm-body sm-body--review" data-testid="sm-review">
          <section class="sm-col">
            <h3 class="sm-col-title">Add {{ readyItems.length }} {{ readyItems.length === 1 ? 'item' : 'items' }} to your pantry?</h3>
            <p class="sm-hint">If you already have one of these, the amount is added to it.</p>
            <ul class="sm-review-list">
              <li v-for="it in readyItems" :key="it._id">
                <span class="material-symbols-outlined">kitchen</span>
                <span class="sm-name">{{ basketOf(it).name }}</span>
                <span class="sm-qty">{{ basketSummary(it) }}</span>
              </li>
            </ul>
            <template v-if="notForPantry.length">
              <h4 class="sm-aisle-title mt-3">Staying out of the pantry</h4>
              <p class="sm-note m-0">{{ notForPantry.map((it) => basketOf(it).name).join(', ') }}</p>
            </template>
          </section>
        </div>

        <!-- Footer -->
        <footer class="sm-foot">
          <template v-if="view === 'shop'">
            <button type="button" class="sm-btn sm-btn--ghost" @click="emit('close')">Close</button>
            <button type="button" class="sm-btn sm-btn--primary" :disabled="readyItems.length === 0 || adding"
              data-testid="sm-finish" @click="view = 'review'">
              <span class="material-symbols-outlined">kitchen</span>
              {{ readyItems.length ? `Add ${readyItems.length} to pantry` : 'Add to pantry' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="sm-btn sm-btn--ghost" @click="view = 'shop'">Back</button>
            <button type="button" class="sm-btn sm-btn--primary" :disabled="adding" data-testid="sm-confirm"
              @click="confirmAdd">
              <span class="material-symbols-outlined">check</span>{{ adding ? 'Adding…' : 'Confirm & add' }}
            </button>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sm-backdrop {
  --sm-bg: #fafaf3;
  --sm-surface: #ffffff;
  --sm-low: #f4f4ed;
  --sm-high: #e8e9e2;
  --sm-text: #1a1c18;
  --sm-muted: #424842;
  --sm-outline: #727972;
  --sm-border: rgba(194, 200, 192, 0.6);
  --sm-primary: #32533c;
  --sm-primary-hover: #4a6b53;
  --sm-primary-soft: #c7ecce;
  --sm-peach: #ffdbcf;
  --sm-accent: #a23e18;

  position: fixed;
  inset: 0;
  z-index: 1060;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 28, 24, 0.45);
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--sm-text);
  animation: sm-fade 0.15s ease-out;
}
@keyframes sm-fade { from { opacity: 0; } to { opacity: 1; } }

.sm-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--sm-bg);
  overflow: hidden;
}
@media (min-width: 992px) {
  .sm-modal {
    width: min(960px, calc(100vw - 48px));
    height: min(760px, calc(100vh - 48px));
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  }
}

.min-w-0 { min-width: 0; }
.material-symbols-outlined { font-size: 20px; line-height: 1; vertical-align: middle; }

/* ---------- Header ---------- */.sm-head {
  padding: 16px 16px 0;
  background: var(--sm-low);
  border-bottom: 1px solid var(--sm-border);
}
@media (min-width: 992px) { .sm-head { padding: 20px 24px 16px; } }
.sm-head-icon {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: var(--sm-primary-soft); color: var(--sm-primary);
}
.sm-title { font: 600 20px/26px 'Outfit', sans-serif; margin: 0; }
.sm-sub { font-size: 13px; color: var(--sm-muted); margin: 0; }
.sm-progress { height: 6px; border-radius: 9999px; background: var(--sm-high); overflow: hidden; margin: 12px 0; }
.sm-progress span { display: block; height: 100%; background: var(--sm-primary); transition: width 0.3s ease; }

.sm-tabs { display: flex; gap: 4px; }
.sm-tabs button {
  flex: 1; border: 0; background: transparent; padding: 10px 8px 12px;
  font: 600 14px/20px 'Inter', sans-serif; color: var(--sm-muted);
  border-bottom: 3px solid transparent;
}
.sm-tabs button.active { color: var(--sm-primary); border-bottom-color: var(--sm-primary); }
.sm-count {
  display: inline-block; min-width: 22px; padding: 0 6px; margin-left: 4px;
  border-radius: 9999px; background: var(--sm-high); color: var(--sm-text);
  font: 600 12px/20px 'Inter', sans-serif; text-align: center;
}

.sm-alert { display: flex; align-items: center; gap: 8px; margin: 12px 16px 0; padding: 10px 12px; border-radius: 10px; font-size: 14px; }
.sm-alert--error { background: #ffdad6; color: #93000a; }
.sm-alert--ok { background: var(--sm-primary-soft); color: #01210f; }

/* ---------- Body: one column on phones (tabs), two on desktop ---------- */.sm-body { flex: 1; overflow-y: auto; display: grid; grid-template-columns: 1fr; }
@media (min-width: 992px) {
  .sm-body { grid-template-columns: 1fr 1fr; }
  .sm-body--review { grid-template-columns: 1fr; }
  .sm-col--basket { border-left: 1px solid var(--sm-border); background: var(--sm-surface); }
}
.sm-col { padding: 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sm-col > * { flex-shrink: 0; }
@media (min-width: 992px) { .sm-col { padding: 20px 24px; overflow-y: auto; } }
@media (max-width: 991.98px) { .sm-col--hidden { display: none; } }
.sm-col-title { align-items: center; gap: 4px; font: 600 16px/22px 'Outfit', sans-serif; margin: 0; }
.sm-hint { font-size: 13px; color: var(--sm-outline); margin: 0 0 4px; }

.sm-aisle { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.sm-aisle-title {
  display: flex; align-items: center; gap: 6px; margin: 0;
  font: 600 11px/14px 'Inter', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sm-outline);
}
.sm-aisle-title .material-symbols-outlined { font-size: 16px; }

/* ---------- Rows: big tap targets for one-handed use in an aisle ---------- */.sm-buy-row, .sm-basket-row {
  display: flex; align-items: center; gap: 12px; width: 100%;
  min-height: 60px; padding: 10px 12px;
  border: 1px solid var(--sm-border); border-radius: 12px;
  background: var(--sm-surface); text-align: left; color: var(--sm-text);
}
.sm-buy-row { cursor: pointer; transition: background-color 0.15s, border-color 0.15s, transform 0.1s; }
.sm-buy-row:hover { border-color: var(--sm-primary); }
.sm-buy-row:active { transform: scale(0.99); background: var(--sm-low); }
.sm-buy-row:focus-visible, .sm-btn:focus-visible, .sm-iconbtn:focus-visible { outline: 2px solid var(--sm-primary); outline-offset: 2px; }

.sm-basket-row { flex-direction: column; align-items: stretch; gap: 8px; }
.sm-basket-top { display: flex; align-items: flex-start; gap: 12px; }
.sm-basket-top .sm-tick { margin-top: 1px; }
.sm-undo { margin: -6px -6px 0 0; }
.sm-locked { margin-top: 2px; }

.sm-basket-controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 38px; }
.sm-amount { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.sm-amount-qty, .sm-amount-unit {
  height: 38px; border: 1.5px solid var(--sm-border); border-radius: 10px;
  background: var(--sm-surface); color: var(--sm-text);
  font: 600 15px/20px 'Inter', sans-serif;
}
.sm-amount-qty { width: 76px; }
.sm-amount-unit { width: 78px; padding: 0 8px; cursor: pointer; }
.sm-amount-qty:hover, .sm-amount-unit:hover { border-color: var(--sm-outline); }
.sm-amount-qty:focus, .sm-amount-unit:focus { outline: none; border-color: var(--sm-primary); box-shadow: 0 0 0 3px var(--sm-primary-soft); }
.sm-useby { color: var(--sm-primary); font-weight: 600; }
.sm-basket-controls .sm-row-actions { margin-left: auto; }.sm-amount-qty { -moz-appearance: textfield; appearance: textfield; text-align: center; padding: 0 8px; }
.sm-amount-qty::-webkit-outer-spin-button, .sm-amount-qty::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.sm-iconbtn.is-on { color: var(--sm-primary); }
.sm-added-note {
  display: flex; align-items: center; gap: 6px; margin: 12px 0 0; padding: 10px 12px;
  border-radius: 10px; background: var(--sm-low); color: var(--sm-muted); font-size: 13px;
}
.sm-added-note .material-symbols-outlined { font-size: 18px; color: var(--sm-primary); }
.sm-basket-row.is-new { border-color: var(--sm-primary); box-shadow: 0 0 0 3px var(--sm-primary-soft); }
.sm-basket-row.is-off { background: var(--sm-low); }
.sm-basket-row.is-off .sm-name, .sm-basket-row.is-locked .sm-name { color: var(--sm-muted); }

.sm-tick {
  width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%;
  border: 2px solid var(--sm-outline);
  display: flex; align-items: center; justify-content: center;
}
.sm-tick--done { border-color: var(--sm-primary); background: var(--sm-primary); color: #fff; }
.sm-tick--done .material-symbols-outlined { font-size: 16px; }

.sm-buy-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.sm-name { font: 500 15px/20px 'Inter', sans-serif; overflow-wrap: anywhere; }
.sm-note { font-size: 12px; line-height: 16px; color: var(--sm-outline); }
.sm-qty { flex-shrink: 0; font: 600 14px/20px 'Inter', sans-serif; white-space: nowrap; }
.sm-row-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sm-locked { color: var(--sm-outline); }

.sm-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 32px 8px; text-align: center; color: var(--sm-muted); font-size: 14px; }
.sm-empty .material-symbols-outlined { font-size: 36px; color: var(--sm-outline); }
.sm-empty p { margin: 0; }

/* ---------- Details form ---------- */.sm-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
.sm-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--sm-muted); }
.sm-field em, .sm-switch em { font-style: normal; font-weight: 400; color: var(--sm-outline); }
.sm-field--full { grid-column: 1 / -1; }
.sm-field input, .sm-field select {
  width: 100%; padding: 10px 12px; border: 1px solid var(--sm-border); border-radius: 10px;
  background: var(--sm-low); font: 400 15px/20px 'Inter', sans-serif; color: var(--sm-text);
}
.sm-field input:focus, .sm-field select:focus { outline: none; border-color: var(--sm-primary); box-shadow: 0 0 0 2px var(--sm-primary-soft); }
.sm-switch { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
.sm-switch input { width: 18px; height: 18px; accent-color: var(--sm-primary); }
.sm-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* ---------- Review ---------- */.sm-review-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.sm-review-list li {
  display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px;
  background: var(--sm-surface); border: 1px solid var(--sm-border);
}
.sm-review-list li .sm-name { flex: 1; }
.sm-review-list .material-symbols-outlined { color: var(--sm-primary); }

/* ---------- Footer + buttons ---------- */.sm-foot {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--sm-border); background: var(--sm-surface);
}
@media (min-width: 992px) { .sm-foot { padding: 14px 24px; } }
.sm-foot .sm-btn--primary { flex: 1; max-width: 320px; margin-left: auto; }

.sm-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 0; border-radius: 12px; padding: 12px 18px;
  font: 600 15px/20px 'Inter', sans-serif; cursor: pointer;
  transition: background-color 0.15s;
}
.sm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sm-btn--sm { padding: 6px 12px; font-size: 13px; border-radius: 9999px; }
.sm-btn--primary { background: var(--sm-primary); color: #fff; }
.sm-btn--primary:hover:not(:disabled) { background: var(--sm-primary-hover); }
.sm-btn--soft { background: var(--sm-high); color: var(--sm-text); }
.sm-btn--soft:hover:not(:disabled) { background: #dfe0d9; }
.sm-btn--ghost { background: transparent; color: var(--sm-muted); }
.sm-btn--ghost:hover { background: var(--sm-low); }

.sm-iconbtn {
  width: 40px; height: 40px; border: 0; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--sm-muted); cursor: pointer;
}
.sm-iconbtn:hover:not(:disabled) { background: var(--sm-high); color: var(--sm-text); }
.sm-iconbtn:disabled { opacity: 0.4; }
.sm-iconbtn--sm { width: 36px; height: 36px; }

@media (prefers-reduced-motion: reduce) {
  .sm-backdrop, .sm-progress span, .sm-buy-row { animation: none; transition: none; }
}
</style>
