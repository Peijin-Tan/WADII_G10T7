<script setup>
/* Shared layout for the login and register pages.
   Left (desktop only): green brand panel with a headline and a small "today" card, like the landing page.
   Right: the page's form, passed in through the default slot.
   App.vue already hides the main navbar on /login and /register. */
import logo from '@/assets/foodforthought-logo-horizontal.svg'
import appIcon from '@/assets/foodforthought-app-icon.svg'

defineProps({
  headline: { type: String, required: true },
  lede: { type: String, default: '' },
})

// Decorative example of a day in the planner (same meals as the landing page)
const TODAY = [
  { slot: 'Breakfast', meal: 'Kaya toast', status: 'Cooked' },
  { slot: 'Lunch', meal: 'Chicken rice', status: 'Cooked' },
  { slot: 'Dinner', meal: 'Teriyaki salmon', status: 'Planned' },
]
</script>

<template>
  <div class="auth">
    <!-- ===== Brand panel (hidden on phones / tablets) ===== -->
    <aside class="auth-aside">
      <router-link to="/home" class="auth-brand">
        <img :src="appIcon" alt="" class="auth-brand-icon" />
        <span>FoodForThought</span>
      </router-link>

      <div class="auth-aside-copy">
        <h2 class="auth-headline">{{ headline }}</h2>
        <p v-if="lede" class="auth-lede">{{ lede }}</p>

        <div class="auth-today" aria-hidden="true">
          <div class="auth-today-head">
            <span class="auth-today-title">Today</span>
            <span class="auth-today-count">2 of 3 cooked</span>
          </div>
          <ul class="auth-today-list">
            <li v-for="item in TODAY" :key="item.slot" class="auth-today-row">
              <span class="auth-today-slot">{{ item.slot }}</span>
              <span class="auth-today-meal">{{ item.meal }}</span>
              <span class="auth-pill" :class="item.status === 'Cooked' ? 'is-cooked' : 'is-planned'">
                <span v-if="item.status === 'Cooked'" class="material-symbols-outlined">check</span>
                {{ item.status }}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <p class="auth-aside-foot">Made by Group 7 for IS216 at Singapore Management University.</p>
    </aside>

    <!-- ===== Form side ===== -->
    <main class="auth-main">
      <div class="auth-top">
        <router-link to="/home" class="auth-mobile-logo">
          <img :src="logo" alt="FoodForThought home" />
        </router-link>
        <router-link to="/home" class="auth-back">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back to home
        </router-link>
      </div>

      <div class="auth-panel">
        <slot />
      </div>
    </main>
  </div>
</template>

<!-- Not scoped on purpose: these classes are also used by the forms passed into the slot
     (scoped styles don't reach slot content). Every class starts with "auth-" so nothing leaks. -->
<style>
.auth {
  /* Brand colours (same values as theme.css / the landing page) */
  --auth-paper: #fafaf3;
  --auth-surface: #f4f4ed;
  --auth-card: #ffffff;
  --auth-ink: #1a1c18;
  --auth-ink-2: #424842;
  --auth-muted: #727972;
  --auth-line: #c2c8c0;
  --auth-leaf: #32533c;
  --auth-leaf-hover: #4a6b53;
  --auth-sprout: #c7ecce;
  --auth-forest: #01210f;
  --auth-cream: #fbf7ef;
  --auth-error: #ba1a1a;

  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 100vh;
  background: var(--auth-paper);
  color: var(--auth-ink);
  font: 400 15px/24px 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

@media (min-width: 992px) {
  .auth {
    grid-template-columns: minmax(400px, 5fr) 7fr;
  }
}

/* ---------- Brand panel ---------- */
.auth-aside {
  display: none;
}

@media (min-width: 992px) {
  .auth-aside {
    position: sticky;
    top: 0;
    align-self: start;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 40px;
    height: 100vh;
    padding: 36px 48px;
    background:
      radial-gradient(110% 70% at 0% 0%, rgb(74 107 83 / 90%) 0%, transparent 60%),
      radial-gradient(90% 60% at 100% 100%, rgb(1 33 15 / 55%) 0%, transparent 70%),
      var(--auth-leaf);
    color: var(--auth-cream);
    overflow: hidden;
  }
}

.auth-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  align-self: flex-start;
  color: inherit;
  font: 600 20px/1 'Outfit', sans-serif;
  letter-spacing: -0.01em;
  text-decoration: none;
}

.auth-brand:hover {
  color: inherit;
}

.auth-brand-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 15%), 0 2px 8px rgb(1 33 15 / 25%);
}

.auth-aside-copy {
  max-width: 440px;
}

.auth-headline {
  margin: 0;
  font: 600 clamp(34px, 3.3vw, 46px) / 1.08 'Outfit', sans-serif;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.auth-lede {
  max-width: 40ch;
  margin: 18px 0 0;
  color: rgb(251 247 239 / 78%);
  font-size: 16px;
  line-height: 26px;
}

/* Small "today" card */
.auth-today {
  margin-top: 36px;
  padding: 18px 18px 8px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 18px;
  background: rgb(255 255 255 / 6%);
  backdrop-filter: blur(4px);
}

.auth-today-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}

.auth-today-title {
  font: 600 17px/24px 'Outfit', sans-serif;
}

