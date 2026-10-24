<!--
  AddMealModal.vue
  Adds a recipe (or a custom meal) to a day + meal slot in the weekly planner
  (converted from Tailwind to Bootstrap 5 + scoped CSS).

  Usage (in MealPlanView.vue):
    <AddMealModal
      v-if="addTarget"
      :default-date="addTarget.date"
      :default-slot="addTarget.mealSlot"
      :recipes="allRecipes"
      @close="addTarget = null"
      @add="addMealToPlan"
    />
-->
<template>
  <Teleport to="body">
    <div
      class="fft-backdrop d-flex justify-content-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-add-title"
      @click.self="close"
    >
      <div class="fft-modal card border-0 shadow-lg w-100 my-auto">
        <!-- Header -->
        <div class="fft-modal-header d-flex align-items-center justify-content-between px-4 py-3">
          <div>
            <span class="fft-overline text-fft-primary">Planner • Add to Schedule</span>
            <h2 id="modal-add-title" class="fft-title mb-0 mt-1">Add Meal</h2>
          </div>
          <button type="button" class="fft-icon-btn" title="Close" aria-label="Close" @click="close">
            <span class="material-symbols-outlined fs-20">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="fft-modal-body p-4 d-flex flex-column gap-3">
          <!-- Day -->
          <div class="d-flex flex-column gap-1">
            <label for="add-meal-day" class="fft-label">Day</label>
            <div class="position-relative">
              <span class="material-symbols-outlined fft-input-icon text-fft-primary">calendar_today</span>
              <select id="add-meal-day" v-model="selectedDate" class="form-select fft-input fft-select">
                <option v-for="d in weekDays" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </div>
          </div>

          <!-- Meal slot -->
          <div class="d-flex flex-column gap-1">
            <span class="fft-label" id="slot-label">Meal Slot</span>
            <div class="row row-cols-2 row-cols-sm-4 g-2" role="group" aria-labelledby="slot-label">
              <div v-for="slot in slots" :key="slot" class="col">
                <button
                  type="button"
                  class="fft-slot w-100"
                  :class="{ 'fft-slot--active': selectedSlot === slot }"
                  :aria-pressed="selectedSlot === slot"
                  @click="selectedSlot = slot"
                >{{ slot }}</button>
              </div>
            </div>
          </div>

          <!-- Search -->
          <div class="d-flex flex-column gap-1">
            <label for="add-meal-search" class="fft-label">Search Recipe or Food</label>
            <div class="position-relative">
              <span class="material-symbols-outlined fft-input-icon">search</span>
              <input
                id="add-meal-search"
                v-model.trim="query"
                type="search"
                class="form-control fft-input"
                placeholder="Search recipes or ingredients..."
              />
            </div>

            <div class="d-flex flex-column gap-2 pt-2">
              <span class="fft-overline">{{ query ? `Results (${suggestions.length})` : 'Quick Suggestions' }}</span>

              <button
                v-for="r in suggestions"
                :key="r.id"
                type="button"
                class="fft-suggestion d-flex align-items-center justify-content-between gap-2 p-2 text-start"
                :class="{ 'fft-suggestion--active': selectedRecipe && selectedRecipe.id === r.id }"
                @click="selectRecipe(r)"
              >
                <div class="d-flex align-items-center gap-3 min-w-0">
                  <span class="fft-suggestion-icon flex-shrink-0">
                    <span class="material-symbols-outlined fs-16">{{ r.icon || 'restaurant' }}</span>
                  </span>
                  <div class="d-flex flex-column min-w-0">
                    <span class="small fw-semibold text-truncate">{{ r.title }}</span>
                    <span class="fft-meta">
                      {{ r.nutrition.calories }} kcal · {{ r.nutrition.protein }}g Protein · {{ r.prepMinutes }}m prep
                    </span>
                  </div>
                </div>
                <span class="material-symbols-outlined fs-18 fft-suggestion-check">
                  {{ selectedRecipe && selectedRecipe.id === r.id ? 'check_circle' : 'add_circle' }}
                </span>
              </button>

              <div v-if="suggestions.length === 0" class="fft-empty text-center py-3">
                No recipes found. Try another search, or add a custom meal below.
              </div>
            </div>
          </div>

          <!-- Servings -->
          <div class="d-flex align-items-center justify-content-between gap-3 py-1">
            <div class="d-flex flex-column">
              <span class="fft-label">Servings</span>
              <span class="fft-meta">Scales ingredient &amp; macro totals</span>
            </div>
            <div class="fft-stepper d-flex align-items-center gap-2 p-1">
              <button
                type="button"
                class="fft-stepper-btn"
                aria-label="Decrease servings"
                :disabled="servings <= 1"
                @click="servings--"
              >
                <span class="material-symbols-outlined fs-16">remove</span>
              </button>
              <span class="small fw-semibold px-2 text-nowrap" aria-live="polite">
                {{ servings }} {{ servings === 1 ? 'serving' : 'servings' }}
              </span>
              <button
                type="button"
                class="fft-stepper-btn"
                aria-label="Increase servings"
                :disabled="servings >= 12"
                @click="servings++"
              >
                <span class="material-symbols-outlined fs-16">add</span>
              </button>
            </div>
          </div>

          <!-- Custom meal -->
          <div class="fft-custom pt-2 d-flex flex-column gap-2">
            <button
              type="button"
              class="fft-custom-toggle d-flex align-items-center justify-content-between py-1"
              :aria-expanded="showCustom"
              aria-controls="custom-meal-fields"
              @click="showCustom = !showCustom"
            >
              <span class="d-flex align-items-center gap-2">
                <span class="material-symbols-outlined text-fft-primary fs-18">edit_note</span>
                <span class="fft-label">Can't find it? Add custom meal</span>
              </span>
              <span class="material-symbols-outlined fft-outline fs-18">
                {{ showCustom ? 'expand_less' : 'expand_more' }}
              </span>
            </button>

            <div v-show="showCustom" id="custom-meal-fields" class="d-flex flex-column gap-2 pt-1">
              <input
                v-model.trim="custom.title"
                type="text"
                class="form-control fft-input fft-input--plain"
                placeholder="e.g., Homemade Protein Smoothie Bowl"
                aria-label="Custom meal name"
                @input="onCustomInput"
              />
              <div class="row row-cols-2 row-cols-sm-4 g-2">
                <div v-for="m in macroFields" :key="m.key" class="col d-flex flex-column gap-1">
                  <label :for="`custom-${m.key}`" class="fft-meta">{{ m.label }}</label>
                  <input
                    :id="`custom-${m.key}`"
                    v-model.number="custom[m.key]"
                    type="number"
                    min="0"
                    class="form-control fft-input fft-input--small text-center"
                    :placeholder="m.placeholder"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="fft-modal-footer px-4 py-3 d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
          <router-link to="/recipes" class="fft-link small fw-semibold d-flex align-items-center gap-1">
            <span class="material-symbols-outlined fs-16">menu_book</span>
            Browse all recipes →
          </router-link>
          <div class="d-flex align-items-center gap-2 ms-sm-auto">
            <button type="button" class="btn fft-btn-secondary" @click="close">Cancel</button>
            <button
              type="button"
              class="btn fft-btn-primary d-flex align-items-center gap-1"
              :disabled="!canSubmit"
              @click="submit"
            >
              <span class="material-symbols-outlined fs-16">add</span>
              Add to plan
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// Format a Date as YYYY-MM-DD in local time (avoids UTC off-by-one in Singapore)
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday of the week containing `date`
function mondayOf(date) {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default {
  name: 'AddMealModal',

  props: {
    // 'YYYY-MM-DD' of the day the user clicked "Add Meal" on (defaults to today)
    defaultDate: { type: String, default: () => toISODate(new Date()) },
    defaultSlot: { type: String, default: 'Dinner' },
    // Same recipe shape as mockSwapOptions / RecipeModal
    recipes: { type: Array, default: () => [] },
  },

  emits: ['close', 'add'],

  data() {
    return {
      slots: SLOTS,
      selectedDate: this.defaultDate,
      selectedSlot: SLOTS.includes(this.defaultSlot) ? this.defaultSlot : 'Dinner',
      query: '',
      selectedRecipe: null,
      servings: 2,
      showCustom: false,
      custom: { title: '', calories: null, protein: null, carbs: null, fat: null },
      macroFields: [
        { key: 'calories', label: 'Calories', placeholder: '280 kcal' },
        { key: 'protein', label: 'Protein', placeholder: '8g' },
        { key: 'carbs', label: 'Carbs', placeholder: '32g' },
        { key: 'fat', label: 'Fat', placeholder: '12g' },
      ],
    };
  },

  computed: {
    // The 7 days of the week containing defaultDate, for the Day dropdown
    weekDays() {
      const start = mondayOf(new Date(`${this.defaultDate}T00:00:00`));
      const today = toISODate(new Date());
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const value = toISODate(d);
        const label = d.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' });
        return { value, label: value === today ? `${label} (Today)` : label };
      });
    },

    suggestions() {
      const q = this.query.toLowerCase();
      const list = q
        ? this.recipes.filter((r) =>
            [r.title, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.name)]
              .join(' ')
              .toLowerCase()
              .includes(q),
          )
        : this.recipes;
      return list.slice(0, 5);
    },

    isCustom() {
      return this.showCustom && this.custom.title.length > 0;
    },

    canSubmit() {
      return Boolean(this.selectedRecipe || this.isCustom);
    },
  },

  mounted() {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', this.onKeydown);
  },

  beforeUnmount() {
    document.body.style.overflow = '';
    window.removeEventListener('keydown', this.onKeydown);
  },

  methods: {
    close() {
      this.$emit('close');
    },

    selectRecipe(recipe) {
      this.selectedRecipe = recipe;
      this.servings = recipe.servings || this.servings;
      this.custom.title = ''; // picking a recipe cancels a half-typed custom meal
    },

    onCustomInput() {
      if (this.custom.title) this.selectedRecipe = null; // typing a custom meal deselects the recipe
    },

    buildCustomRecipe() {
      const n = this.custom;
      return {
        id: null,
        custom: true,
        title: n.title,
        description: 'Custom meal',
        servings: this.servings,
        prepMinutes: 0,
        tags: ['Custom'],
        nutrition: {
          calories: n.calories ?? 0,
          protein: n.protein ?? 0,
          carbs: n.carbs ?? 0,
          fat: n.fat ?? 0,
          fiber: null,
        },
        ingredients: [],
        steps: [],
      };
    },

    submit() {
      if (!this.canSubmit) return;
      const date = this.selectedDate;
      this.$emit('add', {
        date,
        day: new Date(`${date}T00:00:00`).toLocaleDateString('en-SG', { weekday: 'long' }),
        mealSlot: this.selectedSlot,
        servings: this.servings,
        recipe: this.isCustom ? this.buildCustomRecipe() : this.selectedRecipe,
      });
      this.close();
    },

    onKeydown(e) {
      if (e.key === 'Escape') this.close();
    },
  },
};
</script>

