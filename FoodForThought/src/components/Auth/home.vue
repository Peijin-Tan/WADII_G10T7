<script setup>
/* Landing page (/home): what FoodForThought is for, before someone logs in.
   The content comes from our project proposal (problem, solution, main user journey).
   App.vue hides the main navbar/footer on /home, so this page has its own top bar and footer. */
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import logo from '@/assets/foodforthought-logo-horizontal.svg'

const auth = useAuthStore()

/* ---------- Hero: a small version of the real weekly plan ---------- */
// status: 'cooked' = already cooked, 'cooks' = turns cooked during the page-load animation,
//         'planned', 'skipped', 'open'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']
const WEEK = [
  // Breakfast
  [['Kaya toast', 'cooks'], ['Oats & berries', 'cooks'], ['Banana toast', 'cooks'], ['Oats & berries', 'planned'], ['', 'open'], ['Roti prata', 'planned'], ['Kaya toast', 'planned']],
  // Lunch
  [['Chicken rice', 'cooks'], ['Egg fried rice', 'cooks'], ['Mee goreng', 'planned'], ['Cold soba', 'planned'], ['', 'open'], ['Laksa', 'planned'], ['', 'open']],
  // Dinner
  [['Tom yum', 'skipped'], ['Curry chicken', 'cooks'], ['Teriyaki salmon', 'planned'], ['Garlic tofu', 'planned'], ['Pepper beef', 'planned'], ['', 'open'], ['Fish soup', 'planned']],
]

// Order in which the "cooks" cells turn green (day by day, top to bottom)
function cookDelay(row, day) {
  let order = 0
  for (let d = 0; d < 7; d++) {
    for (let r = 0; r < 3; r++) {
      if (d === day && r === row) return 700 + order * 180 // ms
      if (WEEK[r][d][1] === 'cooks') order++
    }
  }
  return 0
}

/* ---------- How it works (a real sequence, so numbered) ---------- */
const STEPS = [
  { title: 'Stock your pantry', text: "Add what's in your fridge and cupboards, with quantities and expiry dates." },
  { title: 'Get suggestions', text: 'Recipes are ranked by how much you already have, how long they take and your dietary needs.' },
  { title: 'Plan the week', text: 'Put recipes into breakfast, lunch and dinner for each day.' },
  { title: 'Shop once', text: 'Your shopping list adds up every ingredient, takes away what you already have and groups the rest.' },
  { title: 'Cook and log it', text: 'Mark meals cooked or skipped. Cooked meals take their ingredients out of your pantry for you.' },
]

/* ---------- Also inside ---------- */
const FEATURES = [
  { icon: 'nutrition', title: 'Nutrition on every recipe', text: 'Calories, protein, sugar and sodium sit right next to the method, so you know what you are eating.' },
  { icon: 'forum', title: 'A community that cooks', text: 'Share what you made, comment on recipes and like the ideas worth trying.' },
  { icon: 'monitoring', title: 'Your month at a glance', text: 'See the recipes you cooked most and which kinds of food are trending with everyone else.' },
]
</script>

