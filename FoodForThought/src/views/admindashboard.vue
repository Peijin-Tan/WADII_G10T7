<script setup>
/* Admin dashboard (/admindashboard, admins only: see the guard in router/index.js).
   Built as a separate "admin console" so it is clearly not a normal page:
   App.vue hides the site navbar/footer here, and this page has its own dark sidebar.

   Sections (kept in the URL as ?tab=users, so a refresh or a shared link opens the same one):
     Overview  - counts from GET /admin/stats, latest comments, most-liked recipes
     Users     - GET /users, PATCH /users/:id/role, DELETE /users/:id
     Recipes   - GET /admin/recipes, DELETE /recipes/:id
     Comments  - GET /comments, DELETE /comments/:id
   Every route also checks for an admin on the server, so hiding this page is not the only protection. */
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { createApi, errorMessage } from '@/services/api'
import { useConfirm } from '@/composables/useConfirm'
import AppAlert from '@/components/ui/AppAlert.vue'
import appIcon from '@/assets/foodforthought-app-icon.svg'

// createApi sends the login token and logs out on 401 (expired login), like the other pages
const api = createApi()
const auth = useAuthStore()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()

/* ---------- Sections ---------- */
const TABS = [
  { key: 'overview', label: 'Overview', icon: 'monitoring', blurb: 'How FoodForThought is being used right now.' },
  { key: 'users', label: 'Users', icon: 'group', blurb: 'Every account. Promote admins or remove accounts.' },
  { key: 'recipes', label: 'Recipes', icon: 'menu_book', blurb: 'Recipes people have shared with the community.' },
  { key: 'comments', label: 'Comments', icon: 'forum', blurb: 'Every comment on every recipe, newest first.' },
]
const TAB_KEYS = TABS.map((t) => t.key)
const activeTab = ref(TAB_KEYS.includes(route.query.tab) ? route.query.tab : 'overview')
const current = computed(() => TABS.find((t) => t.key === activeTab.value))

function openTab(key) {
  activeTab.value = key
  router.replace({ query: key === 'overview' ? {} : { tab: key } })
  ensureLoaded(key)
}

/* ---------- Toast + errors ---------- */
// errorMessage() uses the server's own message when it sends one. Two failures don't send one,
// so name them here instead of showing a vague "Could not load ...".
function adminError(err, fallback) {
  const status = err.response?.status
  if (status === 404 && !err.response?.data?.message) {
    return 'The server does not have this admin route. Restart the backend (in the server folder: npm start) so it loads the latest code.'
  }
  if (status === 429) {
    return 'Too many requests: the server allows 100 requests every 15 minutes per person. Wait a few minutes, or raise "max" in the rateLimit settings in server/index.js.'
  }
  return errorMessage(err, fallback)
}
const errorMsg = ref('')
const toast = ref('')
let toastTimer = null
function showNotice(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 3000)
}

/* ---------- Overview numbers ---------- */
const stats = ref(null)
const statsLoading = ref(true)
const lastUpdated = ref(null)

async function loadStats() {
  try {
    const { data } = await api.get('/admin/stats')
    stats.value = data
    lastUpdated.value = new Date()
  } catch (err) {
    errorMsg.value = adminError(err, 'Could not load the dashboard numbers.')
  } finally {
    statsLoading.value = false
  }
}

const n = (key) => stats.value?.[key] ?? 0
const share = (part) => (n('totalUsers') ? Math.round((n(part) / n('totalUsers')) * 100) : 0)

const kpis = computed(() => [
  { label: 'Total users', value: n('totalUsers'), delta: `+${n('newUsers7d')} in the last 7 days`, icon: 'group', tone: 'blue', tab: 'users' },
  { label: 'Community recipes', value: n('communityRecipes'), delta: 'shared by users', icon: 'menu_book', tone: 'green', tab: 'recipes' },
  { label: 'Comments', value: n('totalComments'), delta: 'across all recipes', icon: 'forum', tone: 'amber', tab: 'comments' },
  { label: 'Likes', value: n('totalLikes'), delta: 'across all recipes', icon: 'favorite', tone: 'rose', tab: null },
])

// Counts on the sidebar links
const navCounts = computed(() => (stats.value
  ? { users: n('totalUsers'), recipes: n('communityRecipes'), comments: n('totalComments') }
  : {}))

/* ---------- Lists (each loads the first time it's needed) ---------- */
const lists = reactive({ users: [], recipes: [], comments: [] })
const listState = reactive({ users: 'idle', recipes: 'idle', comments: 'idle' }) // idle | loading | ready | error
// Recipes: only community recipes (GET /admin/recipes defaults to source=user)
const endpoint = (key) => (key === 'recipes' ? '/admin/recipes' : `/${key}`)

async function loadList(key) {
  listState[key] = 'loading'
  try {
    const { data } = await api.get(endpoint(key))
    lists[key] = data
    listState[key] = 'ready'
  } catch (err) {
    listState[key] = 'error'
    errorMsg.value = adminError(err, `Could not load ${key}.`)
  }
}

function ensureLoaded(key) {
  if (listState[key] === 'idle') loadList(key)
}

// After a delete, refresh what else it changed
function refreshAfterChange({ comments = false } = {}) {
  loadStats()
  if (comments && listState.comments !== 'idle') loadList('comments')
}

// "Refresh" button: numbers + whatever lists are already loaded
const refreshing = ref(false)
async function refreshAll() {
  refreshing.value = true
  await Promise.all([
    loadStats(),
    ...Object.keys(listState).filter((k) => listState[k] !== 'idle').map(loadList),
  ])
  refreshing.value = false
  showNotice('Dashboard refreshed')
}

onMounted(() => {
  loadStats()
  ensureLoaded('comments') // Overview: latest comments
  ensureLoaded('recipes') // Overview: most-liked recipes
  ensureLoaded(activeTab.value)
})

/* ---------- Search, filters, sorting ---------- */
const search = reactive({ users: '', recipes: '', comments: '' })
const roleFilter = ref('all')
const ROLE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'user', label: 'Users' },
  { value: 'admin', label: 'Admins' },
]