.auth-today-count {
  color: rgb(251 247 239 / 65%);
  font-size: 13px;
}

.auth-today-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.auth-today-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgb(255 255 255 / 9%);
}

.auth-today-row:first-child {
  border-top: 0;
}

.auth-today-slot {
  color: rgb(251 247 239 / 60%);
  font-size: 13px;
}

.auth-today-meal {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.auth-pill .material-symbols-outlined {
  font-size: 15px;
}

.auth-pill.is-cooked {
  background: var(--auth-sprout);
  color: var(--auth-forest);
}

.auth-pill.is-planned {
  box-shadow: inset 0 0 0 1px rgb(251 247 239 / 35%);
  color: var(--auth-cream);
}

.auth-aside-foot {
  margin: 0;
  color: rgb(251 247 239 / 55%);
  font-size: 13px;
  line-height: 20px;
}

/* ---------- Form side ---------- */
.auth-main {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 20px 20px 32px;
}

@media (min-width: 576px) {
  .auth-main {
    padding: 28px 40px 40px;
  }
}

.auth-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 40px;
}

.auth-mobile-logo img {
  display: block;
  width: auto;
  height: 32px;
}

@media (min-width: 992px) {
  .auth-mobile-logo {
    display: none;
  }

  .auth-back {
    margin-left: auto;
  }
}

.auth-back {
  display: inline-flex;
  flex: none;
  white-space: nowrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--auth-ink-2);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  text-decoration: none;
  transition: background-color 150ms ease, color 150ms ease;
}

.auth-back .material-symbols-outlined {
  font-size: 18px;
}

.auth-back:hover {
  background: var(--auth-surface);
  color: var(--auth-leaf);
}

.auth-panel {
  width: 100%;
  max-width: 400px;
  margin: auto;
  padding: 40px 0 24px;
  animation: auth-enter 320ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes auth-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-panel {
    animation: none;
  }
}

.auth-title {
  margin: 0 0 8px;
  font: 600 32px/40px 'Outfit', sans-serif;
  letter-spacing: -0.02em;
}

.auth-sub {
  margin: 0 0 28px;
  color: var(--auth-ink-2);
}

/* ---------- Fields ---------- */
.auth-field {
  margin-bottom: 18px;
}

.auth-label {
  display: block;
  margin-bottom: 6px;
  color: var(--auth-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.auth-input-wrap {
  position: relative;
}

.auth-input {
  display: block;
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--auth-line);
  border-radius: 12px;
  background: var(--auth-card);
  color: var(--auth-ink);
  font: 400 15px/24px 'Inter', sans-serif;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.auth-input::placeholder {
  color: #9aa09a;
}

.auth-input:hover {
  border-color: #a3aaa2;
}

.auth-input:focus {
  outline: none;
  border-color: var(--auth-leaf);
  box-shadow: 0 0 0 4px rgb(50 83 60 / 14%);
}

.auth-input.is-invalid {
  border-color: var(--auth-error);
}

.auth-input.is-invalid:focus {
  box-shadow: 0 0 0 4px rgb(186 26 26 / 12%);
}

.auth-input.has-toggle {
  padding-right: 72px;
}

/* Show / hide password */
.auth-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  translate: 0 -50%;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--auth-leaf);
  font: 600 13px/1 'Inter', sans-serif;
}

.auth-toggle:hover {
  background: var(--auth-surface);
}

.auth-toggle:focus-visible {
  outline: 2px solid var(--auth-leaf);
  outline-offset: 1px;
}

.auth-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
  color: var(--auth-muted);
  font-size: 13px;
  line-height: 18px;
}

.auth-hint .material-symbols-outlined {
  font-size: 17px;
}

.auth-hint.is-error {
  color: var(--auth-error);
}

.auth-hint.is-ok {
  color: var(--auth-leaf);
}

/* ---------- Messages ---------- */
.auth-alert {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 20px;
}

.auth-alert .material-symbols-outlined {
  flex: none;
  font-size: 20px;
}

.auth-alert.is-error {
  background: #ffdad6;
  color: #410002;
}

.auth-alert.is-success {
  background: var(--auth-sprout);
  color: var(--auth-forest);
}

/* ---------- Submit + switch link ---------- */
.auth-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  margin-top: 8px;
  border: 0;
  border-radius: 12px;
  background: var(--auth-leaf);
  color: #fff;
  font: 600 15px/20px 'Inter', sans-serif;
}

.auth-submit:hover:not(:disabled) {
  background: var(--auth-leaf-hover);
}

.auth-submit:focus-visible {
  outline: 2px solid var(--auth-leaf);
  outline-offset: 3px;
}

.auth-submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.auth-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgb(255 255 255 / 40%);
  border-top-color: #fff;
  border-radius: 50%;
  animation: auth-spin 700ms linear infinite;
}

@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}

.auth-switch {
  margin: 24px 0 0;
  color: var(--auth-ink-2);
  font-size: 14px;
  text-align: center;
}

.auth-switch a {
  color: var(--auth-leaf);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: rgb(50 83 60 / 35%);
  text-underline-offset: 3px;
}

.auth-switch a:hover {
  text-decoration-color: currentColor;
}
</style>
