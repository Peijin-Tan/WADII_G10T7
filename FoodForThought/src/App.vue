<script setup>
import { ref, computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import logo from '@/assets/foodforthought-logo-horizontal.svg'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const showMainNav = computed(() => !['/login', '/register', '/home'].includes(route.path))
const isAdmin = computed(() => auth.user?.role === 'admin')
const displayName = computed(() => auth.user?.name || 'Guest')
const menuOpen = ref(false)

function handleLogout() {
  auth.logout()
  menuOpen.value = false
  router.push('/home')
}
</script>

<template>
  <header v-if="showMainNav" class="app-navbar sticky-top">
    <nav class="navbar navbar-expand-xl app-navbar-bar">
      <div class="container-fluid px-3 px-lg-4">
        <div class="app-nav-row">
          <RouterLink to="/dashboard" class="navbar-brand app-brand" @click="menuOpen = false">
            <img :src="logo" alt="FoodForThought home" class="app-logo" />
          </RouterLink>

          <button class="navbar-toggler app-toggler" type="button" aria-controls="mainNav" :aria-expanded="menuOpen"
            aria-label="Toggle navigation" @click="menuOpen = !menuOpen">
            <span class="navbar-toggler-icon"></span>
          </button>
        </div>

        <div id="mainNav" class="collapse navbar-collapse" :class="{ show: menuOpen }">
          <div class="app-main-nav">
            <ul class="navbar-nav app-nav">
              <li v-if="isAdmin" class="nav-item">
                <RouterLink to="/admindashboard" class="nav-link app-nav-link" @click="menuOpen = false">Admin
                </RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/planner" class="nav-link app-nav-link" @click="menuOpen = false">Weekly Plan
                </RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/shoppinglist" class="nav-link app-nav-link" @click="menuOpen = false">Shopping List
                </RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/dashboard" class="nav-link app-nav-link" @click="menuOpen = false">Dashboard
                </RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/pantry" class="nav-link app-nav-link" @click="menuOpen = false">Pantry</RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/recipes" class="nav-link app-nav-link" @click="menuOpen = false">Recipes</RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/community" class="nav-link app-nav-link" @click="menuOpen = false">Community
                </RouterLink>
              </li>
            </ul>

            <div class="app-user-controls">
              <div class="d-flex align-items-center gap-3">
                <img class="app-avatar" alt="Profile"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3oG6XLP0L5HhXmr7nV_d_hl50ix4lGiZQ0kuDbP0XtRO1ipuH91kh8Yp7P_pTMQ7fcx3IaXa3zJgpBgg9G8tnEkxK9a4-fNTQ2PCs6G1-DmO1SyppBRpyQVNTPnihBYmU1wy97GDkuqG1mPpF4yuT5Fk3RjOeTAQ0_zSZ6jQP-g7-TSs1Er6zPZC9wADCJEnckhg_EdCUtQB46jPa0yb-JvKtvqoVsY-xFXz5i30" />
                <span class="d-inline d-xl-none d-xxl-inline text-success">{{ displayName }}</span>
              </div>
              <button type="button" class="btn app-logout-button" @click="handleLogout">
                <span class="material-symbols-outlined" aria-hidden="true">logout</span>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  </header>

  <RouterView />

  <footer v-if="showMainNav" class="app-footer">
    <div
      class="container-fluid px-3 px-md-4 py-4 d-flex flex-column flex-md-row align-items-center justify-content-between gap-3 text-center text-md-start">
      <div class="d-flex flex-column flex-md-row align-items-center gap-1 gap-md-2">
        <img :src="logo" alt="FoodForThought" class="app-footer-logo" />
      </div>

      <nav class="d-flex flex-wrap justify-content-center gap-3 gap-md-4">
        <RouterLink to="/planner" class="app-footer-link">Weekly Plan</RouterLink>
        <RouterLink to="/shoppinglist" class="app-footer-link">Shopping List</RouterLink>
        <RouterLink to="/dashboard" class="app-footer-link">Dashboard</RouterLink>
        <RouterLink to="/pantry" class="app-footer-link">Pantry</RouterLink>
        <RouterLink to="/recipes" class="app-footer-link">Recipes</RouterLink>
      </nav>

      <div class="app-footer-copy">© {{ new Date().getFullYear() }} FoodForThought. All rights reserved.</div>
    </div>
  </footer>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

/* Undo the Vue starter layout (main.css turns #app into a 2-column grid at >=1024px) */
body {
  display: block !important;
  max-width: none !important;
  min-width: 0;
}

#app {
  display: flex !important;
  /* column layout so the footer can stick to the bottom */
  flex-direction: column;
  min-height: 100vh;
  grid-template-columns: none !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

.app-navbar {
  --nav-surface-low: #f4f4ed;
  --nav-surface-high: #e8e9e2;
  --nav-on-surface: #1a1c18;
  --nav-on-surface-variant: #424842;
  --nav-outline: #727972;
  --nav-primary: #32533c;
  --nav-primary-container: #4a6b53;
  --nav-on-primary-container: #c5eacc;
  --nav-primary-fixed: #c7ecce;
  --nav-secondary: #a23e18;

  background: rgba(250, 250, 243, 0.92);
  backdrop-filter: blur(20px);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
  font-family: 'Inter', sans-serif;
}

.app-navbar-bar {
  min-height: 72px;
}

@media (min-width: 768px) {
  .app-navbar-bar {
    min-height: 80px;
  }
}

.app-brand {
  display: flex;
  align-items: center;
  margin-right: 0;
  border-radius: 0.5rem;
  transition: opacity 0.18s ease;
}

.app-brand:hover {
  opacity: 0.85;
}

.app-brand:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--nav-primary);
}