// One sort per table. Clicking a column header sorts by it; clicking again flips the direction.
const sort = reactive({
  users: { key: 'createdAt', dir: 'desc' },
  recipes: { key: 'createdAt', dir: 'desc' },
  comments: { key: 'createdAt', dir: 'desc' },
})
function sortBy(table, key) {
  const s = sort[table]
  if (s.key === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc'
  else Object.assign(s, { key, dir: key === 'createdAt' || key.endsWith('Count') ? 'desc' : 'asc' })
}
const ariaSort = (table, key) =>
  sort[table].key === key ? (sort[table].dir === 'asc' ? 'ascending' : 'descending') : 'none'
const sortIcon = (table, key) =>
  sort[table].key !== key ? 'unfold_more' : sort[table].dir === 'asc' ? 'arrow_upward' : 'arrow_downward'

function sorted(rows, { key, dir }, getters = {}) {
  const get = getters[key] || ((r) => r[key])
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a)
    const y = get(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
    return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * sign
  })
}

const needle = (key) => search[key].trim().toLowerCase()
const has = (text, q) => String(text || '').toLowerCase().includes(q)

const visibleUsers = computed(() => {
  const q = needle('users')
  const rows = lists.users.filter((u) =>
    (roleFilter.value === 'all' || u.role === roleFilter.value) &&
    (!q || has(u.name, q) || has(u.email, q)))
  return sorted(rows, sort.users)
})

const visibleRecipes = computed(() => {
  const q = needle('recipes')
  const rows = lists.recipes.filter((r) =>
    !q || has(r.title, q) || has(r.author?.name, q) || has((r.cuisine || []).join(' '), q))
  return sorted(rows, sort.recipes, { author: (r) => r.author?.name || '' })
})

// A deleted user or recipe shows as such
const commentAuthor = (c) => (c.userId ? c.userName || c.userId.name : 'Deleted user')
const commentRecipeId = (c) => c.recipeId?._id || null
const commentRecipe = (c) => c.recipeId?.title || 'Deleted recipe'

const visibleComments = computed(() => {
  const q = needle('comments')
  const rows = lists.comments.filter((c) =>
    !q || has(c.content, q) || has(commentAuthor(c), q) || has(commentRecipe(c), q))
  return sorted(rows, sort.comments, { author: commentAuthor, recipe: commentRecipe })
})

// Overview panels
const latestComments = computed(() => lists.comments.slice(0, 5))
const topRecipes = computed(() =>
  [...lists.recipes].filter((r) => r.likeCount > 0).sort((a, b) => b.likeCount - a.likeCount).slice(0, 5))

/* ---------- Small helpers ---------- */
const DATE_FMT = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
const TIME_FMT = new Intl.DateTimeFormat('en-SG', { hour: 'numeric', minute: '2-digit' })
const formatDate = (d) => (d ? DATE_FMT.format(new Date(d)) : '—')
const initials = (name) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
const isMe = (user) => user._id === auth.user?._id
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function logout() {
  auth.logout()
  router.push('/home')
}

// One action at a time: the id of the row being saved/deleted
const busyId = ref(null)

/* ---------- User actions ---------- */
// Sign-up always creates normal users, so this is how someone becomes an admin
async function changeRole(user) {
  const makeAdmin = user.role !== 'admin'
  const ok = await confirm({
    title: makeAdmin ? `Make ${user.name} an admin?` : `Remove admin from ${user.name}?`,
    message: makeAdmin
      ? 'They will be able to see every user, delete accounts, recipes and comments.'
      : 'They will become a normal user and lose access to this dashboard.',
    confirmText: makeAdmin ? 'Make admin' : 'Remove admin',
    tone: makeAdmin ? 'primary' : 'danger',
    icon: makeAdmin ? 'admin_panel_settings' : 'person_remove',
  })
  if (!ok) return

  busyId.value = user._id
  errorMsg.value = ''
  try {
    const { data } = await api.patch(`/users/${user._id}/role`, { role: makeAdmin ? 'admin' : 'user' })
    user.role = data.role
    showNotice(makeAdmin ? `${user.name} is now an admin` : `${user.name} is now a normal user`)
    loadStats()
  } catch (err) {
    errorMsg.value = adminError(err, "Could not change this user's role.")
  } finally {
    busyId.value = null
  }
}

async function deleteUser(user) {
  const ok = await confirm({
    title: `Delete ${user.name || user.email}?`,
    message: "Their account is removed along with their pantry, meal plans, shopping lists, preferences, comments and likes. Recipes they shared stay. This can't be undone.",
    confirmText: 'Delete user',
  })
  if (!ok) return

  busyId.value = user._id
  errorMsg.value = ''
  try {
    const { data } = await api.delete(`/users/${user._id}`)
    lists.users = lists.users.filter((u) => u._id !== user._id)
    showNotice(`Deleted ${user.name}`)
    refreshAfterChange({ comments: Boolean(data.removed?.comments) })
  } catch (err) {
    errorMsg.value = adminError(err, 'Could not delete this user.')
  } finally {
    busyId.value = null
  }
}

/* ---------- Recipe actions ---------- */
async function deleteRecipe(recipe) {
  const extras = [
    recipe.commentCount && plural(recipe.commentCount, 'comment'),
    recipe.likeCount && plural(recipe.likeCount, 'like'),
  ].filter(Boolean)
  const ok = await confirm({
    title: `Delete "${recipe.title}"?`,
    message:
      (extras.length ? `Its ${extras.join(' and ')} will be deleted too. ` : '') +
      "Anyone who planned it will see \"Recipe no longer available\" in their planner. This can't be undone.",
    confirmText: 'Delete recipe',
  })
  if (!ok) return

  busyId.value = recipe._id
  errorMsg.value = ''
  try {
    await api.delete(`/recipes/${recipe._id}`)
    lists.recipes = lists.recipes.filter((r) => r._id !== recipe._id)
    showNotice(`Deleted "${recipe.title}"`)
    refreshAfterChange({ comments: recipe.commentCount > 0 })
  } catch (err) {
    errorMsg.value = adminError(err, 'Could not delete this recipe.')
  } finally {
    busyId.value = null
  }
}