<template>
  <div class="lp">
    <!-- ===== Top bar ===== -->
    <header class="lp-bar">
      <div class="lp-wrap lp-bar-inner">
        <RouterLink to="/home" class="lp-logo-link">
          <img :src="logo" alt="FoodForThought" class="lp-logo" />
        </RouterLink>

        <nav class="lp-bar-actions" aria-label="Account">
          <RouterLink v-if="auth.token" to="/dashboard" class="lp-btn lp-btn-primary lp-btn-sm">
            Go to your dashboard
          </RouterLink>
          <template v-else>
            <RouterLink to="/login" class="lp-text-link">Log in</RouterLink>
            <RouterLink to="/register" class="lp-btn lp-btn-primary lp-btn-sm">Sign up</RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <main>
      <!-- ===== Hero ===== -->
      <section class="lp-hero" aria-labelledby="lp-title">
        <div class="lp-wrap lp-hero-inner">
          <div class="lp-hero-copy">
            <h1 id="lp-title" class="lp-title">Less dabao, more dinners you made yourself.</h1>
            <p class="lp-lede">
              FoodForThought turns what is already in your kitchen into a weekly meal plan and one
              shopping list, so a busy week still ends with home-cooked food.
            </p>

            <div class="lp-cta-row">
              <RouterLink v-if="auth.token" to="/dashboard" class="lp-btn lp-btn-primary">
                Go to your dashboard
              </RouterLink>
              <template v-else>
                <RouterLink to="/register" class="lp-btn lp-btn-primary">Create a free account</RouterLink>
                <RouterLink to="/login" class="lp-btn lp-btn-outline">Log in</RouterLink>
              </template>
            </div>
          </div>

          <!-- The product itself: a week filling up with cooked meals (decorative) -->
          <figure class="lp-week" aria-label="Example of a weekly meal plan in FoodForThought">
            <div class="lp-week-head">
              <span class="lp-week-title">This week</span>
              <span class="lp-week-count"><span class="lp-dot is-cooked"></span>6 meals cooked</span>
            </div>

            <div class="lp-week-grid" aria-hidden="true">
              <span></span>
              <span v-for="(d, i) in DAYS" :key="d" class="lp-week-day" :class="{ 'is-today': i === 2 }">{{ d }}</span>

              <template v-for="(slot, row) in SLOTS" :key="slot">
                <span class="lp-week-slot">{{ slot }}</span>
                <span
                  v-for="(cell, day) in WEEK[row]"
                  :key="slot + day"
                  class="lp-cell"
                  :class="[`is-${cell[1]}`, { 'is-today': day === 2 }]"
                  :style="cell[1] === 'cooks' ? { animationDelay: cookDelay(row, day) + 'ms' } : null"
                >
                  <span class="lp-cell-name">{{ cell[1] === 'open' ? '+ Plan' : cell[0] }}</span>
                </span>
              </template>
            </div>

            <figcaption class="lp-week-legend">
              <span><span class="lp-dot is-cooked"></span>Cooked</span>
              <span><span class="lp-dot is-planned"></span>Planned</span>
              <span><span class="lp-dash"></span>Skipped</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <!-- ===== How it works ===== -->
      <section class="lp-how" aria-labelledby="lp-how-title">
        <div class="lp-wrap">
          <h2 id="lp-how-title" class="lp-h2 lp-h2-narrow">From fridge to dinner in five steps</h2>

          <ol class="lp-steps">
            <li v-for="(step, i) in STEPS" :key="step.title" class="lp-step">
              <span class="lp-step-num" aria-hidden="true">{{ i + 1 }}</span>
              <h3 class="lp-step-title">{{ step.title }}</h3>
              <p class="lp-step-text">{{ step.text }}</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- ===== Also inside ===== -->
      <section class="lp-more" aria-labelledby="lp-more-title">
        <div class="lp-wrap lp-more-inner">
          <h2 id="lp-more-title" class="lp-h2">Also inside</h2>

          <ul class="lp-features">
            <li v-for="f in FEATURES" :key="f.title" class="lp-feature">
              <span class="material-symbols-outlined lp-feature-icon" aria-hidden="true">{{ f.icon }}</span>
              <div>
                <h3 class="lp-feature-title">{{ f.title }}</h3>
                <p class="lp-feature-text">{{ f.text }}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- ===== Closing call to action ===== -->
      <section class="lp-close" aria-labelledby="lp-close-title">
        <div class="lp-wrap lp-close-inner">
          <h2 id="lp-close-title" class="lp-close-title">Plan this week's meals tonight.</h2>
          <RouterLink v-if="auth.token" to="/planner" class="lp-btn lp-btn-light">Open your weekly plan</RouterLink>
          <RouterLink v-else to="/register" class="lp-btn lp-btn-light">Create a free account</RouterLink>
        </div>
      </section>
    </main>

    <footer class="lp-footer">
      <div class="lp-wrap lp-footer-inner">
        <img :src="logo" alt="FoodForThought" class="lp-footer-logo" />
        <p class="m-0">
          Made by Group 7 for IS216 Web Application Development at Singapore Management University.
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Brand colours (same values as theme.css; this page sits outside .fft-page) */
.lp {
  --paper: #fafaf3;
  --card: #ffffff;
  --ink: #1a1c18;
  --ink-2: #424842;
  --muted: #727972;
  --line: #e8e9e2;
  --leaf: #32533c;
  --leaf-hover: #4a6b53;
  --sprout: #c7ecce;
  --forest: #01210f;
  --peach: #ffdbcf;
  --peach-ink: #5c2410;

  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font: 400 16px/26px 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.lp-wrap {
  width: min(1160px, 100% - 40px);
  margin-inline: auto;
}

/* ---------- Buttons & links ---------- */
.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid transparent;
  border-radius: 12px;
  padding: 13px 22px;
  font: 600 16px/20px 'Inter', sans-serif;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color 150ms,
    border-color 150ms,
    color 150ms,
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.lp-btn:active {
  transform: scale(0.97);
}

.lp-btn:focus-visible,
.lp-text-link:focus-visible,
.lp-logo-link:focus-visible {
  outline: 2px solid var(--leaf);
  outline-offset: 3px;
}

.lp-btn-sm {
  padding: 9px 16px;
  font-size: 14px;
}

.lp-btn-primary {
  background: var(--leaf);
  color: #fff;
}

.lp-btn-primary:hover {
  background: var(--leaf-hover);
  color: #fff;
}

.lp-btn-outline {
  border-color: #c2c8c0;
  background: var(--card);
  color: var(--leaf);
}

.lp-btn-outline:hover {
  border-color: var(--leaf);
  color: var(--leaf);
}

.lp-btn-light {
  background: var(--paper);
  color: var(--forest);
}

.lp-btn-light:hover {
  background: var(--sprout);
  color: var(--forest);
}

.lp-btn-light:focus-visible {
  outline-color: var(--sprout);
}

.lp-text-link {
  padding: 8px 4px;
  color: var(--ink);
  font: 600 14px/20px 'Inter', sans-serif;
  text-decoration: none;
}

.lp-text-link:hover {
  color: var(--leaf);
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* ---------- Top bar ---------- */
.lp-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgb(250 250 243 / 88%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid transparent;
}

.lp-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
}

.lp-logo {
  display: block;
  height: 36px;
  width: auto;
}

.lp-bar-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* ---------- Hero ---------- */
.lp-hero {
  padding: 56px 0 88px;
}

.lp-hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
  gap: 56px;
  align-items: center;
}

