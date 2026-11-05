<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import logo from '@/assets/foodforthought-logo-horizontal.svg'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { initialsOf } from '@/utils/initials'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const showMainNav = computed(() => !['/login', '/register', '/home', '/admindashboard'].includes(route.path))
const isLoggedIn = computed(() => Boolean(auth.token))
const isAdmin = computed(() => isLoggedIn.value && auth.user?.role === 'admin')
const displayName = computed(() => auth.user?.name || 'Your account')
const initials = computed(() => initialsOf(auth.user?.name))

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { to: '/planner', label: 'Weekly Plan', icon: 'calendar_month' },
  { to: '/shoppinglist', label: 'Shopping List', icon: 'shopping_basket' },
  { to: '/pantry', label: 'Pantry', icon: 'kitchen' },
  { to: '/recipes', label: 'Recipes', icon: 'menu_book' },
  { to: '/community', label: 'Community', icon: 'groups' },
]

const menuOpen = ref(false)
const userMenuOpen = ref(false)
const userMenu = ref(null)

watch(() => route.fullPath, () => {
  menuOpen.value = false
  userMenuOpen.value = false
})

function onDocumentClick(e) {
  if (userMenuOpen.value && userMenu.value && !userMenu.value.contains(e.target)) userMenuOpen.value = false
}
function onKeydown(e) {
  if (e.key === 'Escape') {
    userMenuOpen.value = false
    menuOpen.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

function handleLogout() {
  auth.logout()
  menuOpen.value = false
  userMenuOpen.value = false
  router.push('/home')
}
</script>

<template>
  <header v-if="showMainNav" class="app-navbar sticky-top">
    <nav class="navbar navbar-expand-xl app-navbar-bar" aria-label="Main">
      <div class="container-fluid px-3 px-lg-4 app-nav-container">
        <div class="app-nav-row">
          <RouterLink to="/dashboard" class="navbar-brand app-brand">
            <img :src="logo" alt="FoodForThought home" class="app-logo" />
          </RouterLink>

          <button class="navbar-toggler app-toggler" type="button" aria-controls="mainNav" :aria-expanded="menuOpen"
            :aria-label="menuOpen ? 'Close menu' : 'Open menu'" @click="menuOpen = !menuOpen">
            <span class="material-symbols-outlined" aria-hidden="true">{{ menuOpen ? 'close' : 'menu' }}</span>
          </button>
        </div>

        <div id="mainNav" class="collapse navbar-collapse app-collapse" :class="{ show: menuOpen }">
          <!-- Main links: the grey pill only wraps the links, it doesn't stretch across the bar -->
          <ul class="navbar-nav app-nav">
            <li v-for="link in NAV_LINKS" :key="link.to" class="nav-item">
              <RouterLink :to="link.to" class="nav-link app-nav-link">
                <span class="material-symbols-outlined app-nav-icon" aria-hidden="true">{{ link.icon }}</span>
                {{ link.label }}
              </RouterLink>
            </li>
          </ul>

          <!-- Right side: admin tools (admins only), then the account menu or Log in -->
          <div class="app-user-controls">
            <RouterLink v-if="isAdmin" to="/admindashboard" class="app-admin-link" title="Admin dashboard">
              <span class="material-symbols-outlined" aria-hidden="true">admin_panel_settings</span>
              Admin
            </RouterLink>

            <template v-if="isLoggedIn">
              <!-- Desktop: account dropdown -->
              <div ref="userMenu" class="app-user-menu d-none d-xl-block">
                <button type="button" class="app-user-button" :aria-expanded="userMenuOpen" aria-haspopup="menu"
                  :aria-label="`Account menu for ${displayName}`"
                  @click="userMenuOpen = !userMenuOpen">
                  <span class="app-avatar" aria-hidden="true">{{ initials }}</span>
                  <span class="app-user-name">{{ displayName }}</span>
                  <span class="material-symbols-outlined app-user-chevron" aria-hidden="true">expand_more</span>
                </button>
                <div v-if="userMenuOpen" class="app-user-dropdown" role="menu">
                  <RouterLink to="/profile" class="app-menu-item" role="menuitem">
                    <span class="material-symbols-outlined" aria-hidden="true">person</span>Profile
                  </RouterLink>
                  <RouterLink to="/preferences" class="app-menu-item" role="menuitem">
                    <span class="material-symbols-outlined" aria-hidden="true">nutrition</span>Dietary preferences
                  </RouterLink>
                  <hr class="app-menu-divider" />
                  <button type="button" class="app-menu-item app-menu-item--logout" role="menuitem" @click="handleLogout">
                    <span class="material-symbols-outlined" aria-hidden="true">logout</span>Log out
                  </button>
                </div>
              </div>

              <!-- Phone / tablet: the same options, listed in the menu panel -->
              <div class="app-user-panel d-xl-none">
                <div class="app-user-panel-head">
                  <span class="app-avatar" aria-hidden="true">{{ initials }}</span>
                  <span class="app-user-name">{{ displayName }}</span>
                </div>
                <RouterLink to="/profile" class="app-menu-item">
                  <span class="material-symbols-outlined" aria-hidden="true">person</span>Profile
                </RouterLink>
                <RouterLink to="/preferences" class="app-menu-item">
                  <span class="material-symbols-outlined" aria-hidden="true">nutrition</span>Dietary preferences
                </RouterLink>
                <button type="button" class="app-menu-item app-menu-item--logout" @click="handleLogout">
                  <span class="material-symbols-outlined" aria-hidden="true">logout</span>Log out
                </button>
              </div>
            </template>

            <!-- Not logged in -->
            <div v-else class="app-auth-buttons">
              <RouterLink to="/register" class="app-signup-link">Create account</RouterLink>
              <RouterLink to="/login" class="app-login-button">
                <span class="material-symbols-outlined" aria-hidden="true">login</span>
                Log in
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </nav>
  </header>

  <RouterView />

  <!-- themed "Are you sure?" popup, opened from any page with useConfirm() -->
  <ConfirmDialog />

  <footer v-if="showMainNav" class="app-footer">
    <div
      class="container-fluid px-3 px-md-4 py-4 d-flex flex-column flex-md-row align-items-center justify-content-between gap-3 text-center text-md-start">
      <div class="d-flex flex-column flex-md-row align-items-center gap-1 gap-md-2">
        <img :src="logo" alt="FoodForThought" class="app-footer-logo" />
      </div>

      <nav class="d-flex flex-wrap justify-content-center gap-3 gap-md-4" aria-label="Footer">
        <RouterLink v-for="link in NAV_LINKS" :key="link.to" :to="link.to" class="app-footer-link">{{ link.label }}</RouterLink>
      </nav>

      <div class="app-footer-copy">© {{ new Date().getFullYear() }} FoodForThought. All rights reserved.</div>
    </div>
  </footer>
</template>

<style>
body {
  display: block !important;
  max-width: none !important;
  min-width: 0;
}

#app {
  display: flex !important;
   flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
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
  --nav-primary-hover: #4a6b53;
  --nav-primary-container: #4a6b53;
  --nav-on-primary-container: #ffffff;
  --nav-primary-fixed: #c7ecce;

  background: rgba(250, 250, 243, 0.92);
  backdrop-filter: blur(20px);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
  font-family: 'Inter', sans-serif;
}

.app-navbar .material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  line-height: 1;
  display: inline-block;
  user-select: none;
}