/* ---------- Comment actions ---------- */
async function deleteComment(comment) {
  const ok = await confirm({
    title: 'Delete this comment?',
    message: `${commentAuthor(comment)}'s comment will be removed from "${commentRecipe(comment)}" for everyone.`,
    confirmText: 'Delete comment',
  })
  if (!ok) return

  busyId.value = comment._id
  errorMsg.value = ''
  try {
    await api.delete(`/comments/${comment._id}`)
    lists.comments = lists.comments.filter((c) => c._id !== comment._id)
    showNotice('Comment deleted')
    refreshAfterChange()
  } catch (err) {
    errorMsg.value = adminError(err, 'Could not delete this comment.')
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="adm">
    <!-- ============ SIDEBAR (top bar on phones) ============ -->
    <aside class="adm-side" aria-label="Admin">
      <div class="adm-brand">
        <img :src="appIcon" alt="" class="adm-brand-icon" />
        <div class="adm-brand-text">
          <span class="adm-brand-name">FoodForThought</span>
          <span class="adm-brand-sub">Admin console</span>
        </div>
        <!-- phones: quick links in the top bar -->
        <div class="adm-brand-actions">
          <RouterLink to="/dashboard" class="adm-icon-btn adm-icon-btn--dark" title="Back to the site" aria-label="Back to the site">
            <span class="material-symbols-outlined">home</span>
          </RouterLink>
          <button type="button" class="adm-icon-btn adm-icon-btn--dark" title="Log out" aria-label="Log out" @click="logout">
            <span class="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>

      <nav class="adm-nav" aria-label="Admin sections">
        <p class="adm-nav-label">Manage</p>
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          class="adm-nav-item"
          :class="{ 'is-active': activeTab === tab.key }"
          :aria-current="activeTab === tab.key ? 'page' : undefined"
          @click="openTab(tab.key)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ tab.icon }}</span>
          <span class="adm-nav-text">{{ tab.label }}</span>
          <span v-if="navCounts[tab.key] !== undefined" class="adm-nav-count">{{ navCounts[tab.key] }}</span>
        </button>
      </nav>

      <div class="adm-side-foot">
        <RouterLink to="/dashboard" class="adm-nav-item">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          <span class="adm-nav-text">Back to the site</span>
        </RouterLink>
        <div class="adm-me">
          <span class="adm-avatar adm-avatar--light" aria-hidden="true">{{ initials(auth.user?.name) }}</span>
          <div class="adm-me-text">
            <span class="adm-me-name">{{ auth.user?.name || 'Admin' }}</span>
            <span class="adm-me-role">Administrator</span>
          </div>
          <button type="button" class="adm-icon-btn adm-icon-btn--dark" title="Log out" aria-label="Log out" @click="logout">
            <span class="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- ============ MAIN ============ -->
    <main class="adm-main">
      <header class="adm-top">
        <div class="adm-top-text">
          <h1 class="adm-eyebrow">Admin Dashboard</h1>
          <h2 class="adm-title">{{ current.label }}</h2>
          <p class="adm-blurb">{{ current.blurb }}</p>
        </div>
        <div class="adm-top-actions">
          <span v-if="lastUpdated" class="adm-updated">Updated {{ TIME_FMT.format(lastUpdated) }}</span>
          <button type="button" class="adm-btn adm-btn--outline" :disabled="refreshing" @click="refreshAll">
            <span class="material-symbols-outlined" :class="{ 'adm-spin': refreshing }">refresh</span>
            Refresh
          </button>
        </div>
      </header>

      <AppAlert v-if="errorMsg" tone="error" title="That didn't work" class="mb-3" @dismiss="errorMsg = ''">
        {{ errorMsg }}
      </AppAlert>

      <!-- ============ OVERVIEW ============ -->
      <section v-if="activeTab === 'overview'" aria-label="Overview">
        <div v-if="statsLoading" class="adm-empty" role="status">
          <span class="material-symbols-outlined adm-spin">progress_activity</span> Loading numbers...
        </div>

        <template v-else-if="stats">
          <div class="adm-kpis">
            <component
              :is="k.tab ? 'button' : 'div'"
              v-for="k in kpis"
              :key="k.label"
              :type="k.tab ? 'button' : undefined"
              class="adm-kpi"
              :class="{ 'adm-kpi--link': k.tab }"
              @click="k.tab && openTab(k.tab)"
            >
              <div class="adm-kpi-head">
                <span class="adm-kpi-label">{{ k.label }}</span>
                <span class="adm-kpi-icon" :class="`tone-${k.tone}`">
                  <span class="material-symbols-outlined" aria-hidden="true">{{ k.icon }}</span>
                </span>
              </div>
              <span class="adm-kpi-value">{{ k.value }}</span>
              <span class="adm-kpi-delta">{{ k.delta }}</span>
            </component>
          </div>

          <div class="adm-grid">
            <!-- Accounts -->
            <div class="adm-panel">
              <div class="adm-panel-head">
                <h3>Accounts</h3>
                <button type="button" class="adm-link-btn" @click="openTab('users')">Manage</button>
              </div>
              <div class="adm-panel-body">
                <div class="adm-stack-bar" role="img"
                  :aria-label="`${n('totalRegularUsers')} regular users and ${n('totalAdmins')} admins`">
                  <span class="seg seg-user" :style="{ width: share('totalRegularUsers') + '%' }"></span>
                  <span class="seg seg-admin" :style="{ width: share('totalAdmins') + '%' }"></span>
                </div>
                <ul class="adm-legend">
                  <li><span class="dot seg-user"></span>Regular users<strong>{{ n('totalRegularUsers') }}</strong></li>
                  <li><span class="dot seg-admin"></span>Admins<strong>{{ n('totalAdmins') }}</strong></li>
                </ul>
                <dl class="adm-mini-stats">
                  <div><dt>New in 7 days</dt><dd>{{ n('newUsers7d') }}</dd></div>
                  <div><dt>New in 30 days</dt><dd>{{ n('newUsers30d') }}</dd></div>
                </dl>
              </div>
            </div>

            <!-- Most liked -->
            <div class="adm-panel">
              <div class="adm-panel-head">
                <h3>Most-liked community recipes</h3>
                <button type="button" class="adm-link-btn" @click="openTab('recipes')">View all</button>
              </div>
              <p v-if="listState.recipes === 'loading'" class="adm-panel-note">Loading...</p>
              <p v-else-if="topRecipes.length === 0" class="adm-panel-note">No likes yet.</p>
              <ol v-else class="adm-rank">
                <li v-for="(r, i) in topRecipes" :key="r._id">
                  <span class="adm-rank-num">{{ i + 1 }}</span>
                  <RouterLink :to="`/recipes/${r._id}`" class="adm-rank-title">{{ r.title }}</RouterLink>
                  <span class="adm-num"><span class="material-symbols-outlined">favorite</span>{{ r.likeCount }}</span>
                </li>
              </ol>
            </div>

            <!-- Latest comments -->
            <div class="adm-panel adm-panel--wide">
              <div class="adm-panel-head">
                <h3>Latest comments</h3>
                <button type="button" class="adm-link-btn" @click="openTab('comments')">View all</button>
              </div>
              <p v-if="listState.comments === 'loading'" class="adm-panel-note">Loading...</p>
              <p v-else-if="latestComments.length === 0" class="adm-panel-note">No comments yet.</p>
              <ul v-else class="adm-feed">
                <li v-for="c in latestComments" :key="c._id">
                  <span class="adm-avatar" aria-hidden="true">{{ initials(commentAuthor(c)) }}</span>
                  <div class="adm-feed-main">
                    <div class="adm-feed-meta">
                      <strong>{{ commentAuthor(c) }}</strong> on
                      <RouterLink v-if="commentRecipeId(c)" :to="`/recipes/${commentRecipeId(c)}`">{{ commentRecipe(c) }}</RouterLink>
                      <span v-else>{{ commentRecipe(c) }}</span>
                    </div>
                    <p class="adm-feed-text">{{ c.content }}</p>
                  </div>
                  <span class="adm-feed-date">{{ formatDate(c.createdAt) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </section>

      <!-- ============ USERS ============ -->
      <section v-else-if="activeTab === 'users'" class="adm-panel" aria-label="Users">
        <div class="adm-toolbar">
          <label class="adm-search">
            <span class="material-symbols-outlined" aria-hidden="true">search</span>
            <input v-model="search.users" type="search" placeholder="Search by name or email" aria-label="Search users" />
          </label>
          <div class="adm-seg" role="group" aria-label="Filter by role">
            <button v-for="f in ROLE_FILTERS" :key="f.value" type="button"
              :class="{ 'is-on': roleFilter === f.value }" :aria-pressed="roleFilter === f.value"
              @click="roleFilter = f.value">{{ f.label }}</button>
          </div>
        </div>

        <div v-if="listState.users === 'loading'" class="adm-empty" role="status">
          <span class="material-symbols-outlined adm-spin">progress_activity</span> Loading users...
        </div>
        <div v-else-if="listState.users === 'ready'" class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th :aria-sort="ariaSort('users', 'name')">
                  <button type="button" class="adm-th" @click="sortBy('users', 'name')">
                    User <span class="material-symbols-outlined">{{ sortIcon('users', 'name') }}</span>
                  </button>
                </th>
                <th class="adm-hide-sm" :aria-sort="ariaSort('users', 'role')">
                  <button type="button" class="adm-th" @click="sortBy('users', 'role')">
                    Role <span class="material-symbols-outlined">{{ sortIcon('users', 'role') }}</span>
                  </button>
                </th>
                <th class="adm-hide-sm" :aria-sort="ariaSort('users', 'createdAt')">
                  <button type="button" class="adm-th" @click="sortBy('users', 'createdAt')">
                    Joined <span class="material-symbols-outlined">{{ sortIcon('users', 'createdAt') }}</span>
                  </button>
                </th>
                <th class="adm-col-actions"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in visibleUsers" :key="user._id" :class="{ 'is-busy': busyId === user._id }">
                <td>
                  <div class="adm-cell-user">
                    <span class="adm-avatar" :class="{ 'adm-avatar--admin': user.role === 'admin' }" aria-hidden="true">
                      {{ initials(user.name) }}
                    </span>
                    <div class="adm-min-0">
                      <div class="adm-cell-title">
                        {{ user.name }}
                        <span v-if="isMe(user)" class="adm-chip adm-chip--outline">You</span>
                        <!-- phones: role sits next to the name (its column is hidden) -->
                        <span v-if="user.role === 'admin'" class="adm-chip adm-chip--indigo adm-show-sm-inline">Admin</span>
                      </div>
                      <div class="adm-cell-sub">{{ user.email }}</div>
                    </div>
                  </div>
                </td>
                <td class="adm-hide-sm">
                  <span class="adm-chip" :class="user.role === 'admin' ? 'adm-chip--indigo' : 'adm-chip--gray'">
                    {{ user.role === 'admin' ? 'Admin' : 'User' }}
                  </span>
                </td>
                <td class="adm-nowrap adm-hide-sm">{{ formatDate(user.createdAt) }}</td>
                <td class="adm-col-actions">
                  <div v-if="!isMe(user)" class="adm-row-actions">
                    <button type="button" class="adm-icon-btn" :disabled="busyId === user._id"
                      :title="user.role === 'admin' ? 'Remove admin' : 'Make admin'"
                      :aria-label="user.role === 'admin' ? `Remove admin from ${user.name}` : `Make ${user.name} an admin`"
                      @click="changeRole(user)">
                      <span class="material-symbols-outlined">
                        {{ user.role === 'admin' ? 'remove_moderator' : 'add_moderator' }}
                      </span>
                    </button>
                    <button type="button" class="adm-icon-btn adm-icon-btn--danger" :disabled="busyId === user._id"
                      title="Delete user" :aria-label="`Delete ${user.name}`" @click="deleteUser(user)">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="visibleUsers.length === 0">
                <td colspan="4" class="adm-empty-row">No users match{{ search.users ? ` "${search.users}"` : '' }}.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="listState.users === 'ready'" class="adm-table-foot">
          Showing {{ visibleUsers.length }} of {{ lists.users.length }} users
        </p>
      </section>

      <!-- ============ RECIPES ============ -->
      <section v-else-if="activeTab === 'recipes'" class="adm-panel" aria-label="Recipes">
        <div class="adm-toolbar">
          <label class="adm-search">
            <span class="material-symbols-outlined" aria-hidden="true">search</span>
            <input v-model="search.recipes" type="search" placeholder="Search by title, author or cuisine" aria-label="Search recipes" />
          </label>
        </div>

        <div v-if="listState.recipes === 'loading'" class="adm-empty" role="status">
          <span class="material-symbols-outlined adm-spin">progress_activity</span> Loading recipes...
        </div>
        <div v-else-if="listState.recipes === 'ready'" class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th :aria-sort="ariaSort('recipes', 'title')">
                  <button type="button" class="adm-th" @click="sortBy('recipes', 'title')">
                    Recipe <span class="material-symbols-outlined">{{ sortIcon('recipes', 'title') }}</span>
                  </button>
                </th>
                <th class="adm-hide-sm" :aria-sort="ariaSort('recipes', 'author')">
                  <button type="button" class="adm-th" @click="sortBy('recipes', 'author')">
                    Author <span class="material-symbols-outlined">{{ sortIcon('recipes', 'author') }}</span>
                  </button>
                </th>
                <th class="adm-num-col adm-hide-md" :aria-sort="ariaSort('recipes', 'commentCount')">
                  <button type="button" class="adm-th" @click="sortBy('recipes', 'commentCount')">
                    Comments <span class="material-symbols-outlined">{{ sortIcon('recipes', 'commentCount') }}</span>
                  </button>
                </th>
                <th class="adm-num-col adm-hide-sm" :aria-sort="ariaSort('recipes', 'likeCount')">
                  <button type="button" class="adm-th" @click="sortBy('recipes', 'likeCount')">
                    Likes <span class="material-symbols-outlined">{{ sortIcon('recipes', 'likeCount') }}</span>
                  </button>
                </th>
                <th class="adm-hide-md" :aria-sort="ariaSort('recipes', 'createdAt')">
                  <button type="button" class="adm-th" @click="sortBy('recipes', 'createdAt')">
                    Added <span class="material-symbols-outlined">{{ sortIcon('recipes', 'createdAt') }}</span>
                  </button>
                </th>
                <th class="adm-col-actions"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="recipe in visibleRecipes" :key="recipe._id" :class="{ 'is-busy': busyId === recipe._id }">
                <td>
                  <div class="adm-cell-user">
                    <img v-recipe-img="recipe.image" alt="" class="adm-thumb" loading="lazy" />
                    <div class="adm-min-0">
                      <RouterLink :to="`/recipes/${recipe._id}`" class="adm-cell-title adm-link">{{ recipe.title }}</RouterLink>
                      <div class="adm-cell-sub">
                        {{ recipe.cuisine.length ? recipe.cuisine.join(', ') : 'No cuisine' }}<template v-if="recipe.totalTime"> · {{ recipe.totalTime }} min</template>
                        <span class="adm-show-sm">{{ recipe.author ? `by ${recipe.author.name}` : 'Deleted user' }} · {{ recipe.likeCount }} likes</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="adm-hide-sm">
                  <span v-if="recipe.author" class="adm-nowrap">{{ recipe.author.name }}</span>
                  <span v-else class="adm-chip adm-chip--gray">Deleted user</span>
                </td>
                <td class="adm-num-col adm-hide-md">{{ recipe.commentCount }}</td>
                <td class="adm-num-col adm-hide-sm">{{ recipe.likeCount }}</td>
                <td class="adm-nowrap adm-hide-md">{{ formatDate(recipe.createdAt) }}</td>
                <td class="adm-col-actions">
                  <div class="adm-row-actions">
                    <RouterLink :to="`/recipes/${recipe._id}`" class="adm-icon-btn" title="View recipe" :aria-label="`View ${recipe.title}`">
                      <span class="material-symbols-outlined">visibility</span>
                    </RouterLink>
                    <button type="button" class="adm-icon-btn adm-icon-btn--danger" :disabled="busyId === recipe._id"
                      title="Delete recipe" :aria-label="`Delete ${recipe.title}`" @click="deleteRecipe(recipe)">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="visibleRecipes.length === 0">
                <td colspan="6" class="adm-empty-row">
                  {{ search.recipes ? `No recipes match "${search.recipes}".` : 'No recipes here yet.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="listState.recipes === 'ready'" class="adm-table-foot">
          Showing {{ visibleRecipes.length }} of {{ lists.recipes.length }} recipes
        </p>
      </section>

      <!-- ============ COMMENTS ============ -->
      <section v-else-if="activeTab === 'comments'" class="adm-panel" aria-label="Comments">
        <div class="adm-toolbar">
          <label class="adm-search">
            <span class="material-symbols-outlined" aria-hidden="true">search</span>
            <input v-model="search.comments" type="search" placeholder="Search comment text, person or recipe" aria-label="Search comments" />
          </label>
        </div>

        <div v-if="listState.comments === 'loading'" class="adm-empty" role="status">
          <span class="material-symbols-outlined adm-spin">progress_activity</span> Loading comments...
        </div>
        <div v-else-if="listState.comments === 'ready'" class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th class="adm-col-wide">Comment</th>
                <th class="adm-hide-md" :aria-sort="ariaSort('comments', 'author')">
                  <button type="button" class="adm-th" @click="sortBy('comments', 'author')">
                    Author <span class="material-symbols-outlined">{{ sortIcon('comments', 'author') }}</span>
                  </button>
                </th>
                <th class="adm-hide-md" :aria-sort="ariaSort('comments', 'recipe')">
                  <button type="button" class="adm-th" @click="sortBy('comments', 'recipe')">
                    Recipe <span class="material-symbols-outlined">{{ sortIcon('comments', 'recipe') }}</span>
                  </button>
                </th>
                <th class="adm-hide-md" :aria-sort="ariaSort('comments', 'createdAt')">
                  <button type="button" class="adm-th" @click="sortBy('comments', 'createdAt')">
                    Posted <span class="material-symbols-outlined">{{ sortIcon('comments', 'createdAt') }}</span>
                  </button>
                </th>
                <th class="adm-col-actions"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in visibleComments" :key="c._id" :class="{ 'is-busy': busyId === c._id }">
                <td class="adm-col-wide">
                  <p class="adm-comment" :title="c.content">{{ c.content }}</p>
                  <!-- phones: the hidden columns, in one line -->
                  <p class="adm-cell-sub adm-show-md">{{ commentAuthor(c) }} on {{ commentRecipe(c) }} · {{ formatDate(c.createdAt) }}</p>
                </td>
                <td class="adm-nowrap adm-hide-md">{{ commentAuthor(c) }}</td>
                <td class="adm-hide-md">
                  <RouterLink v-if="commentRecipeId(c)" :to="`/recipes/${commentRecipeId(c)}`" class="adm-link">{{ commentRecipe(c) }}</RouterLink>
                  <span v-else class="adm-chip adm-chip--gray">Deleted recipe</span>
                </td>
                <td class="adm-nowrap adm-hide-md">{{ formatDate(c.createdAt) }}</td>
                <td class="adm-col-actions">
                  <div class="adm-row-actions">
                    <button type="button" class="adm-icon-btn adm-icon-btn--danger" :disabled="busyId === c._id"
                      title="Delete comment" aria-label="Delete comment" @click="deleteComment(c)">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="visibleComments.length === 0">
                <td colspan="5" class="adm-empty-row">
                  {{ search.comments ? `No comments match "${search.comments}".` : 'No comments yet.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="listState.comments === 'ready'" class="adm-table-foot">
          Showing {{ visibleComments.length }} of {{ lists.comments.length }} comments
        </p>
      </section>
    </main>

    <!-- Toast after an action -->
    <Transition name="adm-toast">
      <div v-if="toast" class="adm-toast" role="status">
        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        {{ toast }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* A cooler, denser "console" look on purpose, so admins can tell at a glance they're not on a normal page.
   Brand green is kept only as the accent. */
.adm {
  --adm-bg: #f3f5f4;
  --adm-surface: #ffffff;
  --adm-line: #e2e6e3;
  --adm-line-soft: #eef1ef;
  --adm-text: #151d18;
  --adm-text-2: #4a554e;
  --adm-muted: #7b867f;
  --adm-side: #0e1712;
  --adm-side-2: #18241d;
  --adm-side-line: #223128;
  --adm-side-text: #b7c4bb;
  --adm-accent: #32533c;
  --adm-accent-2: #4a6b53;
  --adm-glow: #9fdcb1;
  --adm-danger: #c62828;

  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--adm-bg);
  color: var(--adm-text);
  font: 400 14px/20px 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  font-size: 20px;
  user-select: none;
}

/* ===== Sidebar ===== */
.adm-side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px 14px;
  background: var(--adm-side);
  color: var(--adm-side-text);
}
.adm-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 20px;
  border-bottom: 1px solid var(--adm-side-line);
}
.adm-brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
}
.adm-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.adm-brand-name {
  color: #fff;
  font: 600 15px/18px 'Inter', sans-serif;
}
.adm-brand-sub {
  color: var(--adm-glow);
  font: 600 10px/14px 'Inter', sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.adm-brand-actions {
  display: none;
  margin-left: auto;
  gap: 4px;
}

.adm-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 18px;
}
.adm-nav-label {
  margin: 0 0 6px;
  padding: 0 10px;
  color: #6c7a71;
  font: 600 10px/14px 'Inter', sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.adm-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--adm-side-text);
  font: 500 14px/20px 'Inter', sans-serif;
  text-align: left;
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}
.adm-nav-item:hover {
  background: var(--adm-side-2);
  color: #fff;
}
.adm-nav-item.is-active {
  background: var(--adm-side-2);
  color: #fff;
}
.adm-nav-item.is-active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--adm-glow);
}
.adm-nav-item.is-active .material-symbols-outlined {
  color: var(--adm-glow);
}
.adm-nav-item:focus-visible {
  outline: 2px solid var(--adm-glow);
  outline-offset: 1px;
}
.adm-nav-text {
  flex: 1;
}
.adm-nav-count {
  min-width: 24px;
  padding: 1px 7px;
  border-radius: 9999px;
  background: var(--adm-side-line);
  color: #dce6df;
  font: 600 11px/16px 'Inter', sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.adm-side-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.adm-me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 8px 0;
  border-top: 1px solid var(--adm-side-line);
}
.adm-me-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.adm-me-name {
  overflow: hidden;
  color: #fff;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adm-me-role {
  color: #6c7a71;
  font-size: 12px;
}

/* ===== Main ===== */
.adm-main {
  min-width: 0;
  padding: 28px 32px 48px;
}
.adm-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.adm-eyebrow {
  margin: 0 0 2px;
  color: var(--adm-muted);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.adm-title {
  margin: 0;
  font: 700 26px/32px 'Inter', sans-serif;
  letter-spacing: -0.02em;
}
.adm-blurb {
  margin: 4px 0 0;
  color: var(--adm-text-2);
}
.adm-top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.adm-updated {
  color: var(--adm-muted);
  font-size: 12px;
}

/* ===== Buttons ===== */
.adm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: 600 13px/1 'Inter', sans-serif;
  transition: background-color 0.15s, border-color 0.15s;
}
.adm-btn .material-symbols-outlined {
  font-size: 18px;
}
.adm-btn--outline {
  border-color: var(--adm-line);
  background: var(--adm-surface);
  color: var(--adm-text);
}
.adm-btn--outline:hover:not(:disabled) {
  border-color: #c5ccc7;
  background: #fafbfa;
}
.adm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--adm-text-2);
  text-decoration: none;
  transition: background-color 0.15s, color 0.15s;
}
.adm-icon-btn:hover:not(:disabled) {
  background: var(--adm-line-soft);
  color: var(--adm-text);
}
.adm-icon-btn:disabled {
  opacity: 0.4;
}
.adm-icon-btn--danger:hover:not(:disabled) {
  background: #fdecec;
  color: var(--adm-danger);
}
.adm-icon-btn--dark {
  color: var(--adm-side-text);
}
.adm-icon-btn--dark:hover:not(:disabled) {
  background: var(--adm-side-2);
  color: #fff;
}
.adm-icon-btn:focus-visible,
.adm-btn:focus-visible,
.adm-th:focus-visible,
.adm-link-btn:focus-visible {
  outline: 2px solid var(--adm-accent);
  outline-offset: 2px;
}
.adm-link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--adm-accent);
  font: 600 13px/18px 'Inter', sans-serif;
}
.adm-link-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* ===== KPI cards ===== */
.adm-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.adm-kpi {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  border: 1px solid var(--adm-line);
  border-radius: 12px;
  background: var(--adm-surface);
  color: inherit;
  text-align: left;
}
.adm-kpi--link {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.adm-kpi--link:hover {
  border-color: #c5ccc7;
  box-shadow: 0 4px 14px -8px rgb(14 23 18 / 25%);
}
.adm-kpi--link:focus-visible {
  outline: 2px solid var(--adm-accent);
  outline-offset: 2px;
}
.adm-kpi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.adm-kpi-label {
  color: var(--adm-text-2);
  font-weight: 500;
}
.adm-kpi-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
.adm-kpi-icon .material-symbols-outlined {
  font-size: 18px;
}
.adm-kpi-value {
  font: 700 30px/36px 'Inter', sans-serif;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.adm-kpi-delta {
  color: var(--adm-muted);
  font-size: 12px;
}
.tone-blue { background: #e8eefc; color: #2f4fb0; }
.tone-green { background: #e3f3e7; color: #2e6b40; }
.tone-amber { background: #fdf1dc; color: #9a5b00; }
.tone-rose { background: #fde8ec; color: #b4234a; }

/* ===== Panels ===== */
.adm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.adm-panel {
  border: 1px solid var(--adm-line);
  border-radius: 12px;
  background: var(--adm-surface);
  overflow: hidden;
}
.adm-panel--wide {
  grid-column: 1 / -1;
}
.adm-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--adm-line-soft);
}
.adm-panel-head h3 {
  margin: 0;
  font: 600 15px/20px 'Inter', sans-serif;
}
.adm-panel-body {
  padding: 18px;
}
.adm-panel-note {
  margin: 0;
  padding: 18px;
  color: var(--adm-muted);
}

/* Accounts: one stacked bar + legend */
.adm-stack-bar {
  display: flex;
  height: 12px;
  border-radius: 9999px;
  background: var(--adm-line-soft);
  overflow: hidden;
}
.adm-stack-bar .seg {
  height: 100%;
  transition: width 0.4s var(--ease-out, ease);
}
.seg-user { background: var(--adm-accent-2); }
.seg-admin { background: #3b5bdb; }
.adm-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  color: var(--adm-text-2);
}
.adm-legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.adm-legend strong {
  color: var(--adm-text);
  font-variant-numeric: tabular-nums;
}
.adm-legend .dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.adm-mini-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 18px 0 0;
}
.adm-mini-stats div {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--adm-bg);
}
.adm-mini-stats dt {
  color: var(--adm-muted);
  font-size: 12px;
  font-weight: 500;
}
.adm-mini-stats dd {
  margin: 0;
  font: 700 22px/28px 'Inter', sans-serif;
  font-variant-numeric: tabular-nums;
}

/* Most-liked ranking */
.adm-rank {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}
.adm-rank li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 18px;
}
.adm-rank-num {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--adm-line-soft);
  color: var(--adm-text-2);
  font: 600 12px/22px 'Inter', sans-serif;
  text-align: center;
}
.adm-rank-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--adm-text);
  font-weight: 500;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adm-rank-title:hover {
  color: var(--adm-accent);
  text-decoration: underline;
}
.adm-num {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--adm-text-2);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.adm-num .material-symbols-outlined {
  color: #b4234a;
  font-size: 16px;
}

