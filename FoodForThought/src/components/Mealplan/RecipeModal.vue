<!--
  RecipeModal.vue
  Meal-plan recipe detail modal. Ingredient amounts are scaled to the servings
  the user PLANNED (a 4-serving recipe planned for 2 shows half of everything).

  Usage:
    <RecipeModal
      v-if="selectedEntry"
      :entry="selectedEntry"
      @close="selectedEntry = null"
      @update-status="onStatusChange"
    />
-->
<template>
  <Teleport to="body">
    <div
      class="fft-backdrop d-flex align-items-center justify-content-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-recipe-title"
      @click.self="close"
    >
      <div class="fft-modal card border-0 shadow-lg w-100 d-flex flex-column">
        <!-- Header -->
        <div class="fft-modal-header p-4 d-flex flex-column gap-2">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div class="d-flex flex-column gap-1">
              <div class="d-flex align-items-center flex-wrap gap-2">
                <span class="fft-chip fft-chip--neutral text-uppercase">
                  {{ entry.mealSlot }}
                </span>
                <span class="fft-chip d-inline-flex align-items-center gap-1" :class="statusChip.cls">
                  <span class="material-symbols-outlined fs-14">{{ statusChip.icon }}</span>
                  {{ statusChip.label }}
                </span>
                <span
                  v-for="tag in recipe.tags"
                  :key="tag"
                  class="fft-chip fft-chip--secondary"
                >{{ tag }}</span>
              </div>

              <h2 id="modal-recipe-title" class="fft-title mb-0 pt-1">{{ recipe.title }}</h2>
              <p class="fft-muted small mb-0">{{ recipe.description }}</p>
            </div>

            <button
              type="button"
              class="fft-icon-btn flex-shrink-0"
              aria-label="Close modal"
              @click="close"
            >
              <span class="material-symbols-outlined fs-20">close</span>
            </button>
          </div>

          <!-- Nutrition summary -->
          <div class="row row-cols-3 row-cols-sm-5 g-2 pt-1">
            <div v-for="n in nutritionItems" :key="n.label" class="col">
              <div class="fft-stat text-center py-2 px-1">
                <div class="fft-stat-label text-uppercase">{{ n.label }}</div>
                <div class="fft-stat-value" :class="{ 'text-fft-primary': n.highlight }">
                  {{ n.value }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="fft-modal-body p-4 d-flex flex-column gap-4">
          <!-- Ingredients -->
          <section class="d-flex flex-column gap-2">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <h3 class="fft-section-title mb-0 d-flex align-items-center gap-2">
                <span class="material-symbols-outlined text-fft-primary fs-20">kitchen</span>
                Ingredients ({{ plannedServings }} {{ plannedServings === 1 ? 'serving' : 'servings' }})
              </h3>
              <span
                class="small fw-semibold d-flex align-items-center gap-1"
                :class="allInPantry ? 'text-fft-primary' : 'text-fft-warning'"
              >
                <span class="material-symbols-outlined fs-16">
                  {{ allInPantry ? 'task_alt' : 'shopping_cart' }}
                </span>
                {{ inPantryCount }} of {{ recipe.ingredients.length }} in pantry
              </span>
            </div>

            <div class="row g-2 pt-1">
              <div
                v-for="(ing, i) in recipe.ingredients"
                :key="ing.name"
                class="col-12"
                :class="{ 'col-sm-6': !(isOddCount && i === recipe.ingredients.length - 1) }"
              >
                <div class="fft-ingredient d-flex align-items-center justify-content-between gap-2">
                  <div class="d-flex align-items-center gap-2">
                    <span class="fft-check" :class="{ 'fft-check--missing': !ing.inPantry }">
                      <span class="material-symbols-outlined">{{ ing.inPantry ? 'check' : 'remove' }}</span>
                    </span>
                    <span class="small fw-medium">{{ ing.name }}<template v-if="scaledQuantity(ing)"> ({{ scaledQuantity(ing) }})</template></span>
                  </div>
                  <span
                    class="fft-tiny fw-semibold text-nowrap"
                    :class="ing.inPantry ? 'text-fft-primary' : 'text-fft-warning'"
                  >
                    {{ ing.inPantry ? 'In Pantry' : 'Missing' }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- Steps -->
          <section class="d-flex flex-column gap-2">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <h3 class="fft-section-title mb-0 d-flex align-items-center gap-2">
                <span class="material-symbols-outlined text-fft-primary fs-20">skillet</span>
                Cooking Steps
              </h3>
              <span class="small fft-outline d-flex align-items-center gap-1">
                <span class="material-symbols-outlined fs-16">timer</span>
                {{ recipe.prepMinutes }} min active prep
              </span>
            </div>

            <ol class="list-unstyled d-flex flex-column gap-2 pt-1 mb-0">
              <li
                v-for="(step, i) in recipe.steps"
                :key="i"
                class="fft-step d-flex align-items-start gap-3 p-3"
              >
                <span class="fft-step-num flex-shrink-0">{{ i + 1 }}</span>
                <div class="d-flex flex-column">
                  <span class="fw-semibold small">{{ step.title }}</span>
                  <p class="fft-muted small mb-0">{{ step.text }}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <!-- Footer -->
        <div class="fft-modal-footer px-4 py-3 d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
          <router-link
            v-if="recipe.id"
            :to="`/recipes/${recipe.id}`"
            class="fft-link small fw-medium d-flex align-items-center gap-1"
          >
            <span class="material-symbols-outlined fs-16">open_in_new</span>
            View Full Recipe &amp; Notes
          </router-link>

          <div class="d-flex align-items-center gap-2 ms-sm-auto">
            <button
              v-if="entry.status !== 'Skipped'"
              type="button"
              class="btn fft-btn-ghost"
              @click="setStatus('Skipped')"
            >Skip</button>
            <button type="button" class="btn fft-btn-secondary" @click="close">Close</button>
            <button
              type="button"
              class="btn fft-btn-primary d-flex align-items-center gap-1"
              :disabled="entry.status === 'Cooked'"
              @click="setStatus('Cooked')"
            >
              <span class="material-symbols-outlined fs-16">done</span>
              {{ entry.status === 'Cooked' ? 'Cooked & Logged' : 'Mark as Cooked' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
export default {
  name: 'RecipeModal',

  props: {
    /*
      entry = {
        id, mealSlot: 'Breakfast',
        status: 'Planned' | 'Cooked' | 'Skipped',
        recipe: {
          id, title, description, servings, prepMinutes, tags: [],
          nutrition: { calories, protein, carbs, fat, fiber },
          ingredients: [{ name, quantity, inPantry }],
          steps: [{ title, text }]
        }
      }
    */
    entry: { type: Object, required: true },
  },

  emits: ['close', 'update-status'],

  computed: {
    recipe() {
      return this.entry.recipe;
    },
    nutritionItems() {
      const n = this.recipe.nutrition || {};
      return [
        { label: 'Calories', value: n.calories ?? '–' },
        { label: 'Protein', value: `${n.protein ?? '–'}g` },
        { label: 'Carbs', value: `${n.carbs ?? '–'}g` },
        { label: 'Fat', value: `${n.fat ?? '–'}g` },
        { label: 'Fiber', value: `${n.fiber ?? '–'}g`, highlight: true },
      ];
    },
    // what the user planned; falls back to the recipe's own servings
    plannedServings() {
      return this.entry.servings || this.recipe.servings || 1;
    },
    scale() {
      return this.plannedServings / (this.recipe.servings || this.plannedServings);
    },
    inPantryCount() {
      return this.recipe.ingredients.filter((i) => i.inPantry).length;
    },
    allInPantry() {
      return this.inPantryCount === this.recipe.ingredients.length;
    },
    isOddCount() {
      return this.recipe.ingredients.length % 2 === 1;
    },
    statusChip() {
      const map = {
        Cooked: { label: 'Cooked', icon: 'check_circle', cls: 'fft-chip--primary' },
        Skipped: { label: 'Skipped', icon: 'block', cls: 'fft-chip--danger' },
        Planned: { label: 'Planned', icon: 'schedule', cls: 'fft-chip--neutral' },
      };
      return map[this.entry.status] || map.Planned;
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
    // "1 cup" for a 2-serving recipe planned for 4 -> "2 cup". Older data without
    // raw amounts just shows the recipe's text.
    scaledQuantity(ing) {
      if (ing.amount == null) return ing.quantity;
      const amount = Math.round(ing.amount * this.scale * 100) / 100;
      return [amount, ing.unit].filter(Boolean).join(' ');
    },
    setStatus(status) {
      this.$emit('update-status', { entryId: this.entry.id, status });
      this.close();
    },
    onKeydown(e) {
      if (e.key === 'Escape') this.close();
    },
  },
};
</script>

<style scoped>
/* ---------- Design tokens (replace Tailwind theme colours) ---------- */
.fft-backdrop {
  --fft-primary: #3a6a3a;
  --fft-primary-hover: #2f572f;
  --fft-on-primary: #ffffff;
  --fft-primary-fixed: #c8eec2;
  --fft-on-primary-fixed: #0a2a0c;
  --fft-secondary-fixed: #fbe0b5;
  --fft-on-secondary-fixed: #3b2700;
  --fft-danger-fixed: #ffdad6;
  --fft-on-danger-fixed: #5c1210;
  --fft-warning: #a35c00;

  --fft-surface: #fbfaf5;
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
  background: rgba(27, 28, 25, 0.4);
  backdrop-filter: blur(4px);
  animation: fft-fade 0.15s ease-out;
}

@keyframes fft-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
<<<<<<< Updated upstream
=======
/* Panel scales up slightly as it fades in, matching AddMealModal. Never from scale(0). */
@keyframes fft-zoom {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.fft-modal { animation: fft-zoom var(--dur-modal) var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  .fft-modal { animation: fft-fade var(--dur-modal) ease; }
}
>>>>>>> Stashed changes

/* ---------- Shell ---------- */
.fft-modal {
  max-width: 42rem;
  max-height: 90vh;
<<<<<<< Updated upstream
=======
  max-height: 90dvh;
>>>>>>> Stashed changes
  border-radius: 1rem;
  overflow: hidden;
  background: var(--fft-surface-lowest);
  border: 1px solid var(--fft-outline-variant) !important;
  color: var(--fft-on-surface);
}
.fft-modal-header {
  background: var(--fft-surface);
  border-bottom: 1px solid var(--fft-outline-variant);
}
.fft-modal-body {
  overflow-y: auto;
}
.fft-modal-footer {
  background: var(--fft-surface-low);
  border-top: 1px solid var(--fft-outline-variant);
}

/* ---------- Typography ---------- */
.fft-title { font-size: 1.5rem; font-weight: 600; line-height: 1.3; }
.fft-section-title { font-size: 1.125rem; font-weight: 600; }
.fft-muted { color: var(--fft-on-surface-variant); }
.fft-outline { color: var(--fft-outline); }
.fft-tiny { font-size: 11px; }
.text-fft-primary { color: var(--fft-primary) !important; }
.text-fft-warning { color: var(--fft-warning) !important; }

.material-symbols-outlined { line-height: 1; vertical-align: middle; }
.fs-14 { font-size: 14px; }
.fs-16 { font-size: 16px; }
.fs-20 { font-size: 20px; }

/* ---------- Chips ---------- */
.fft-chip {
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.fft-chip--neutral { background: var(--fft-surface-high); color: var(--fft-on-surface-variant); }
.fft-chip--primary { background: var(--fft-primary-fixed); color: var(--fft-on-primary-fixed); }
.fft-chip--secondary { background: var(--fft-secondary-fixed); color: var(--fft-on-secondary-fixed); }
.fft-chip--danger { background: var(--fft-danger-fixed); color: var(--fft-on-danger-fixed); }

/* ---------- Close button ---------- */
.fft-icon-btn {
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fft-surface-low);
  color: var(--fft-on-surface-variant);
  transition: background-color 0.15s, color 0.15s;
}
.fft-icon-btn:hover { background: var(--fft-surface-high); color: var(--fft-on-surface); }

/* ---------- Nutrition stats ---------- */
.fft-stat { border-radius: 0.75rem; background: var(--fft-surface-low); }
.fft-stat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--fft-outline);
}
.fft-stat-value { font-size: 16px; font-weight: 700; }

/* ---------- Ingredients ---------- */
.fft-ingredient {
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(244, 243, 238, 0.7);
  border: 1px solid var(--fft-outline-variant);
}
.fft-check {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fft-primary-fixed);
  color: var(--fft-on-primary-fixed);
}
.fft-check .material-symbols-outlined { font-size: 13px; }
.fft-check--missing { background: var(--fft-secondary-fixed); color: var(--fft-on-secondary-fixed); }

/* ---------- Steps ---------- */
.fft-step { border-radius: 0.75rem; background: rgba(244, 243, 238, 0.6); }
.fft-step-num {
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.125rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: var(--fft-primary);
  color: var(--fft-on-primary);
}

/* ---------- Footer actions ---------- */
.fft-link { color: var(--fft-primary); text-decoration: none; }
.fft-link:hover { text-decoration: underline; }

.fft-btn-primary,
.fft-btn-secondary,
.fft-btn-ghost {
  border-radius: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
  border: 0;
}
.fft-btn-primary { background: var(--fft-primary); color: var(--fft-on-primary); padding-inline: 1.25rem; }
.fft-btn-primary:hover:not(:disabled) { background: var(--fft-primary-hover); color: var(--fft-on-primary); }
.fft-btn-primary:disabled { background: var(--fft-primary); color: var(--fft-on-primary); opacity: 0.6; }
.fft-btn-secondary { background: var(--fft-surface-highest); color: var(--fft-on-surface); }
.fft-btn-secondary:hover { background: var(--fft-surface-high); }
.fft-btn-ghost { background: transparent; color: var(--fft-outline); }
.fft-btn-ghost:hover { color: var(--fft-on-surface); background: var(--fft-surface-high); }

/* ---------- Small screens (iPhone 6 ≈ 375px) ---------- */
@media (max-width: 575.98px) {
<<<<<<< Updated upstream
  .fft-modal { max-height: 95vh; }
=======
  .fft-modal { max-height: 95vh; max-height: 95dvh; }
>>>>>>> Stashed changes
  .fft-modal-header,
  .fft-modal-body { padding: 1rem !important; }
  .fft-title { font-size: 1.25rem; }
}
</style>