.app-navbar-bar { min-height: 72px; }

.app-nav-container { position: relative; }

/* ----- Logo + hamburger ----- */.app-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-shrink: 0;
}

.app-brand {
  display: flex;
  align-items: center;
  margin-right: 0;
  border-radius: 0.5rem;
  transition: opacity 0.18s ease;
}
.app-brand:hover { opacity: 0.85; }
.app-brand:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--nav-primary); }

.app-logo {
  display: block;
  height: clamp(32px, 3vw, 40px);
  width: auto;
}

.app-toggler {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 0.75rem;
  background: var(--nav-surface-low);
  color: var(--nav-on-surface);
  flex-shrink: 0;
}
.app-toggler .material-symbols-outlined { font-size: 26px; }
.app-toggler:focus { box-shadow: none; }
.app-toggler:focus-visible { box-shadow: 0 0 0 2px var(--nav-primary); }

/* ----- Main links ----- */.app-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 4px;
  background: var(--nav-surface-low);
  border-radius: 0.875rem;
}

.app-nav-link {
  display: inline-flex !important;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.85rem !important;
  border-radius: 0.65rem;
  font: 600 0.875rem/1.35 'Inter', sans-serif;
  letter-spacing: 0.01em;
  color: var(--nav-on-surface-variant) !important;
  white-space: nowrap;
  transition: background-color 0.18s ease, color 0.18s ease;
}
.app-nav-icon { font-size: 18px; }
.app-nav-link:hover { background: var(--nav-surface-high); color: var(--nav-on-surface) !important; }
.app-nav-link:focus-visible { outline: 2px solid var(--nav-primary); outline-offset: 1px; }
.app-nav-link.router-link-active {
  background: var(--nav-primary-container);
  color: var(--nav-on-primary-container) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* ----- Right side ----- */.app-user-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.app-admin-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.8rem;
  border: 1.5px solid #3b4a63;
  border-radius: 0.65rem;
  color: #3b4a63;
  font: 600 0.8125rem/1.35 'Inter', sans-serif;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 0.18s, color 0.18s;
}
.app-admin-link .material-symbols-outlined { font-size: 18px; }
.app-admin-link:hover,
.app-admin-link.router-link-active { background: #3b4a63; color: #fff; }
.app-admin-link:focus-visible { outline: 2px solid #3b4a63; outline-offset: 2px; }

.app-avatar {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--nav-primary);
  color: #fff;
  font: 600 13px/1 'Outfit', sans-serif;
  letter-spacing: 0.02em;
  box-shadow: 0 0 0 2px var(--nav-primary-fixed);
}

.app-user-name {
  font: 600 0.875rem/1.3 'Inter', sans-serif;
  color: var(--nav-on-surface);
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-user-menu { position: relative; }
.app-user-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  transition: background-color 0.18s;
}
.app-user-button:hover,
.app-user-button[aria-expanded='true'] { background: var(--nav-surface-low); }
.app-user-button:focus-visible { outline: 2px solid var(--nav-primary); outline-offset: 2px; }
.app-user-chevron { font-size: 20px; color: var(--nav-outline); transition: transform 0.18s; }
.app-user-button[aria-expanded='true'] .app-user-chevron { transform: rotate(180deg); }

.app-user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1040;
  min-width: 220px;
  padding: 6px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(26, 28, 24, 0.16), 0 0 0 1px rgba(26, 28, 24, 0.05);
}