/* Latest comments feed */
.adm-feed {
  margin: 0;
  padding: 0;
  list-style: none;
}
.adm-feed li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--adm-line-soft);
}
.adm-feed li:first-child {
  border-top: 0;
}
.adm-feed-main {
  flex: 1;
  min-width: 0;
}
.adm-feed-meta {
  color: var(--adm-text-2);
}
.adm-feed-meta strong {
  color: var(--adm-text);
}
.adm-feed-meta a {
  color: var(--adm-accent);
  font-weight: 600;
  text-decoration: none;
}
.adm-feed-meta a:hover {
  text-decoration: underline;
}
.adm-feed-text {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--adm-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adm-feed-date {
  flex-shrink: 0;
  color: var(--adm-muted);
  font-size: 12px;
}

/* ===== Toolbar (search + segmented filter) ===== */
.adm-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--adm-line);
}
.adm-search {
  position: relative;
  flex: 1 1 280px;
  max-width: 420px;
  margin: 0;
}
.adm-search .material-symbols-outlined {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--adm-muted);
  pointer-events: none;
}
.adm-search input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  border: 1px solid var(--adm-line);
  border-radius: 8px;
  background: var(--adm-bg);
  color: var(--adm-text);
  font: 400 14px/20px 'Inter', sans-serif;
}
.adm-search input:focus {
  outline: none;
  border-color: var(--adm-accent);
  background: #fff;
  box-shadow: 0 0 0 3px rgb(50 83 60 / 14%);
}
.adm-seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--adm-line-soft);
}
.adm-seg button {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--adm-text-2);
  font: 600 13px/1 'Inter', sans-serif;
  white-space: nowrap;
}
.adm-seg button.is-on {
  background: #fff;
  color: var(--adm-text);
  box-shadow: 0 1px 2px rgb(14 23 18 / 12%);
}
.adm-seg button:focus-visible {
  outline: 2px solid var(--adm-accent);
  outline-offset: 1px;
}

