<!--
  SwapMealModal.vue
  Lets the user replace a planned meal with another recipe
  (converted from Tailwind to Bootstrap 5 + scoped CSS).

  Usage (in MealPlanView.vue):
    <SwapMealModal
      v-if="swapEntry"
      :entry="swapEntry"
      :recipes="swapOptions"
      @close="swapEntry = null"
      @swap="swapMeal"
    />
-->
<template>
  <Teleport to="body">
    <div
      class="fft-backdrop d-flex align-items-center justify-content-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-swap-title"
      @click.self="close"
    >
      <div class="fft-modal card border-0 shadow-lg w-100 d-flex flex-column">
        <!-- Header -->
        <div class="fft-modal-header p-3 d-flex align-items-start justify-content-between">
          <div class="d-flex flex-column gap-1 pe-3 min-w-0">
            <span class="fft-overline text-truncate">
              {{ entry.day }} {{ entry.mealSlot }} • Current: {{ entry.recipe.title }}
            </span>
            <h2 id="modal-swap-title" class="fft-title mb-0">Swap {{ entry.mealSlot }}</h2>
          </div>
          <button type="button" class="fft-icon-btn flex-shrink-0" title="Close modal" aria-label="Close modal" @click="close">
            <span class="material-symbols-outlined fs-20">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="fft-modal-body p-3 d-flex flex-column gap-3">
          <!-- Search + filters -->
          <div class="d-flex flex-column gap-2">
            <div class="position-relative w-100">
              <span class="material-symbols-outlined fft-search-icon">search</span>
              <input
                v-model.trim="query"
                type="search"
                class="form-control fft-search"
                placeholder="Search recipes, ingredients, tags..."
                aria-label="Search recipes"
              />
            </div>

            <div class="fft-filter-row d-flex align-items-center gap-2 py-1">
              <button
                v-for="f in filters"
                :key="f.key"
                type="button"
                class="fft-filter flex-shrink-0"
                :class="{ 'fft-filter--active': activeFilter === f.key }"
                :aria-pressed="activeFilter === f.key"
                @click="activeFilter = f.key"
              >{{ f.label }}</button>
            </div>
          </div>

          <!-- Results -->
          <div class="d-flex flex-column gap-2">
            <span class="fft-overline">
              {{ query || activeFilter !== 'all' ? `Results (${filteredRecipes.length})` : 'Suggested Swaps' }}
            </span>

            <div
              v-for="r in filteredRecipes"
              :key="r.id"
              class="fft-option d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2 p-2"
            >
              <div class="d-flex align-items-center gap-3 min-w-0">
                <div class="fft-thumb flex-shrink-0">
                  <img v-if="r.image" :src="r.image" :alt="r.title" />
                  <span v-else class="material-symbols-outlined">restaurant</span>
                </div>

                <div class="d-flex flex-column min-w-0 gap-1">
                  <span class="fw-semibold small text-truncate">{{ r.title }}</span>
                  <span class="fft-meta">
                    {{ r.prepMinutes }}m • {{ r.nutrition.calories }} kcal • {{ r.nutrition.protein }}g Protein
                  </span>
                  <div>
                    <span
                      class="fft-chip d-inline-flex align-items-center gap-1"
                      :class="r.pantryMatch === 100 ? 'fft-chip--primary' : 'fft-chip--secondary'"
                    >
                      <span class="material-symbols-outlined fs-13">
                        {{ r.pantryMatch === 100 ? 'check' : 'shopping_cart' }}
                      </span>
                      {{ r.pantryMatch }}% pantry match
                    </span>
                  </div>
                </div>
              </div>

              <button type="button" class="btn fft-btn-primary flex-shrink-0" @click="choose(r)">
                Use this meal
              </button>
            </div>

            <!-- Empty state -->
            <div v-if="filteredRecipes.length === 0" class="fft-empty text-center py-4">
              <span class="material-symbols-outlined d-block mb-1">search_off</span>
              No recipes match. Try another search or filter.
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="fft-modal-footer p-3 d-flex align-items-center justify-content-between">
          <router-link to="/recipes" class="fft-link small fw-semibold d-flex align-items-center gap-1">
            Browse all recipes
            <span class="material-symbols-outlined fs-16">arrow_forward</span>
          </router-link>
          <button type="button" class="btn fft-btn-ghost" @click="close">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