/* Logo is about 5:1 (wide), so height drives the size and width follows.
   32px tall on phones (~165px wide), up to 40px on large screens (~205px wide). */
.app-logo {
  display: block;
  height: clamp(32px, 3vw, 40px);
  width: auto;
}

.app-toggler {
  border: 0;
  background: var(--nav-surface-low);
  border-radius: 0.5rem;
  flex-shrink: 0;
}

.app-toggler:focus {
  box-shadow: 0 0 0 2px var(--nav-primary);
}

/* Brand + hamburger row. Its width is set to 100% only when collapsed (see the
   max-width: 1199.98px block below) so it doesn't squash the links on desktop. */
.app-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-shrink: 0;
}

.app-main-nav {
  display: flex;
  align-items: center;
  /* "safe" stops the row from overflowing off the left edge if it ever gets too wide */
  justify-content: safe center;
  width: 100%;
  gap: 1rem;
  flex-wrap: nowrap;
}

.app-nav {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 4px;
  background: var(--nav-surface-low);
  border-radius: 0.5rem;
  min-width: 0;
  margin: 0 auto;
}

.app-user-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-shrink: 0;
  margin-left: auto;
}

.app-nav-link {
  padding: 0.55rem 0.8rem !important;
  border-radius: 0.75rem;
  font: 600 0.875rem/1.35 'Inter', sans-serif;
  letter-spacing: 0.01em;
  color: var(--nav-on-surface-variant) !important;
  white-space: nowrap;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.app-nav-link:hover {
  background: var(--nav-surface-high);
  color: var(--nav-on-surface) !important;
  transform: translateY(-1px);
}

.app-nav-link.router-link-active {
  background: var(--nav-primary-container);
  color: var(--nav-on-primary-container) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* Logout: a muted brick red that sits with the earthy green palette,
   sized and shaped like the nav links so the row lines up */
.app-logout-button {
  --logout-red: #b3261e;
  --logout-red-dark: #8c1d18;

  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  background: var(--logout-red);
  border: 0;
  border-radius: 0.75rem;
  color: #ffffff !important;
  font: 600 0.875rem/1.35 'Inter', sans-serif;
  letter-spacing: 0.01em;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  transition: background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.app-logout-button .material-symbols-outlined {
  font-size: 1.1rem;
}

.app-logout-button:hover {
  background: var(--logout-red-dark);
  color: #ffffff !important;
  box-shadow: 0 4px 10px rgba(140, 29, 24, 0.25);
  transform: translateY(-1px);
}

.app-logout-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* Keyboard focus ring, matching the toggler's focus style */
.app-logout-button:focus-visible {
  background: var(--logout-red-dark);
  color: #ffffff !important;
  box-shadow: 0 0 0 2px #fafaf3, 0 0 0 4px var(--logout-red);
}

/* Collapsed navbar (below xl = 1200px), matching navbar-expand-xl */
@media (max-width: 1199.98px) {
  /* Brand row spans the full bar so the hamburger sits in the right corner */
  .app-nav-row {
    width: 100%;
  }

  /* Open menu floats as a panel under the bar instead of pushing content down */
  .app-navbar .navbar-collapse {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    padding: 8px 16px 16px;
    background: #fafaf3;
    border-radius: 0 0 1rem 1rem;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
  }

  /* Stack the links above the user controls inside the dropdown */
  .app-main-nav {
    flex-direction: column;
    align-items: stretch;
  }

  .app-nav {
    width: 100%;
    align-items: stretch;
  }

  .app-user-controls {
    justify-content: space-between;
    width: 100%;
    margin-left: 0;
    padding-top: 0.25rem;
  }
}

/* Avatar + icon font */
.app-navbar .material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  line-height: 1;
  display: inline-block;
  user-select: none;
}

.app-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 2px var(--nav-primary-fixed);
}

/* Footer (margin-top: auto pushes it to the bottom on short pages) */
.app-footer {
  margin-top: auto;
  background: #f4f4ed;
  box-shadow: 0 -1px 8px rgba(0, 0, 0, 0.02);
  font-family: 'Inter', sans-serif;
}

.app-footer-logo {
  display: block;
  height: 28px;
  width: auto;
}

.app-footer-tagline {
  font: 400 13px/20px 'Inter', sans-serif;
  color: #424842;
}

.app-footer-link {
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.02em;
  color: #424842;
  text-decoration: none;
  transition: color 0.15s;
}

.app-footer-link:hover {
  color: #1a1c18;
}

.app-footer-link.router-link-active {
  color: #32533c;
}

.app-footer-copy {
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.03em;
  color: #727972;
}
</style>