/* ===== Tables ===== */
.adm-table-wrap {
  overflow-x: auto;
}
.adm-table {
  width: 100%;
  border-collapse: collapse;
}
.adm-table th {
  position: sticky;
  top: 0;
  padding: 0 16px;
  height: 40px;
  border-bottom: 1px solid var(--adm-line);
  background: #f8faf9;
  color: var(--adm-muted);
  font: 600 11px/14px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}
.adm-th {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
}
.adm-th .material-symbols-outlined {
  font-size: 15px;
  opacity: 0.45;
}
th[aria-sort='ascending'] .adm-th,
th[aria-sort='descending'] .adm-th {
  color: var(--adm-text);
}
th[aria-sort='ascending'] .adm-th .material-symbols-outlined,
th[aria-sort='descending'] .adm-th .material-symbols-outlined {
  opacity: 1;
}
.adm-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--adm-line-soft);
  color: var(--adm-text-2);
  vertical-align: middle;
}
.adm-table tbody tr {
  transition: background-color 0.12s;
}
.adm-table tbody tr:hover {
  background: #f8faf9;
}
.adm-table tbody tr.is-busy {
  opacity: 0.5;
}
.adm-table tbody tr:last-child td {
  border-bottom: 0;
}
/* numbers line up by place value */
.adm-num-col {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}
.adm-table th.adm-num-col .adm-th {
  flex-direction: row-reverse;
}
.adm-col-actions {
  width: 1%;
  text-align: right !important;
}
.adm-col-wide {
  width: 45%;
  min-width: 260px;
}
.adm-nowrap {
  white-space: nowrap;
}
.adm-row-actions {
  display: inline-flex;
  gap: 2px;
}
.adm-cell-user {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 220px;
}
.adm-min-0 {
  min-width: 0;
}
.adm-cell-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--adm-text);
  font-weight: 600;
}
.adm-cell-sub {
  overflow: hidden;
  color: var(--adm-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adm-link {
  color: var(--adm-text);
  text-decoration: none;
}
.adm-link:hover {
  color: var(--adm-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.adm-comment {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--adm-text);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.adm-thumb {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--adm-line-soft);
  object-fit: cover;
}
.adm-table-foot {
  margin: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--adm-line);
  color: var(--adm-muted);
  font-size: 12px;
}
.adm-empty-row {
  padding: 40px 16px !important;
  color: var(--adm-muted) !important;
  text-align: center;
}

/* ===== Chips + avatars ===== */
.adm-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font: 600 12px/18px 'Inter', sans-serif;
  white-space: nowrap;
}
.adm-chip--gray { background: #eef1ef; color: #4a554e; }
.adm-chip--indigo { background: #e8eefc; color: #2f4fb0; }
.adm-chip--orange { background: #fdeee2; color: #a2470d; }
.adm-chip--outline { box-shadow: inset 0 0 0 1px var(--adm-line); color: var(--adm-muted); font-size: 11px; line-height: 16px; }
.adm-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #e6ebe8;
  color: var(--adm-text-2);
  font: 600 12px/1 'Inter', sans-serif;
}
.adm-avatar--admin {
  background: #3b5bdb;
  color: #fff;
}
.adm-avatar--light {
  background: var(--adm-glow);
  color: var(--adm-side);
}

/* ===== Loading / empty ===== */
.adm-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--adm-muted);
}
.adm-spin {
  animation: adm-spin 0.9s linear infinite;
}
@keyframes adm-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Toast ===== */
.adm-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1080;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--adm-side);
  color: #fff;
  font-weight: 500;
  box-shadow: 0 12px 32px -12px rgb(14 23 18 / 45%);
}
.adm-toast .material-symbols-outlined {
  color: var(--adm-glow);
}
.adm-toast-enter-active,
.adm-toast-leave-active {
  transition: opacity 0.2s, transform 0.2s var(--ease-out, ease);
}
.adm-toast-enter-from,
.adm-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ===== Tablet + phone: sidebar becomes a top bar ===== */
@media (max-width: 991.98px) {
  .adm {
    grid-template-columns: minmax(0, 1fr);
  }
  .adm-side {
    position: sticky;
    z-index: 20;
    height: auto;
    padding: 12px 16px 0;
  }
  .adm-brand {
    padding: 0 0 12px;
  }
  .adm-brand-actions {
    display: flex;
  }
  .adm-nav {
    flex-direction: row;
    gap: 4px;
    padding: 8px 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .adm-nav::-webkit-scrollbar {
    display: none;
  }
  .adm-nav-label,
  .adm-side-foot {
    display: none;
  }
  .adm-nav-item {
    width: auto;
    flex-shrink: 0;
    gap: 8px;
  }
  .adm-nav-item.is-active::before {
    left: 10px;
    right: 10px;
    top: auto;
    bottom: -8px;
    width: auto;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }
  .adm-main {
    padding: 20px 16px 40px;
  }
  .adm-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .adm-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* tablets + phones: fewer table columns so the row actions stay on screen */
.adm-show-sm,
.adm-show-sm-inline,
.adm-show-md {
  display: none;
}
@media (max-width: 1199.98px) {
  .adm-hide-md {
    display: none;
  }
  .adm-show-md {
    display: block;
  }
  .adm-col-wide {
    width: auto;
    min-width: 0;
  }
  .adm-col-wide .adm-cell-sub {
    margin: 4px 0 0;
    white-space: normal;
  }
}
@media (max-width: 575.98px) {
  .adm-hide-sm {
    display: none;
  }
  .adm-show-sm {
    display: block;
  }
  .adm-show-sm-inline {
    display: inline-flex;
  }
  .adm-cell-user,
  .adm-col-wide {
    min-width: 0;
  }
  .adm-cell-sub {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .adm-table td,
  .adm-table th {
    padding-left: 12px;
    padding-right: 12px;
  }
  .adm-kpi {
    padding: 14px;
  }
  .adm-kpi-value {
    font-size: 24px;
    line-height: 30px;
  }
  .adm-top-actions .adm-updated {
    display: none;
  }
  .adm-toast {
    left: 16px;
    right: 16px;
    bottom: 16px;
  }
}
</style>
