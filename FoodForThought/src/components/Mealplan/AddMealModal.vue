<!--
  AddMealModal.vue
  Adds a recipe to a day + meal slot in the weekly planner.
  Recipes come from our database AND Spoonacular. To plan something that isn't
  in either, the user creates a recipe on /recipes/create (linked at the bottom).

  Usage (in views/Planner.vue):
    <AddMealModal
      v-if="addTarget"
      :default-date="addTarget.date"
      :default-slot="addTarget.mealSlot"
      :recipes="recipeOptions"
      :search-results="recipeSearch"
      @search="searchRecipes"
      @close="closeAddMeal"
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

            <!-- Results: "Quick Suggestions" before typing; "Your recipes" + "From Spoonacular" while searching -->
            <div v-for="group in resultGroups" :key="group.key" class="d-flex flex-column gap-2 pt-2"
              :data-testid="`add-meal-${group.key}`">
              <span class="fft-overline d-flex align-items-center gap-1">
                <span v-if="group.key === 'online'" class="material-symbols-outlined fs-16">public</span>
                {{ group.title }}
              </span>

              <button
                v-for="r in group.recipes"
                :key="r.id"
                type="button"
                class="fft-suggestion d-flex align-items-center justify-content-between gap-2 p-2 text-start"
                :class="{ 'fft-suggestion--active': selectedRecipe && selectedRecipe.id === r.id }"
                @click="selectRecipe(r)"
              >
                <div class="d-flex align-items-center gap-3 min-w-0">
                  <img v-if="r.image" :src="r.image" alt="" class="fft-suggestion-img flex-shrink-0" loading="lazy" />
                  <span v-else class="fft-suggestion-icon flex-shrink-0">
                    <span class="material-symbols-outlined fs-16">restaurant</span>
                  </span>
                  <div class="d-flex flex-column min-w-0">
                    <span class="small fw-semibold text-truncate">{{ r.title }}</span>
                    <span class="fft-meta">{{ recipeMeta(r) }}</span>
                  </div>
                </div>
                <span class="material-symbols-outlined fs-18 fft-suggestion-check">
                  {{ selectedRecipe && selectedRecipe.id === r.id ? 'check_circle' : 'add_circle' }}
                </span>
              </button>

              <div v-if="group.key === 'online' && onlinePending" class="fft-meta d-flex align-items-center gap-2 py-1">
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                Searching Spoonacular...
              </div>
              <div v-else-if="group.key === 'online' && (searchResults.warning || searchResults.error)" class="fft-meta fft-warning py-1">
                {{ searchResults.warning || searchResults.error }}
              </div>
              <div v-else-if="group.recipes.length === 0" class="fft-empty py-1">
                {{ group.key === 'online' ? 'No matches on Spoonacular.' : 'No saved recipes match.' }}
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

          <!-- Can't find it? -> create a full recipe (with ingredients) instead of a name-only custom meal,
               so it also works with the shopping list and pantry. ?from=planner brings the user back here after saving. -->
          <router-link
            :to="{ path: '/recipes/create', query: { from: 'planner' } }"
            class="fft-create d-flex align-items-center justify-content-between gap-2 p-3"
            data-testid="add-meal-create-recipe"
          >
            <span class="d-flex align-items-center gap-3">
              <span class="material-symbols-outlined text-fft-primary fs-20">edit_note</span>
              <span class="d-flex flex-column">
                <span class="fft-label">Can't find it? Create your own recipe</span>
                <span class="fft-meta">Add its ingredients once, then plan it like any other recipe</span>
              </span>
            </span>
            <span class="material-symbols-outlined fft-outline fs-18">arrow_forward</span>
          </router-link>
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
import { toISODate, mondayOf } from '@/utils/dates';

const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const MIN_SEARCH = 2; // same minimum as GET /planner/recipe-search