.app-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--nav-on-surface);
  font: 500 0.875rem/1.3 'Inter', sans-serif;
  text-align: left;
  text-decoration: none;
}
.app-menu-item .material-symbols-outlined { font-size: 20px; color: var(--nav-outline); }
.app-menu-item:hover { background: var(--nav-surface-low); color: var(--nav-on-surface); }
.app-menu-item:focus-visible { outline: 2px solid var(--nav-primary); outline-offset: -2px; }
.app-menu-item--logout,
.app-menu-item--logout .material-symbols-outlined { color: #a23e18; }
.app-menu-divider { margin: 4px 6px; border-color: var(--nav-surface-high); opacity: 1; }

.app-auth-buttons { display: flex; align-items: center; gap: 0.5rem; }
.app-signup-link {
  padding: 0.55rem 0.8rem;
  border-radius: 0.65rem;
  color: var(--nav-primary);
  font: 600 0.875rem/1.35 'Inter', sans-serif;
  text-decoration: none;
  white-space: nowrap;
}
.app-signup-link:hover { background: var(--nav-surface-low); color: var(--nav-primary); }
.app-login-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.1rem;
  border-radius: 0.75rem;
  background: var(--nav-primary);
  color: #fff;
  font: 600 0.875rem/1.35 'Inter', sans-serif;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: background-color 0.18s;
}
.app-login-button .material-symbols-outlined { font-size: 18px; }
.app-login-button:hover { background: var(--nav-primary-hover); color: #fff; }
.app-signup-link:focus-visible,
.app-login-button:focus-visible { outline: 2px solid var(--nav-primary); outline-offset: 2px; }

/* ----- Desktop (xl, 1200px+): logo | links (centred) | account ----- */@media (min-width: 1200px) {
  .app-navbar-bar { min-height: 80px; }

  .app-collapse {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

   .app-nav {
    flex: 0 0 auto;
    margin: 0 auto;
  }
}

@media (min-width: 1200px) and (max-width: 1399.98px) {
  .app-nav-link { padding: 0.5rem 0.6rem !important; font-size: 0.8125rem; }
  .app-nav-icon { display: none; }
  .app-user-name { display: none; }
}

/* ----- Phone / tablet (below 1200px): hamburger opens a panel ----- */@media (max-width: 1199.98px) {
  .app-nav-row { width: 100%; }

   .app-navbar .app-collapse {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: calc(100vh - 72px);
    max-height: calc(100dvh - 72px);
    overflow-y: auto;
    padding: 8px 16px 16px;
    background: #fafaf3;
    border-radius: 0 0 1rem 1rem;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
  }

   .app-nav {
    flex-direction: column;
    align-items: flex-start;
    background: transparent;
    padding: 0;
  }

  .app-nav-link { padding: 0.75rem 0.85rem !important; font-size: 0.9375rem; }
  .app-nav-icon { font-size: 20px; }

  .app-user-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--nav-surface-high);
  }

  .app-admin-link { justify-content: center; padding: 0.65rem; }

  .app-user-panel { display: flex; flex-direction: column; gap: 2px; }
  .app-user-panel-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.75rem 0.6rem; }
  .app-user-panel .app-user-name { max-width: none; }

  .app-auth-buttons { flex-direction: column-reverse; align-items: stretch; }
  .app-login-button,
  .app-signup-link { justify-content: center; text-align: center; padding: 0.75rem; }
}

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
