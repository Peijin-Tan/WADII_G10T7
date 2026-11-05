<!--
  PageIntro.vue
  Coloured banner at the top of the Weekly Plan, Shopping List and Pantry pages that says
  what the page is for, and shows how the three pages work together:
      1 Plan meals  ->  2 Shop for what's missing  ->  3 Stock your pantry
  The current page is highlighted; the other two steps are links.
  "Hide" folds it into a small button, remembered per page in this browser.

  Usage:  <PageIntro page="pantry" />
-->
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  page: { type: String, required: true, validator: (p) => ['planner', 'shopping', 'pantry'].includes(p) },
})

const PAGES = {
  planner: {
    icon: 'calendar_month',
    heading: 'Plan what you\'ll eat this week',
    text: 'Add a recipe to each day. When you cook a meal, mark it Cooked and its ingredients come out of your pantry for you. Skipped meals are left off your shopping list.',
  },
  shopping: {
    icon: 'shopping_basket',
    heading: 'Buy only what\'s missing',
    text: 'This list is built from your weekly plan, minus what your pantry already has. Tick items as you shop, then add everything you bought to your pantry in one go.',
  },
  pantry: {
    icon: 'kitchen',
    heading: 'Keep track of what\'s at home',
    text: 'Your plan and shopping list check here first, so an up-to-date pantry means buying less and wasting less. Add a use-by date to see what to cook soon.',
  },
}

const STEPS = [
  { page: 'planner', label: 'Plan meals', to: '/planner' },
  { page: 'shopping', label: 'Shop for what\'s missing', to: '/shoppinglist' },
  { page: 'pantry', label: 'Stock your pantry', to: '/pantry' },
]

const info = computed(() => PAGES[props.page])

const storageKey = `fft-intro-hidden-${props.page}`
function readHidden() {
  try {
    return localStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}
const hidden = ref(readHidden())
function setHidden(value) {
  hidden.value = value
  try {
    if (value) localStorage.setItem(storageKey, '1')
    else localStorage.removeItem(storageKey)
  } catch {
  }
}
</script>

<template>
  <button v-if="hidden" type="button" class="pi-reopen" :class="`pi--${page}`" @click="setHidden(false)">
    <span class="material-symbols-outlined" aria-hidden="true">info</span>
    What's this page for?
  </button>

  <section v-else class="pi" :class="`pi--${page}`" :aria-label="`About this page: ${info.heading}`">
    <span class="pi-icon" aria-hidden="true">
      <span class="material-symbols-outlined">{{ info.icon }}</span>
    </span>

    <div class="pi-body">
      <h2 class="pi-heading">{{ info.heading }}</h2>
      <p class="pi-text">{{ info.text }}</p>

      <!-- the three pages are one loop, in this order -->
      <ol class="pi-steps">
        <li v-for="(step, i) in STEPS" :key="step.page" class="pi-step"
          :class="[`pi-step--${step.page}`, { 'is-current': step.page === page }]">
          <span v-if="step.page === page" class="pi-step-inner" aria-current="page">
            <span class="pi-step-num">{{ i + 1 }}</span>{{ step.label }}
          </span>
          <router-link v-else :to="step.to" class="pi-step-inner">
            <span class="pi-step-num">{{ i + 1 }}</span>{{ step.label }}
          </router-link>
        </li>
      </ol>
    </div>

    <button type="button" class="pi-hide" aria-label="Hide this explanation" title="Hide" @click="setHidden(true)">
      <span class="material-symbols-outlined">close</span>
    </button>
  </section>
</template>

<style scoped>
.pi--planner  { --pi-ink: #2f6b45; --pi-wash: #e1ede1; --pi-chip: #c6e2cc; --pi-text: #1d4230; }
.pi--shopping { --pi-ink: #b23a2a; --pi-wash: #f2e0d9; --pi-chip: #f6cbc2; --pi-text: #6e241a; }
.pi--pantry   { --pi-ink: #5b3a6e; --pi-wash: #e5e0e4; --pi-chip: #ddcfe6; --pi-text: #382444; }

.pi {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 48px 18px 18px;
  border-radius: 16px;
  background: var(--pi-wash);
  color: var(--pi-text);
}

.pi-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--pi-ink);
  color: #fff;
}

.pi-icon .material-symbols-outlined { font-size: 26px; }

.pi-body { min-width: 0; }

.pi-heading {
  margin: 0;
  font: 600 19px/26px 'Outfit', sans-serif;
  color: var(--pi-ink);
}

.pi-text {
  margin: 4px 0 12px;
  max-width: 68ch;
  font: 400 14px/22px 'Inter', sans-serif;
}

/* ----- the plan -> shop -> stock loop ----- */.pi-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pi-step + .pi-step::before {
  content: 'arrow_forward';
  font-family: 'Material Symbols Outlined';
  font-size: 16px;
  line-height: 1;
  margin-right: 6px;
  vertical-align: middle;
  opacity: 0.5;
}

.pi-step { display: inline-flex; align-items: center; }

.pi-step--planner  { --step-ink: #2f6b45; }
.pi-step--shopping { --step-ink: #b23a2a; }
.pi-step--pantry   { --step-ink: #5b3a6e; }

.pi-step-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--step-ink);
  font: 600 12.5px/18px 'Inter', sans-serif;
  text-decoration: none;
  transition: background-color 0.15s;
}

a.pi-step-inner:hover { background: #fff; }
a.pi-step-inner:focus-visible { outline: 2px solid var(--step-ink); outline-offset: 2px; }

.pi-step-num {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--step-ink) 15%, white);
  font-size: 11px;
}

.pi-step.is-current .pi-step-inner { background: var(--step-ink); color: #fff; }
.pi-step.is-current .pi-step-num { background: rgba(255, 255, 255, 0.25); }

/* ----- hide / show again ----- */.pi-hide {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pi-ink);
  opacity: 0.7;
}

.pi-hide:hover { opacity: 1; background: rgba(255, 255, 255, 0.6); }
.pi-hide:focus-visible { outline: 2px solid var(--pi-ink); opacity: 1; }
.pi-hide .material-symbols-outlined { font-size: 18px; }

.pi-reopen {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 6px 12px;
  border: 0;
  border-radius: 9999px;
  background: var(--pi-wash);
  color: var(--pi-ink);
  font: 600 12.5px/18px 'Inter', sans-serif;
}

.pi-reopen:hover { background: var(--pi-chip); }
.pi-reopen:focus-visible { outline: 2px solid var(--pi-ink); outline-offset: 2px; }
.pi-reopen .material-symbols-outlined { font-size: 16px; }

@media (max-width: 575.98px) {
  .pi { gap: 12px; padding: 14px 44px 14px 14px; }
  .pi-icon { width: 36px; height: 36px; border-radius: 10px; }
  .pi-icon .material-symbols-outlined { font-size: 20px; }
  .pi-heading { font-size: 17px; line-height: 22px; }
  .pi-text { font-size: 13.5px; line-height: 20px; margin-bottom: 10px; }
  .pi-step + .pi-step::before { content: none; }
  .pi-step-inner { font-size: 12px; padding-right: 8px; }
}
</style>