<style scoped>
/* ---------- Design tokens (delete if you moved these to assets/styles/tokens.css) ---------- */
.fft-backdrop {
  --fft-primary: #3a6a3a;
  --fft-primary-hover: #2f572f;
  --fft-on-primary: #ffffff;
  --fft-primary-fixed: #c8eec2;

  --fft-surface-lowest: #ffffff;
  --fft-surface-low: #f4f3ee;
  --fft-surface-high: #e8e7e2;
  --fft-surface-highest: #e2e1dc;
  --fft-on-surface: #1b1c19;
  --fft-on-surface-variant: #45483f;
  --fft-outline: #75786e;
  --fft-outline-variant: rgba(197, 200, 188, 0.4);

  position: fixed;
  inset: 0;
  z-index: 1055;
  overflow-y: auto;
  background: rgba(48, 49, 46, 0.4);
  backdrop-filter: blur(2px);
  animation: fft-fade 0.15s ease-out;
}

@keyframes fft-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fft-zoom {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* ---------- Shell ---------- */
.fft-modal {
  max-width: 36rem;
  border-radius: 1rem;
  overflow: hidden;
  background: var(--fft-surface-lowest);
  border: 1px solid var(--fft-outline-variant) !important;
  color: var(--fft-on-surface);
  animation: fft-zoom 0.15s ease-out;
}
.fft-modal-header {
  background: rgba(244, 243, 238, 0.5);
  border-bottom: 1px solid var(--fft-outline-variant);
}
.fft-modal-body { max-height: 75vh; overflow-y: auto; }
.fft-modal-footer {
  background: rgba(244, 243, 238, 0.6);
  border-top: 1px solid var(--fft-outline-variant);
}

.min-w-0 { min-width: 0; }

/* ---------- Typography ---------- */
.fft-title { font-size: 1.25rem; font-weight: 600; }
.fft-overline {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fft-outline);
}
.fft-label { font-size: 0.875rem; font-weight: 600; color: var(--fft-on-surface); }
.fft-meta { font-size: 12px; color: var(--fft-outline); }
.fft-outline { color: var(--fft-outline); }
.text-fft-primary { color: var(--fft-primary) !important; }

