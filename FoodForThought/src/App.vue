<script setup>
import { ref, computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const showMainNav = computed(() => !['/login', '/register', '/home'].includes(route.path))
const menuOpen = ref(false)
</script>

<template>
  <header v-if="showMainNav" class="app-navbar sticky-top">
    <!-- container-fluid = spans all 12 columns edge to edge -->
    <nav class="navbar navbar-expand-lg app-navbar-bar">
      <div class="container-fluid px-3 px-lg-4">
        <RouterLink to="/home" class="navbar-brand app-brand" @click="menuOpen = false">
          🌱 FoodForThought
        </RouterLink>

        <!-- Hamburger: visible below lg (xs + sm) -->
        <button class="navbar-toggler app-toggler" type="button" aria-controls="mainNav" :aria-expanded="menuOpen"
          aria-label="Toggle navigation" @click="menuOpen = !menuOpen">
          <span class="navbar-toggler-icon"></span>
        </button>

        <!-- Collapsible area -->
        <div id="mainNav" class="collapse navbar-collapse" :class="{ show: menuOpen }">
          <ul class="navbar-nav app-nav w-100 flex-grow-1 align-items-md-center ms-md-4 my-3 my-md-0">
            <li class="nav-item">
              <RouterLink to="/admindashboard" class="nav-link app-nav-link" @click="menuOpen = false">Admin Dashboard</RouterLink>
            </li>
            <li class="nav-item">
              <RouterLink to="/planner" class="nav-link app-nav-link" @click="menuOpen = false">Weekly Plan</RouterLink>
            </li>
            <li class="nav-item">
              <RouterLink to="/dashboard" class="nav-link app-nav-link" @click="menuOpen = false">Dashboard</RouterLink>
            </li>
            <li class="nav-item">
              <RouterLink to="/pantry" class="nav-link app-nav-link" @click="menuOpen = false">Pantry</RouterLink>
            </li>
            <li class="nav-item">
              <RouterLink to="/recipes" class="nav-link app-nav-link" @click="menuOpen = false">Recipes</RouterLink>
            </li>
          </ul>

          <div class="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-3 pb-3 pb-md-0">
            <div class="d-flex align-items-center gap-3">
              <img class="app-avatar" alt="Profile"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3oG6XLP0L5HhXmr7nV_d_hl50ix4lGiZQ0kuDbP0XtRO1ipuH91kh8Yp7P_pTMQ7fcx3IaXa3zJgpBgg9G8tnEkxK9a4-fNTQ2PCs6G1-DmO1SyppBRpyQVNTPnihBYmU1wy97GDkuqG1mPpF4yuT5Fk3RjOeTAQ0_zSZ6jQP-g7-TSs1Er6zPZC9wADCJEnckhg_EdCUtQB46jPa0yb-JvKtvqoVsY-xFXz5i30" />
              <span class="d-none d-md-inline text-success">John Doe</span>
            </div>
            <div class="d-flex align-items-center gap-3">
                  <RouterLink to="/home" class="nav-link app-nav-link" @click="menuOpen = false">Logout</RouterLink> 
                </div>
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
        <span class="app-footer-brand">🌱 FoodForThought</span>
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
  font: 500 clamp(1.2rem, 2vw, 2rem)/1.2 'Outfit', sans-serif;
  letter-spacing: -0.01em;
  color: var(--nav-primary);
  white-space: nowrap;
}

.app-brand:hover {
  color: var(--nav-primary-container);
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

/* Links: stacked list on mobile, pill group from md up */
.app-nav-shell {
  flex: 1 1 auto;
  min-width: 0;
}

.app-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}

.app-nav {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--nav-surface-low);
  border-radius: 0.5rem;
  min-width: 0;
}

@media (min-width: 768px) {
  .app-nav {
    flex-direction: row;
  }
}

.app-user-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 0.75rem;
  margin-left: auto;
}

.app-user-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.app-nav-link {
  padding: clamp(0.55rem, 0.8vw, 0.8rem) clamp(0.9rem, 1.8vw, 1.2rem) !important;
  border-radius: 0.75rem;
  font: 600 clamp(0.78rem, 1.2vw, 0.92rem)/1.35 'Inter', sans-serif;
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

/* Mobile: open menu appears as a dropdown panel under the bar */
@media (max-width: 767.98px) {
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

  .app-nav-row {
    flex-direction: column;
    align-items: stretch;
  }

  .app-user-actions {
    justify-content: flex-start;
    width: 100%;
    padding-top: 0.25rem;
  }
}

/* Search */
.app-search {
  width: min(100%, 22rem);
  min-width: 0;
}

@media (min-width: 1200px) {
  .app-search {
    width: 18rem;
  }
}

.app-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--nav-outline);
  pointer-events: none;
}

.app-search-input {
  padding: 8px 16px 8px 40px;
  background: #ffffff;
  border: 0;
  border-radius: 0.5rem;
  font: 400 13px/20px 'Inter', sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.app-search-input:focus {
  background: #ffffff;
  box-shadow: 0 0 0 2px var(--nav-primary);
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
</style>