export default {
  name: 'AddMealModal',

  props: {
    // 'YYYY-MM-DD' of the day the user clicked "Add Meal" on (defaults to today)
    defaultDate: { type: String, default: () => toISODate(new Date()) },
    defaultSlot: { type: String, default: 'Dinner' },
    // Saved recipes for "Quick Suggestions" (GET /planner/recipe-options), same shape as the swap modal uses
    recipes: { type: Array, default: () => [] },
    // Results of the last search, filled in by Planner.vue (GET /planner/recipe-search):
    // { query, saved: [], online: [], warning, loading, error }
    searchResults: {
      type: Object,
      default: () => ({ query: '', saved: [], online: [], warning: '', loading: false, error: '' }),
    },
  },

  // search(query): the parent searches saved + Spoonacular recipes and passes them back as searchResults
  emits: ['close', 'add', 'search'],

  data() {
    return {
      slots: SLOTS,
      selectedDate: this.defaultDate,
      selectedSlot: SLOTS.includes(this.defaultSlot) ? this.defaultSlot : 'Dinner',
      query: '',
      selectedRecipe: null,
      servings: 2,
      searchTimer: null,
    };
  },

  watch: {
    // Wait until the user stops typing (600 ms) before searching, so we don't use
    // Spoonacular's daily quota on every key press ("c", "ch", "chi", ...)
    query(value) {
      clearTimeout(this.searchTimer);
      if (value.length < MIN_SEARCH) return;
      this.searchTimer = setTimeout(() => this.$emit('search', value), 600);
    },
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

    // Saved recipes matching the search, filtered here so results appear instantly while the server search runs
    localMatches() {
      const q = this.query.toLowerCase();
      return this.recipes.filter((r) =>
        [r.title, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.name)]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    },

    // True once the server's results are for exactly what's in the search box (not an older search)
    resultsAreFresh() {
      return this.searchResults.query === this.query && !this.searchResults.loading;
    },

    // Still waiting: either the 600 ms typing pause, or the request itself
    onlinePending() {
      return this.query.length >= MIN_SEARCH && !this.resultsAreFresh;
    },

    // The lists shown under the search box
    resultGroups() {
      if (this.query.length < MIN_SEARCH) {
        return [{ key: 'quick', title: 'Quick Suggestions', recipes: this.recipes.slice(0, 5) }];
      }
      const fresh = this.resultsAreFresh;
      return [
        { key: 'saved', title: 'Your recipes', recipes: (fresh ? this.searchResults.saved : this.localMatches).slice(0, 5) },
        { key: 'online', title: 'From Spoonacular', recipes: fresh ? this.searchResults.online : [] },
      ];
    },

    canSubmit() {
      return Boolean(this.selectedRecipe);
    },
  },

  mounted() {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', this.onKeydown);
  },

  beforeUnmount() {
    clearTimeout(this.searchTimer);
    document.body.style.overflow = '';
    window.removeEventListener('keydown', this.onKeydown);
  },

  methods: {
    close() {
      this.$emit('close');
    },

    selectRecipe(recipe) {
      this.selectedRecipe = recipe;
      // Start from the recipe's own servings, but the planner only allows 1-12
      // (many Spoonacular recipes serve 16+, which the server would reject)
      this.servings = Math.min(Math.max(recipe.servings || this.servings, 1), 12);
    },

    // "520 kcal · 31g protein · 35m prep" (user recipes may have no nutrition yet, so skip missing parts)
    recipeMeta(r) {
      const n = r.nutrition || {};
      return [
        n.calories != null ? `${n.calories} kcal` : null,
        n.protein != null ? `${n.protein}g protein` : null,
        r.prepMinutes ? `${r.prepMinutes}m prep` : null,
      ].filter(Boolean).join(' · ') || 'No nutrition info yet';
    },

    submit() {
      if (!this.canSubmit) return;
      const date = this.selectedDate;
      this.$emit('add', {
        date,
        day: new Date(`${date}T00:00:00`).toLocaleDateString('en-SG', { weekday: 'long' }),
        mealSlot: this.selectedSlot,
        servings: this.servings,
        recipe: this.selectedRecipe, // source 'spoonacular' = not saved yet; Planner.vue sends its externalId
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
.fft-warning { color: #9a5b13; } /* amber: Spoonacular unavailable, saved results still shown */

/* recipe photo thumbnail (Spoonacular and user recipes with an image) */
.fft-suggestion-img {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  object-fit: cover;
  background: var(--fft-surface-high);
}

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

/* ---------- "Create your own recipe" link ---------- */
.fft-create {
  border-radius: 0.75rem;
  border: 1px dashed var(--fft-outline-variant);
  color: var(--fft-on-surface);
  text-decoration: none;
  transition: background-color 0.15s, border-color 0.15s;
}
.fft-create:hover { background: var(--fft-surface-low); border-color: var(--fft-primary); }

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