.material-symbols-outlined { line-height: 1; vertical-align: middle; }
.fs-16 { font-size: 16px; }
.fs-18 { font-size: 18px; }
.fs-20 { font-size: 20px; }

/* ---------- Close button ---------- */
.fft-icon-btn {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--fft-outline);
  transition: background-color 0.15s, color 0.15s;
}
.fft-icon-btn:hover { background: var(--fft-surface-high); color: var(--fft-on-surface); }

/* ---------- Inputs ---------- */
.fft-input {
  padding: 0.625rem 1rem 0.625rem 2.5rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  background-color: var(--fft-surface-low);
  border: 1px solid var(--fft-outline-variant);
  color: var(--fft-on-surface);
}
.fft-input--plain { padding-left: 1rem; }
.fft-input--small { padding: 0.375rem 0.5rem; border-radius: 0.5rem; }
.fft-input::placeholder { color: var(--fft-outline); }
.fft-input:focus {
  background-color: var(--fft-surface-low);
  border-color: var(--fft-primary);
  box-shadow: 0 0 0 2px var(--fft-primary);
}
.fft-select { font-weight: 500; cursor: pointer; }
.fft-input-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--fft-outline);
  pointer-events: none;
  z-index: 1;
}
/* hide number spinners in the macro inputs */
.fft-input--small::-webkit-outer-spin-button,
.fft-input--small::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.fft-input--small[type='number'] { -moz-appearance: textfield; }