.lp-title {
  margin: 0;
  font: 600 clamp(40px, 5.6vw, 68px) / 1.02 'Outfit', sans-serif;
  letter-spacing: -0.035em;
  text-wrap: balance;
}

.lp-lede {
  max-width: 46ch;
  margin: 24px 0 32px;
  color: var(--ink-2);
  font-size: 19px;
  line-height: 30px;
}

.lp-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* Mini weekly plan */
.lp-week {
  margin: 0;
  padding: 22px 22px 18px;
  border: 1px solid rgb(194 200 192 / 50%);
  border-radius: 24px;
  background: var(--card);
  box-shadow: 0 1px 2px rgb(26 28 24 / 4%), 0 24px 48px -24px rgb(50 83 60 / 28%);
}

.lp-week-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}

.lp-week-title {
  font: 600 18px/24px 'Outfit', sans-serif;
}

.lp-week-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.lp-week-grid {
  display: grid;
  grid-template-columns: 70px repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.lp-week-day {
  padding: 0 4px 4px;
  color: var(--muted);
  font: 500 12px/16px 'Inter', sans-serif;
}

.lp-week-day.is-today {
  color: var(--leaf);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--leaf);
}

.lp-week-slot {
  display: flex;
  align-items: center;
  color: var(--ink-2);
  font-size: 12px;
}

.lp-cell {
  display: flex;
  align-items: flex-start;
  height: 58px;
  padding: 7px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--ink);
  font: 500 11px/14px 'Inter', sans-serif;
  overflow: hidden;
}

.lp-cell-name {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lp-cell.is-cooked {
  border-color: var(--leaf);
  background: var(--leaf);
  color: #fff;
}

/* The one animated moment: these meals get "cooked" one after another when the page opens */
.lp-cell.is-cooks {
  animation: lp-cook 0.35s cubic-bezier(0.23, 1, 0.32, 1) both;
}

.lp-cell.is-today.is-planned {
  border: 1.5px solid var(--leaf);
}

.lp-cell.is-skipped {
  background: transparent;
  color: var(--muted);
}

.lp-cell.is-skipped .lp-cell-name {
  text-decoration: line-through;
}

.lp-cell.is-open {
  align-items: center;
  justify-content: center;
  border-style: dashed;
  border-color: #c2c8c0;
  background: transparent;
  color: var(--muted);
}

@keyframes lp-cook {
  from {
    border-color: var(--line);
    background: var(--card);
    color: var(--ink);
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
  to {
    border-color: var(--leaf);
    background: var(--leaf);
    color: #fff;
    transform: scale(1);
  }
}

.lp-week-legend {
  display: flex;
  gap: 16px;
  margin-top: 14px;
  color: var(--muted);
  font-size: 12px;
}

.lp-week-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lp-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--muted);
}

