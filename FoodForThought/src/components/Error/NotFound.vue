<script setup>
// 404 page. The router's catch-all route ('/:pathMatch(.*)*') shows this for any unknown URL.
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

// Logged-in users go back to their dashboard, everyone else to the landing page
const homeLink = computed(() => (auth.token ? '/dashboard' : '/home'))
const homeLabel = computed(() => (auth.token ? 'Go to your dashboard' : 'Go to the home page'))

// Pages people most likely meant to reach
const SUGGESTIONS = [
  { to: '/planner', label: 'Weekly plan', icon: 'calendar_month' },
  { to: '/recipes', label: 'Recipes', icon: 'menu_book' },
  { to: '/pantry', label: 'Pantry', icon: 'kitchen' },
  { to: '/shoppinglist', label: 'Shopping list', icon: 'shopping_basket' },
]
</script>

<template>
  <div class="fft-page nf-page">
    <main class="nf" aria-labelledby="nf-title">
      <!-- An empty plate: "nothing here" -->
      <svg class="nf-plate" viewBox="0 0 200 140" aria-hidden="true">
        <ellipse cx="100" cy="122" rx="70" ry="8" class="nf-shadow" />
        <circle cx="100" cy="70" r="56" class="nf-rim" />
        <circle cx="100" cy="70" r="38" class="nf-well" />
        <path d="M24 30 v34 M18 30 v14 a6 6 0 0 0 12 0 v-14" class="nf-cutlery" />
        <path d="M176 30 c-8 6 -8 22 0 28 v36" class="nf-cutlery" />
      </svg>

      <p class="nf-code">Error 404</p>
      <h1 id="nf-title" class="nf-title">This page isn't on the menu</h1>
      <p class="nf-text">
        We couldn't find
        <code class="nf-path">{{ route.fullPath }}</code>.
        The link may be old, or the address may have a typo.
      </p>

      <RouterLink :to="homeLink" class="nf-btn">
        <span class="material-symbols-outlined" aria-hidden="true">home</span>
        {{ homeLabel }}
      </RouterLink>

      <nav v-if="auth.token" class="nf-links" aria-label="Popular pages">
        <p class="nf-links-label">Or go straight to</p>
        <ul>
          <li v-for="link in SUGGESTIONS" :key="link.to">
            <RouterLink :to="link.to" class="nf-link">
              <span class="material-symbols-outlined" aria-hidden="true">{{ link.icon }}</span>
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
    </main>
  </div>
</template>

<style scoped>
.nf-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 48px 16px 64px;
}

.nf {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 560px;
  text-align: center;
}

/* ---------- Plate illustration ---------- */
.nf-plate {
  width: 200px;
  height: auto;
  margin-bottom: 20px;
}

.nf-shadow {
  fill: var(--fft-surface-high);
}

.nf-rim {
  fill: var(--fft-card);
  stroke: var(--fft-border);
  stroke-width: 2;
}

.nf-well {
  fill: var(--fft-surface-low);
  stroke: var(--fft-surface-high);
  stroke-width: 2;
}

.nf-cutlery {
  fill: none;
  stroke: var(--fft-primary);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- Text ---------- */
.nf-code {
  margin: 0 0 6px;
  color: var(--fft-primary);
  font: 600 14px/20px 'Inter', sans-serif;
}

.nf-title {
  margin: 0;
  font: 600 clamp(30px, 5vw, 44px) / 1.1 'Outfit', sans-serif;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.nf-text {
  margin: 14px 0 28px;
  color: var(--fft-secondary-text);
  font-size: 16px;
  line-height: 26px;
}

.nf-path {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--fft-surface-high);
  color: var(--fft-text);
  font-size: 14px;
  word-break: break-all;
}

/* ---------- Actions ---------- */
.nf-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 22px;
  border-radius: 12px;
  background: var(--fft-primary);
  color: #fff;
  font: 600 15px/20px 'Inter', sans-serif;
  text-decoration: none;
  transition:
    background-color var(--dur-fast, 150ms),
    transform var(--dur-press, 160ms) var(--ease-out, ease);
}

.nf-btn:hover {
  background: var(--fft-primary-hover);
  color: #fff;
}

.nf-btn:active {
  transform: scale(0.97);
}

.nf-btn:focus-visible,
.nf-link:focus-visible {
  outline: 2px solid var(--fft-primary);
  outline-offset: 3px;
}

.nf-links {
  margin-top: 36px;
}

.nf-links-label {
  margin: 0 0 12px;
  color: var(--fft-muted);
  font-size: 14px;
}

.nf-links ul {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.nf-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--fft-border);
  border-radius: 9999px;
  background: var(--fft-card);
  color: var(--fft-text);
  font: 500 14px/20px 'Inter', sans-serif;
  text-decoration: none;
  transition: border-color var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
}

.nf-link:hover {
  border-color: var(--fft-primary);
  color: var(--fft-primary);
}

.nf-link .material-symbols-outlined {
  font-size: 18px;
  color: var(--fft-primary);
}
</style>