/* ---------- Meal slot buttons ---------- */
.fft-slot {
  padding: 0.5rem 0.25rem;
  border: 0;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  background: var(--fft-surface-low);
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s;
}
.fft-slot:hover { background: var(--fft-surface-high); }
.fft-slot--active,
.fft-slot--active:hover {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* ---------- Suggestions ---------- */
.fft-suggestion {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  background: var(--fft-surface-low);
  color: var(--fft-on-surface);
  transition: background-color 0.15s, border-color 0.15s;
}
.fft-suggestion:hover { background: var(--fft-surface-high); }
.fft-suggestion-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fft-surface-high);
  color: var(--fft-outline);
}
.fft-suggestion-check { color: var(--fft-outline); }

.fft-suggestion--active { background: rgba(200, 238, 194, 0.3); border-color: var(--fft-primary-fixed); }
.fft-suggestion--active:hover { background: rgba(200, 238, 194, 0.5); }
.fft-suggestion--active .fft-suggestion-icon { background: var(--fft-primary-fixed); color: var(--fft-primary); }
.fft-suggestion--active .fft-suggestion-check { color: var(--fft-primary); }

.fft-empty { font-size: 0.875rem; color: var(--fft-outline); }

/* ---------- Servings stepper ---------- */
.fft-stepper {
  border-radius: 0.75rem;
  background: var(--fft-surface-low);
  border: 1px solid var(--fft-outline-variant);
}
.fft-stepper-btn {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s;
}
.fft-stepper-btn:hover:not(:disabled) { background: var(--fft-surface-high); }
.fft-stepper-btn:disabled { opacity: 0.4; }

/* ---------- Custom meal ---------- */
.fft-custom { border-top: 1px solid var(--fft-outline-variant); }
.fft-custom-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  padding-left: 0;
  padding-right: 0;
}

/* ---------- Buttons & links ---------- */
.fft-link { color: var(--fft-primary); text-decoration: none; }
.fft-link:hover { text-decoration: underline; }

.fft-btn-primary,
.fft-btn-secondary {
  border: 0;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
}
.fft-btn-primary { background: var(--fft-primary); color: var(--fft-on-primary); font-weight: 600; padding-inline: 1.25rem; }
.fft-btn-primary:hover:not(:disabled) { background: var(--fft-primary-hover); color: var(--fft-on-primary); }
.fft-btn-primary:disabled { background: var(--fft-primary); color: var(--fft-on-primary); opacity: 0.5; }
.fft-btn-secondary { background: var(--fft-surface-high); color: var(--fft-on-surface); }
.fft-btn-secondary:hover { background: var(--fft-surface-highest); }

/* ---------- Small screens ---------- */
@media (max-width: 575.98px) {
  .fft-modal-body { padding: 1rem !important; }
  .fft-modal-header,
  .fft-modal-footer { padding-left: 1rem !important; padding-right: 1rem !important; }
}
</style>