export default {
  name: 'SwapMealModal',

  props: {
    // The meal-plan entry being replaced (same shape RecipeModal uses)
    entry: { type: Object, required: true },
    /*
      recipes = [{
        id, title, image, prepMinutes, tags: [], pantryMatch: 0-100,
        nutrition: { calories, protein, ... },
        ingredients: [{ name, quantity, inPantry }],
        steps: [{ title, text }]
      }]
    */
    recipes: { type: Array, default: () => [] },
  },

  emits: ['close', 'swap'],

  data() {
    return {
      query: '',
      activeFilter: 'all',
      filters: [
        { key: 'all', label: 'All' },
        { key: 'protein', label: 'High Protein' },
        { key: 'quick', label: 'Under 15m' },
        { key: 'pantry', label: 'Pantry Ready' },
      ],
    };
  },

  computed: {
    filteredRecipes() {
      const q = this.query.toLowerCase();

      return this.recipes
        // don't suggest the meal that's already in this slot
        .filter((r) => r.id !== this.entry.recipe.id)
        // filter chips
        .filter((r) => {
          if (this.activeFilter === 'protein') return r.nutrition.protein >= 20;
          if (this.activeFilter === 'quick') return r.prepMinutes <= 15;
          if (this.activeFilter === 'pantry') return r.pantryMatch === 100;
          return true;
        })
        // search across title, tags and ingredient names
        .filter((r) => {
          if (!q) return true;
          const haystack = [
            r.title,
            ...(r.tags || []),
            ...(r.ingredients || []).map((i) => i.name),
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        })
        // best pantry match first
        .sort((a, b) => b.pantryMatch - a.pantryMatch);
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
    choose(recipe) {
      this.$emit('swap', { entryId: this.entry.id, recipe });
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
  --fft-on-primary-fixed: #0a2a0c;
  --fft-secondary-fixed: #fbe0b5;
  --fft-on-secondary-fixed: #3b2700;

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
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  animation: fft-fade 0.15s ease-out;
}

@keyframes fft-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---------- Shell ---------- */
.fft-modal {
  max-width: 36rem;
  max-height: 90vh;
  border-radius: 1rem;
  overflow: hidden;
  background: var(--fft-surface-lowest);
  border: 1px solid var(--fft-outline-variant) !important;
  color: var(--fft-on-surface);
}
.fft-modal-header,
.fft-modal-footer {
  background: rgba(244, 243, 238, 0.5);
}
.fft-modal-header { border-bottom: 1px solid var(--fft-outline-variant); }
.fft-modal-footer { border-top: 1px solid var(--fft-outline-variant); }
.fft-modal-body { overflow-y: auto; max-height: 75vh; }

.min-w-0 { min-width: 0; }

/* ---------- Typography ---------- */
.fft-title { font-size: 1.5rem; font-weight: 600; color: var(--fft-primary); }
.fft-overline {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fft-outline);
}
.fft-meta { font-size: 12px; color: var(--fft-on-surface-variant); }

.material-symbols-outlined { line-height: 1; vertical-align: middle; }
.fs-13 { font-size: 13px; }
.fs-16 { font-size: 16px; }
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
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s;
}
.fft-icon-btn:hover { background: var(--fft-surface-high); }

/* ---------- Search ---------- */
.fft-search {
  padding: 0.5rem 1rem 0.5rem 2.5rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  background: var(--fft-surface-low);
  border: 1px solid var(--fft-outline-variant);
  color: var(--fft-on-surface);
}
.fft-search::placeholder { color: var(--fft-outline); }
.fft-search:focus {
  background: var(--fft-surface-low);
  border-color: var(--fft-primary);
  box-shadow: 0 0 0 2px var(--fft-primary);
}
.fft-search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--fft-outline);
  pointer-events: none;
}

/* ---------- Filter chips ---------- */
.fft-filter-row { overflow-x: auto; scrollbar-width: none; }
.fft-filter-row::-webkit-scrollbar { display: none; }
.fft-filter {
  padding: 0.25rem 0.75rem;
  border: 0;
  border-radius: 999px;
  font-size: 0.75rem;
  background: var(--fft-surface-high);
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s;
}
.fft-filter:hover { background: var(--fft-surface-highest); }
.fft-filter--active,
.fft-filter--active:hover {
  background: var(--fft-primary);
  color: var(--fft-on-primary);
  font-weight: 600;
}

/* ---------- Recipe options ---------- */
.fft-option {
  border-radius: 0.75rem;
  background: var(--fft-surface-lowest);
  border: 1px solid var(--fft-outline-variant);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fft-option:hover {
  border-color: rgba(58, 106, 58, 0.4);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.fft-thumb {
  width: 4rem;
  height: 4rem;
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--fft-surface-highest);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fft-outline);
}
.fft-thumb img { width: 100%; height: 100%; object-fit: cover; }

.fft-chip {
  padding: 0.0625rem 0.5rem;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.fft-chip--primary { background: var(--fft-primary-fixed); color: var(--fft-on-primary-fixed); }
.fft-chip--secondary { background: var(--fft-secondary-fixed); color: var(--fft-on-secondary-fixed); }

.fft-empty { font-size: 0.875rem; color: var(--fft-outline); }

/* ---------- Buttons & links ---------- */
.fft-link { color: var(--fft-primary); text-decoration: none; }
.fft-link:hover { text-decoration: underline; }

.fft-btn-primary,
.fft-btn-ghost {
  border: 0;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
}
.fft-btn-primary { background: var(--fft-primary); color: var(--fft-on-primary); }
.fft-btn-primary:hover { background: var(--fft-primary-hover); color: var(--fft-on-primary); }
.fft-btn-ghost { background: transparent; color: var(--fft-on-surface-variant); font-weight: 500; }
.fft-btn-ghost:hover { background: var(--fft-surface-high); }

/* ---------- Small screens ---------- */
@media (max-width: 575.98px) {
  .fft-modal { max-height: 95vh; }
  .fft-option .fft-btn-primary { width: 100%; }
}
</style>