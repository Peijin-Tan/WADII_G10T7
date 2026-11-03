<script setup>
/* Profile (/profile, logged-in users only: meta.requiresAuth in router/index.js).
   Shows who is logged in and links to their settings. Styles: assets/forms.css (fp-) + the few below. */
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const displayName = computed(() => auth.user?.name || 'Your account')
const isAdmin = computed(() => auth.user?.role === 'admin')
// "Alex Tan" -> "AT" (same as the navbar avatar, so no external photo is needed)
const initials = computed(() =>
  (auth.user?.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join(''),
)

const settings = computed(() => [
  {
    to: '/preferences',
    icon: 'nutrition',
    title: 'Dietary preferences',
    text: 'Diets and allergens. Recipe suggestions respect these.',
  },
  {
    to: '/change-password',
    icon: 'lock',
    title: 'Change password',
    text: 'Update the password you use to log in.',
  },
  ...(isAdmin.value
    ? [{ to: '/admindashboard', icon: 'admin_panel_settings', title: 'Admin console', text: 'Manage users, recipes and comments.' }]
    : []),
])

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <main class="fp">
    <div class="fp-wrap fp-wrap--narrow">
      <header class="fp-card pf-hero">
        <span class="pf-avatar" aria-hidden="true">{{ initials }}</span>
        <div class="pf-hero-text">
          <h1 class="fp-title">{{ displayName }}</h1>
          <span class="fp-count pf-role" :class="{ 'is-admin': isAdmin }">
            <span class="material-symbols-outlined" aria-hidden="true">{{ isAdmin ? 'shield_person' : 'person' }}</span>
            {{ isAdmin ? 'Admin' : 'Member' }}
          </span>
        </div>
      </header>

      <section class="fp-card pf-settings" aria-labelledby="pf-settings-title">
        <h2 id="pf-settings-title" class="pf-section-title">Settings</h2>
        <ul class="pf-list">
          <li v-for="s in settings" :key="s.to">
            <RouterLink :to="s.to" class="pf-row">
              <span class="fp-bubble" aria-hidden="true">
                <span class="material-symbols-outlined">{{ s.icon }}</span>
              </span>
              <span class="pf-row-text">
                <span class="pf-row-title">{{ s.title }}</span>
                <span class="pf-row-sub">{{ s.text }}</span>
              </span>
              <span class="material-symbols-outlined pf-chevron" aria-hidden="true">chevron_right</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <div class="fp-actions">
        <button type="button" class="fp-btn fp-btn--danger" @click="handleLogout">
          <span class="material-symbols-outlined" aria-hidden="true">logout</span>
          Log out
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.pf-hero {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px;
  background:
    radial-gradient(120% 140% at 100% 0%, rgb(199 236 206 / 55%) 0%, transparent 55%),
    var(--fp-card);
}
.pf-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--fp-leaf);
  color: #fff;
  font: 600 28px/1 'Outfit', sans-serif;
  box-shadow: 0 0 0 4px var(--fp-sprout);
}
.pf-hero-text {
  min-width: 0;
}
.pf-hero-text .fp-title {
  overflow-wrap: anywhere;
}
.pf-role {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}
.pf-role .material-symbols-outlined {
  font-size: 16px;
}
.pf-role.is-admin {
  background: var(--fp-sprout);
  color: var(--fp-leaf);
}
.pf-settings {
  padding: 8px;
}
.pf-section-title {
  margin: 0;
  padding: 12px 14px 6px;
  color: var(--fp-muted);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pf-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.pf-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
  transition: background-color 150ms ease;
}
.pf-row:hover {
  background: var(--fp-surface);
  color: inherit;
}
.pf-row:focus-visible {
  outline: 2px solid var(--fp-leaf);
  outline-offset: -2px;
}
.pf-row-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.pf-row-title {
  font-weight: 600;
}
.pf-row-sub {
  color: var(--fp-muted);
  font-size: 14px;
  line-height: 20px;
}
.pf-chevron {
  color: var(--fp-muted);
}
@media (max-width: 420px) {
  .pf-hero {
    flex-direction: column;
    text-align: center;
  }
}
</style>