.lp-dot.is-cooked {
  border-color: var(--leaf);
  background: var(--leaf);
}

.lp-dash {
  display: inline-block;
  width: 10px;
  border-top: 1.5px solid var(--muted);
}

/* ---------- Section headings ---------- */
.lp-h2 {
  margin: 0 0 20px;
  font: 600 clamp(28px, 3.4vw, 40px) / 1.12 'Outfit', sans-serif;
  letter-spacing: -0.025em;
  text-wrap: balance;
}

.lp-h2-narrow {
  max-width: 18ch;
}

/* ---------- How it works ---------- */
.lp-how {
  padding: 88px 0 96px;
  background: var(--card);
  border-block: 1px solid var(--line);
}

.lp-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: none;
}

.lp-step {
  position: relative;
  padding: 24px 24px 0 0;
  border-top: 2px solid var(--line);
}

/* The first step's line is green: "start here" */
.lp-step:first-child {
  border-top-color: var(--leaf);
}

.lp-step-num {
  display: block;
  margin-bottom: 16px;
  color: var(--leaf);
  font: 600 44px/1 'Outfit', sans-serif;
  letter-spacing: -0.03em;
}

.lp-step-title {
  margin: 0 0 8px;
  font: 600 19px/26px 'Outfit', sans-serif;
}

.lp-step-text {
  margin: 0;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 24px;
}

/* ---------- Also inside ---------- */
.lp-more {
  padding: 88px 0 96px;
}

.lp-more-inner {
  display: grid;
  grid-template-columns: minmax(0, 0.6fr) minmax(0, 1.4fr);
  gap: 48px;
}

.lp-features {
  display: grid;
  gap: 28px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-feature {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.lp-feature-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--sprout);
  color: var(--forest);
  font-size: 26px;
}

.lp-feature-title {
  margin: 2px 0 4px;
  font: 600 20px/28px 'Outfit', sans-serif;
}

.lp-feature-text {
  max-width: 56ch;
  margin: 0;
  color: var(--ink-2);
}

/* ---------- Closing band ---------- */
.lp-close {
  padding: 72px 0;
  background: var(--leaf);
  color: #fff;
}

.lp-close-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.lp-close-title {
  margin: 0;
  font: 600 clamp(28px, 3.6vw, 44px) / 1.1 'Outfit', sans-serif;
  letter-spacing: -0.025em;
  color: #fff;
}

/* ---------- Footer ---------- */
.lp-footer {
  padding: 28px 0;
  background: var(--forest);
  color: rgb(255 255 255 / 70%);
  font-size: 13px;
  line-height: 20px;
}

.lp-footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.lp-footer-logo {
  height: 26px;
  width: auto;
  filter: brightness(0) invert(1); /* white version of the logo on the dark footer */
  opacity: 0.85;
}

/* ---------- Tablets ---------- */
@media (max-width: 991.98px) {
  .lp-hero-inner,
  .lp-more-inner {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .lp-steps {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .lp-step {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    column-gap: 16px;
    padding: 20px 0;
  }

  .lp-step-num {
    grid-row: span 2;
    margin: 0;
    font-size: 36px;
  }
}

/* ---------- Phones ---------- */
@media (max-width: 575.98px) {
  .lp-bar-inner {
    height: 64px;
  }

  .lp-logo {
    height: 30px;
  }

  .lp-text-link {
    display: none; /* "Log in" is right below in the hero */
  }

  .lp-hero {
    padding: 28px 0 56px;
  }

  .lp-lede {
    font-size: 17px;
    line-height: 27px;
  }

  .lp-cta-row .lp-btn {
    flex: 1;
  }

  /* The mini week becomes coloured blocks: names don't fit at this width */
  .lp-week {
    padding: 16px 14px 14px;
    border-radius: 18px;
  }

  .lp-week-grid {
    grid-template-columns: 54px repeat(7, minmax(0, 1fr));
    gap: 4px;
  }

  .lp-cell {
    height: 34px;
    padding: 0;
  }

  .lp-cell-name {
    display: none;
  }

  .lp-week-day {
    padding: 0 0 4px;
    text-align: center;
    font-size: 11px;
  }

  .lp-how {
    padding: 64px 0;
  }

  .lp-more {
    padding: 56px 0 64px;
  }

  .lp-close-inner,
  .lp-footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lp-cell.is-cooks {
    animation: none;
    border-color: var(--leaf);
    background: var(--leaf);
    color: #fff;
  }

  .lp-btn {
    transition: none;
  }
}
</style>
