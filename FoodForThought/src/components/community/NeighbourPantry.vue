<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createApi } from '@/services/api'
import { useConfirm } from '@/composables/useConfirm'
import { initialsOf } from '@/utils/initials'

const emit = defineEmits(['counts'])
const api = createApi('/pantry')
const confirm = useConfirm()

/* ---------- Page state ---------- */
const friends = ref([])
const invites = ref({ incoming: [], outgoing: [] })
const requests = ref({ incoming: [], outgoing: [] })
const loading = ref(true)
const loadError = ref('')

const notice = ref(null)
let noticeTimer
function say(text, tone = 'success') {
  notice.value = { text, tone }
  clearTimeout(noticeTimer)
  if (tone === 'success') noticeTimer = setTimeout(() => (notice.value = null), 5000)
}

const busy = ref(new Set())
const isBusy = (key) => busy.value.has(key)
function setBusy(key, on) {
  const next = new Set(busy.value)
  if (on) next.add(key)
  else next.delete(key)
  busy.value = next
}

const errorText = (err, fallback) =>
  err.response?.data?.message || (err.response ? fallback : 'Cannot reach the server. Is it running?')

async function act(key, request, fallback, after) {
  setBusy(key, true)
  try {
    const { data } = await request()
    if (after) await after(data)
    if (data?.message) say(data.message)
    return data
  } catch (err) {
    say(errorText(err, fallback), 'error')
    return null
  } finally {
    setBusy(key, false)
  }
}

async function loadAll() {
  loadError.value = ''
  try {
    const [neighbourRes, requestRes] = await Promise.all([api.get('/neighbours'), api.get('/requests')])
    friends.value = neighbourRes.data.friends || []
    invites.value = neighbourRes.data.invites || { incoming: [], outgoing: [] }
    requests.value = { incoming: requestRes.data.incoming || [], outgoing: requestRes.data.outgoing || [] }

    if (!friends.value.some((f) => f._id === selectedId.value)) selectedId.value = friends.value[0]?._id || ''
  } catch (err) {
    loadError.value = errorText(err, 'Could not load your neighbours.')
  } finally {
    loading.value = false
  }
}

const waitingCount = computed(() => invites.value.incoming.length + requests.value.incoming.length)
watch(waitingCount, (waiting) => emit('counts', { waiting }), { immediate: true })

/* ---------- Finding people + invites ---------- */
const query = ref('')
const results = ref([])
const searching = ref(false)
let searchTimer
let searchSeq = 0

watch(query, (value) => {
  clearTimeout(searchTimer)
  if (value.trim().length < 2) {
    results.value = []
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(runSearch, 300)
})

async function runSearch() {
  const q = query.value.trim()
  if (q.length < 2) return
  const seq = ++searchSeq
  try {
    const { data } = await api.get('/neighbours/search', { params: { q } })
    if (seq === searchSeq) results.value = data.users || []
  } catch (err) {
    if (seq === searchSeq) {
      results.value = []
      say(errorText(err, 'Search failed.'), 'error')
    }
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

const refreshPeople = async () => {
  await loadAll()
  if (query.value.trim().length >= 2) await runSearch()
}

const invite = (user) =>
  act(`invite-${user._id}`, () => api.post(`/friends/${user._id}`), 'Could not send the invite.', refreshPeople)

const answerInvite = (inviteId, action) =>
  act(`invite-${inviteId}`, () => api.patch(`/friends/invites/${inviteId}`, { action }), 'Could not answer the invite.', refreshPeople)

const cancelInvite = (inviteId) =>
  act(`invite-${inviteId}`, () => api.delete(`/friends/invites/${inviteId}`), 'Could not cancel the invite.', refreshPeople)

async function removeFriend(friend) {
  const ok = await confirm({
    title: `Remove ${friend.name}?`,
    message: "You'll stop seeing each other's pantries, and any borrow requests still waiting between you are cancelled. You can invite them again later.",
    confirmText: 'Remove neighbour',
    tone: 'danger',
  })
  if (!ok) return
  await act(`friend-${friend._id}`, () => api.delete(`/friends/${friend._id}`), 'Could not remove this neighbour.', refreshPeople)
}

/* ---------- A neighbour's pantry ---------- */
const PAGE_SIZE = 9
const selectedId = ref('')
const selectedFriend = computed(() => friends.value.find((f) => f._id === selectedId.value) || null)
const firstName = computed(() => (selectedFriend.value?.name || '').split(' ')[0] || 'Your neighbour')

const items = ref([])
const itemsLoading = ref(false)
const itemsError = ref('')
const itemQuery = ref('')
const category = ref('all')
const sort = ref('name')
const shown = ref(PAGE_SIZE)

async function loadPantry() {
  const id = selectedId.value
  items.value = []
  itemsError.value = ''
  if (!id) return
  itemsLoading.value = true
  try {
    const { data } = await api.get(`/neighbours/${id}`)
    if (id === selectedId.value) items.value = data.items || []
  } catch (err) {
    if (id === selectedId.value) itemsError.value = errorText(err, "Could not load this pantry.")
  } finally {
    if (id === selectedId.value) itemsLoading.value = false
  }
}

watch(selectedId, () => {
  cart.value = []
  message.value = ''
  itemQuery.value = ''
  category.value = 'all'
  shown.value = PAGE_SIZE
  loadPantry()
})
watch([itemQuery, category, sort], () => (shown.value = PAGE_SIZE))

const categories = computed(() => [...new Set(items.value.map((i) => i.category || 'other'))].sort())

const filteredItems = computed(() => {
  const q = itemQuery.value.trim().toLowerCase()
  const list = items.value.filter((item) =>
    (!q || item.name.toLowerCase().includes(q)) && (category.value === 'all' || (item.category || 'other') === category.value))
  const time = (d) => (d ? new Date(d).getTime() : Infinity)
  return [...list].sort((a, b) =>
    sort.value === 'expiry'
      ? time(a.expiryDate) - time(b.expiryDate) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name))
})
const visibleItems = computed(() => filteredItems.value.slice(0, shown.value))

function clearFilters() {
  itemQuery.value = ''
  category.value = 'all'
}

/* ---------- Borrow list ---------- */
const cart = ref([])
const message = ref('')

const STEP = { g: 10, ml: 10, kg: 0.1, l: 0.1 }
const START = { g: 100, ml: 100, kg: 0.5, l: 0.5 }
const stepFor = (unit) => STEP[unit] || 1
const round3 = (n) => Math.round(n * 1000) / 1000
const inCart = (item) => cart.value.some((c) => c.itemId === item._id)

function toggleCart(item) {
  if (inCart(item)) {
    cart.value = cart.value.filter((c) => c.itemId !== item._id)
    return
  }
  const available = Number(item.quantity) || 0
  if (available <= 0) return
  cart.value = [...cart.value, {
    itemId: item._id,
    name: item.name,
    unit: item.unit,
    available,
    quantity: Math.min(START[item.unit] || 1, available),
  }]
}

function clampAmount(entry, value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return Math.min(stepFor(entry.unit), entry.available)
  return round3(Math.min(n, entry.available))
}
function setAmount(entry, value) {
  cart.value = cart.value.map((c) => (c.itemId === entry.itemId ? { ...c, quantity: clampAmount(c, value) } : c))
}
const stepAmount = (entry, direction) => setAmount(entry, round3(entry.quantity + direction * stepFor(entry.unit)))

async function sendRequest() {
  if (!cart.value.length || !selectedFriend.value) return
  await act(
    'send',
    () => api.post('/requests', {
      friendId: selectedFriend.value._id,
      items: cart.value.map((c) => ({ itemId: c.itemId, quantity: c.quantity })),
      message: message.value.trim(),
    }),
    'Could not send this request.',
    async () => {
      cart.value = []
      message.value = ''
      await loadAll()
    },
  )
}

/* ---------- Requests ---------- */
const answerRequest = (request, status) =>
  act(`request-${request._id}`, () => api.patch(`/requests/${request._id}`, { status }), 'Could not answer this request.', loadAll)

const cancelRequest = (request) =>
  act(`request-${request._id}`, () => api.delete(`/requests/${request._id}`), 'Could not cancel this request.', loadAll)

const STATUS = {
  pending: { label: 'Waiting', icon: 'schedule', tone: 'waiting' },
  approved: { label: 'Approved', icon: 'check_circle', tone: 'approved' },
  completed: { label: 'Approved', icon: 'check_circle', tone: 'approved' },
  rejected: { label: 'Declined', icon: 'cancel', tone: 'declined' },
  cancelled: { label: 'Cancelled', icon: 'block', tone: 'cancelled' },
}
const statusOf = (request) => STATUS[request.status] || STATUS.pending

/* ---------- Formatting ---------- */
const amount = (quantity, unit) => `${round3(Number(quantity) || 0)} ${unit || 'pcs'}`
const monthYear = (d) => (d ? new Date(d).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' }) : '')
const dayMonth = (d) => new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })

function timeAgo(d) {
  const minutes = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return dayMonth(d)
}

function expiryOf(item) {
  if (!item.expiryDate) return null
  const days = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000)
  return { text: days < 0 ? 'Expired' : `Use by ${dayMonth(item.expiryDate)}`, soon: days <= 3 }
}

onMounted(loadAll)
onBeforeUnmount(() => {
  clearTimeout(noticeTimer)
  clearTimeout(searchTimer)
})
</script>

<template>
  <div class="np">
    <div v-if="notice" class="np-notice" :class="`is-${notice.tone}`" :role="notice.tone === 'error' ? 'alert' : 'status'">
      <span class="material-symbols-outlined" aria-hidden="true">{{ notice.tone === 'error' ? 'error' : 'check_circle' }}</span>
      <span class="np-notice-text">{{ notice.text }}</span>
      <button type="button" class="np-icon-btn" aria-label="Close message" @click="notice = null">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>

    <div v-if="loading" class="np-card np-state" role="status">
      <span class="np-spinner" aria-hidden="true"></span>
      Loading your neighbours...
    </div>

    <div v-else-if="loadError" class="np-card np-state" role="alert">
      <span class="material-symbols-outlined np-state-icon" aria-hidden="true">cloud_off</span>
      <p class="m-0">{{ loadError }}</p>
      <button type="button" class="np-btn np-btn--ghost" @click="loadAll">Try again</button>
    </div>

    <div v-else class="np-layout">
      <!-- ================= Left: people ================= -->
      <aside class="np-side">
        <section class="np-card" aria-labelledby="np-people-title">
          <h2 id="np-people-title" class="np-card-title">
            Neighbours
            <span class="np-count">{{ friends.length }}</span>
          </h2>

          <!-- Find people -->
          <label for="np-search" class="np-label">Add a neighbour</label>
          <div class="np-field">
            <span class="material-symbols-outlined" aria-hidden="true">person_search</span>
            <input
              id="np-search"
              v-model="query"
              type="search"
              class="np-input"
              placeholder="Name or email"
              autocomplete="off"
              aria-describedby="np-search-hint"
            />
            <span v-if="searching" class="np-spinner np-spinner--sm" aria-hidden="true"></span>
          </div>
          <p id="np-search-hint" class="np-hint">
            {{ query.trim().length === 1 ? 'Type at least 2 letters.' : 'They see your pantry only after they accept, and you see theirs.' }}
          </p>

          <ul v-if="results.length" class="np-people np-results" aria-label="Search results">
            <li v-for="user in results" :key="user._id" class="np-person">
              <span class="np-avatar" aria-hidden="true">{{ initialsOf(user.name) }}</span>
              <span class="np-person-text">
                <span class="np-person-name">{{ user.name }}</span>
                <span class="np-person-sub">{{ user.emailHint }}</span>
              </span>
              <button v-if="user.relation === 'none'" type="button" class="np-btn np-btn--primary np-btn--sm"
                :disabled="isBusy(`invite-${user._id}`)" @click="invite(user)">
                <span class="material-symbols-outlined" aria-hidden="true">person_add</span>Invite
              </button>
              <button v-else-if="user.relation === 'invitedYou'" type="button" class="np-btn np-btn--primary np-btn--sm"
                :disabled="isBusy(`invite-${user.inviteId}`)" @click="answerInvite(user.inviteId, 'accept')">
                Accept
              </button>
              <span v-else-if="user.relation === 'invited'" class="np-tag">Invited</span>
              <span v-else class="np-tag np-tag--green">Neighbour</span>
            </li>
          </ul>
          <p v-else-if="query.trim().length >= 2 && !searching" class="np-hint np-hint--box">
            No one found. Try their full email address.
          </p>

          <!-- Invites for you -->
          <div v-if="invites.incoming.length" class="np-block">
            <h3 class="np-block-title">Invites for you</h3>
            <ul class="np-people">
              <li v-for="inv in invites.incoming" :key="inv._id" class="np-person np-person--invite">
                <span class="np-avatar" aria-hidden="true">{{ initialsOf(inv.from.name) }}</span>
                <span class="np-person-text">
                  <span class="np-person-name">{{ inv.from.name }}</span>
                  <span class="np-person-sub">wants to share pantries · {{ timeAgo(inv.createdAt) }}</span>
                </span>
                <span class="np-person-actions">
                  <button type="button" class="np-btn np-btn--primary np-btn--sm" :disabled="isBusy(`invite-${inv._id}`)"
                    @click="answerInvite(inv._id, 'accept')">Accept</button>
                  <button type="button" class="np-btn np-btn--ghost np-btn--sm" :disabled="isBusy(`invite-${inv._id}`)"
                    @click="answerInvite(inv._id, 'decline')">Decline</button>
                </span>
              </li>
            </ul>
          </div>

          <!-- Your neighbours -->
          <div class="np-block">
            <h3 class="np-block-title">Your neighbours</h3>
            <p v-if="!friends.length" class="np-hint np-hint--box">
              No neighbours yet. Invite someone above. Once they accept, you can see each other's pantries and borrow ingredients.
            </p>
            <ul v-else class="np-people">
              <li v-for="friend in friends" :key="friend._id" class="np-person np-person--friend"
                :class="{ 'is-selected': friend._id === selectedId }">
                <button type="button" class="np-person-pick" :aria-pressed="friend._id === selectedId"
                  @click="selectedId = friend._id">
                  <span class="np-avatar" aria-hidden="true">{{ initialsOf(friend.name) }}</span>
                  <span class="np-person-text">
                    <span class="np-person-name">{{ friend.name }}</span>
                    <span class="np-person-sub">Neighbours since {{ monthYear(friend.since) }}</span>
                  </span>
                </button>
                <button type="button" class="np-icon-btn np-icon-btn--danger" :aria-label="`Remove ${friend.name} as a neighbour`"
                  title="Remove neighbour" :disabled="isBusy(`friend-${friend._id}`)" @click="removeFriend(friend)">
                  <span class="material-symbols-outlined" aria-hidden="true">person_remove</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Invites you sent -->
          <div v-if="invites.outgoing.length" class="np-block">
            <h3 class="np-block-title">Invites you sent</h3>
            <ul class="np-people">
              <li v-for="inv in invites.outgoing" :key="inv._id" class="np-person">
                <span class="np-avatar np-avatar--muted" aria-hidden="true">{{ initialsOf(inv.to.name) }}</span>
                <span class="np-person-text">
                  <span class="np-person-name">{{ inv.to.name }}</span>
                  <span class="np-person-sub">Waiting for them to accept</span>
                </span>
                <button type="button" class="np-btn np-btn--ghost np-btn--sm" :disabled="isBusy(`invite-${inv._id}`)"
                  @click="cancelInvite(inv._id)">Cancel</button>
              </li>
            </ul>
          </div>
        </section>
      </aside>

      <!-- ================= Right: requests + pantry ================= -->
      <div class="np-main">
        <!-- Borrow requests waiting for you -->
        <section v-if="requests.incoming.length" class="np-card np-card--attention" aria-labelledby="np-incoming-title">
          <h2 id="np-incoming-title" class="np-card-title">
            Borrow requests for you
            <span class="np-count np-count--alert">{{ requests.incoming.length }}</span>
          </h2>
          <ul class="np-requests">
            <li v-for="req in requests.incoming" :key="req._id" class="np-request">
              <div class="np-request-head">
                <span class="np-avatar" aria-hidden="true">{{ initialsOf(req.requester?.name) }}</span>
                <span class="np-person-text">
                  <span class="np-person-name">{{ req.requester?.name || 'Someone' }} wants to borrow</span>
                  <span class="np-person-sub">{{ timeAgo(req.createdAt) }}</span>
                </span>
              </div>
              <ul class="np-chips" aria-label="Items">
                <li v-for="item in req.items" :key="item.itemId" class="np-chip">
                  {{ item.name }} <strong>{{ amount(item.quantity, item.unit) }}</strong>
                </li>
              </ul>
              <p v-if="req.message" class="np-message">“{{ req.message }}”</p>
              <div class="np-request-actions">
                <button type="button" class="np-btn np-btn--primary np-btn--sm" :disabled="isBusy(`request-${req._id}`)"
                  @click="answerRequest(req, 'approved')">
                  <span class="material-symbols-outlined" aria-hidden="true">check</span>Approve
                </button>
                <button type="button" class="np-btn np-btn--ghost np-btn--sm" :disabled="isBusy(`request-${req._id}`)"
                  @click="answerRequest(req, 'rejected')">Reject</button>
                <span class="np-hint m-0">Approving takes these out of your pantry and adds them to theirs.</span>
              </div>
            </li>
          </ul>
        </section>

        <!-- The selected neighbour's pantry -->
        <section class="np-card" aria-labelledby="np-pantry-title">
          <div v-if="!selectedFriend" class="np-empty">
            <span class="np-empty-icon" aria-hidden="true"><span class="material-symbols-outlined">diversity_3</span></span>
            <h2 id="np-pantry-title" class="np-card-title justify-content-center">Borrow from your neighbours</h2>
            <p>
              Out of eggs halfway through a recipe? Add someone you trust as a neighbour. Once they accept, their pantry
              shows here and you can ask to borrow what you're missing.
            </p>
          </div>

          <template v-else>
            <div class="np-pantry-head">
              <h2 id="np-pantry-title" class="np-card-title">{{ selectedFriend.name }}'s pantry</h2>
              <span v-if="!itemsLoading && !itemsError" class="np-muted">
                {{ items.length }} {{ items.length === 1 ? 'ingredient' : 'ingredients' }}
              </span>
            </div>

            <div v-if="itemsLoading" class="np-state np-state--inline" role="status">
              <span class="np-spinner" aria-hidden="true"></span>Loading ingredients...
            </div>
            <div v-else-if="itemsError" class="np-state np-state--inline" role="alert">
              {{ itemsError }}
              <button type="button" class="np-btn np-btn--ghost np-btn--sm" @click="loadPantry">Try again</button>
            </div>
            <p v-else-if="!items.length" class="np-hint np-hint--box">{{ firstName }}'s pantry is empty right now.</p>

            <template v-else>
              <div class="np-filters">
                <div class="np-field np-field--grow">
                  <span class="material-symbols-outlined" aria-hidden="true">search</span>
                  <label for="np-item-search" class="visually-hidden">Search {{ firstName }}'s pantry</label>
                  <input id="np-item-search" v-model="itemQuery" type="search" class="np-input" placeholder="Search ingredients" />
                </div>
                <label for="np-category" class="visually-hidden">Category</label>
                <select id="np-category" v-model="category" class="np-select">
                  <option value="all">All categories</option>
                  <option v-for="c in categories" :key="c" :value="c">{{ c.charAt(0).toUpperCase() + c.slice(1) }}</option>
                </select>
                <label for="np-sort" class="visually-hidden">Sort by</label>
                <select id="np-sort" v-model="sort" class="np-select">
                  <option value="name">A to Z</option>
                  <option value="expiry">Use soonest</option>
                </select>
              </div>

              <p v-if="!filteredItems.length" class="np-hint np-hint--box">
                Nothing matches.
                <button type="button" class="np-link" @click="clearFilters">Clear filters</button>
              </p>

              <ul v-else class="np-items">
                <li v-for="item in visibleItems" :key="item._id" class="np-item"
                  :class="{ 'is-added': inCart(item), 'is-out': !(item.quantity > 0) }">
                  <div class="np-item-top">
                    <span class="np-item-name">{{ item.name }}</span>
                    <span class="np-tag">{{ item.category }}</span>
                  </div>
                  <p class="np-item-meta">
                    <span>{{ item.quantity > 0 ? `${amount(item.quantity, item.unit)} left` : 'None left' }}</span>
                    <span v-if="expiryOf(item)" :class="{ 'is-soon': expiryOf(item).soon }">· {{ expiryOf(item).text }}</span>
                  </p>
                  <button type="button" class="np-btn np-btn--sm np-item-btn"
                    :class="inCart(item) ? 'np-btn--added' : 'np-btn--ghost'"
                    :disabled="!(item.quantity > 0)" :aria-pressed="inCart(item)" @click="toggleCart(item)">
                    <span class="material-symbols-outlined" aria-hidden="true">{{ inCart(item) ? 'check' : 'add' }}</span>
                    {{ inCart(item) ? 'On your list' : 'Borrow' }}
                  </button>
                </li>
              </ul>

              <div v-if="filteredItems.length > visibleItems.length" class="np-more">
                <button type="button" class="np-btn np-btn--ghost" @click="shown += PAGE_SIZE">
                  Show more ({{ filteredItems.length - visibleItems.length }})
                </button>
              </div>
            </template>
          </template>
        </section>

        <!-- Borrow list -->
        <section v-if="cart.length" class="np-card np-cart" aria-labelledby="np-cart-title">
          <h2 id="np-cart-title" class="np-card-title">
            Borrow list for {{ firstName }}
            <span class="np-count">{{ cart.length }}</span>
          </h2>
          <ul class="np-cart-list">
            <li v-for="entry in cart" :key="entry.itemId" class="np-cart-row">
              <span class="np-cart-name">
                {{ entry.name }}
                <span class="np-person-sub">They have {{ amount(entry.available, entry.unit) }}</span>
              </span>
              <span class="np-stepper">
                <button type="button" class="np-step" :aria-label="`Less ${entry.name}`"
                  :disabled="entry.quantity <= stepFor(entry.unit)" @click="stepAmount(entry, -1)">
                  <span class="material-symbols-outlined" aria-hidden="true">remove</span>
                </button>
                <label :for="`np-qty-${entry.itemId}`" class="visually-hidden">Amount of {{ entry.name }} in {{ entry.unit }}</label>
                <input :id="`np-qty-${entry.itemId}`" :value="entry.quantity" type="number" inputmode="decimal"
                  :step="stepFor(entry.unit)" min="0" :max="entry.available" class="np-step-input"
                  @change="setAmount(entry, $event.target.value); $event.target.value = cart.find((c) => c.itemId === entry.itemId)?.quantity" />
                <span class="np-step-unit">{{ entry.unit }}</span>
                <button type="button" class="np-step" :aria-label="`More ${entry.name}`"
                  :disabled="entry.quantity >= entry.available" @click="stepAmount(entry, 1)">
                  <span class="material-symbols-outlined" aria-hidden="true">add</span>
                </button>
              </span>
              <button type="button" class="np-icon-btn" :aria-label="`Take ${entry.name} off the list`"
                @click="toggleCart({ _id: entry.itemId })">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </li>
          </ul>

          <label for="np-message" class="np-label">Message <span class="np-muted">(optional)</span></label>
          <textarea id="np-message" v-model="message" class="np-input np-textarea" rows="2" maxlength="300"
            placeholder="e.g. Making pancakes tonight, I can drop by at 7pm"></textarea>
          <div class="np-cart-foot">
            <span class="np-muted">{{ message.length }}/300</span>
            <button type="button" class="np-btn np-btn--primary" :disabled="isBusy('send')" @click="sendRequest">
              <span class="material-symbols-outlined" aria-hidden="true">send</span>
              {{ isBusy('send') ? 'Sending...' : 'Send request' }}
            </button>
          </div>
        </section>

        <!-- Requests you sent -->
        <section class="np-card" aria-labelledby="np-mine-title">
          <h2 id="np-mine-title" class="np-card-title">Your borrow requests</h2>
          <p v-if="!requests.outgoing.length" class="np-hint np-hint--box">
            Requests you send show up here with their answer. Answered requests stay for 14 days.
          </p>
          <ul v-else class="np-requests">
            <li v-for="req in requests.outgoing" :key="req._id" class="np-request">
              <div class="np-request-head">
                <span class="np-person-text">
                  <span class="np-person-name">To {{ req.owner?.name || 'a former neighbour' }}</span>
                  <span class="np-person-sub">
                    Sent {{ timeAgo(req.createdAt) }}<template v-if="req.respondedAt && req.status !== 'pending'"> · {{ statusOf(req).label.toLowerCase() }} {{ timeAgo(req.respondedAt) }}</template>
                  </span>
                </span>
                <span class="np-status" :class="`np-status--${statusOf(req).tone}`">
                  <span class="material-symbols-outlined" aria-hidden="true">{{ statusOf(req).icon }}</span>
                  {{ statusOf(req).label }}
                </span>
              </div>
              <ul class="np-chips" aria-label="Items">
                <li v-for="item in req.items" :key="item.itemId" class="np-chip">
                  {{ item.name }} <strong>{{ amount(item.quantity, item.unit) }}</strong>
                </li>
              </ul>
              <p v-if="req.message" class="np-message">“{{ req.message }}”</p>
              <p v-if="req.status === 'approved'" class="np-hint m-0">Added to your pantry.</p>
              <div v-if="req.status === 'pending'" class="np-request-actions">
                <button type="button" class="np-btn np-btn--ghost np-btn--sm" :disabled="isBusy(`request-${req._id}`)"
                  @click="cancelRequest(req)">Cancel request</button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.np {
  --np-primary: #32533c;
  --np-primary-hover: #4a6b53;
  --np-primary-light: #c7ecce;
  --np-primary-soft: #e8f2e8;
  --np-text: #1a1c18;
  --np-muted: #5f665f;
  --np-border: #e2e3dc;
  --np-surface: #f4f4ed;
  --np-danger: #b3261e;
  --np-amber: #8a5a00;
  --np-amber-soft: #fff1d6;
  color: var(--np-text);
  font-family: 'Inter', sans-serif;
}

/* ---------- Layout ---------- */.np-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.np-main {
  display: grid;
  gap: 24px;
  min-width: 0;
}
@media (max-width: 991.98px) {
  .np-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ---------- Cards ---------- */.np-card {
  padding: 20px;
  border: 1px solid var(--np-border);
  border-radius: 16px;
  background: #fff;
}
.np-card--attention {
  border-color: #e9c46a;
  background: #fffaf0;
}
.np-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  font: 600 18px/26px 'Outfit', sans-serif;
}
.np-count {
  min-width: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--np-surface);
  color: var(--np-muted);
  font: 600 12px/22px 'Inter', sans-serif;
  text-align: center;
}
.np-count--alert {
  background: #e9a23b;
  color: #fff;
}
.np-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--np-border);
}
.np-block-title {
  margin: 0 0 8px;
  color: var(--np-muted);
  font: 600 12px/16px 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.np-muted {
  color: var(--np-muted);
  font-size: 13px;
}
.np-hint {
  margin: 6px 0 0;
  color: var(--np-muted);
  font-size: 13px;
  line-height: 19px;
}
.np-hint--box {
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--np-surface);
}
.np-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--np-primary);
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

/* ---------- Message under the tabs ---------- */.np-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 10px 10px 14px;
  border-radius: 12px;
  font-size: 14px;
}
.np-notice.is-success {
  background: var(--np-primary-soft);
  color: #1f3a27;
}
.np-notice.is-error {
  background: #fdecea;
  color: var(--np-danger);
}
.np-notice-text {
  flex: 1;
}

/* ---------- Loading / error / empty ---------- */.np-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  color: var(--np-muted);
  text-align: center;
}
.np-state--inline {
  flex-direction: row;
  justify-content: center;
  padding: 24px 0;
}
.np-state-icon {
  font-size: 32px;
}
.np-empty {
  max-width: 440px;
  margin: 0 auto;
  padding: 28px 0;
  text-align: center;
}
.np-empty p {
  margin: 0;
  color: var(--np-muted);
  font-size: 14px;
  line-height: 22px;
}
.np-empty .np-card-title {
  margin-bottom: 8px;
}
.np-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 12px;
  border-radius: 50%;
  background: var(--np-primary-soft);
  color: var(--np-primary);
}
.np-empty-icon .material-symbols-outlined {
  font-size: 28px;
}
.np-spinner {
  width: 20px;
  height: 20px;
  flex: none;
  border: 2px solid var(--np-border);
  border-top-color: var(--np-primary);
  border-radius: 50%;
  animation: np-spin 0.8s linear infinite;
}
.np-spinner--sm {
  width: 16px;
  height: 16px;
}
@keyframes np-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- Inputs ---------- */.np-label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
}
.np-field {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--np-border);
  border-radius: 12px;
  background: #fff;
  color: var(--np-muted);
}
.np-field:focus-within {
  border-color: var(--np-primary);
  box-shadow: 0 0 0 3px rgba(50, 83, 60, 0.15);
}
.np-field .material-symbols-outlined {
  font-size: 20px;
}
.np-field .np-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: none;
}
.np-input {
  color: var(--np-text);
  font: 400 14px/20px 'Inter', sans-serif;
}
.np-textarea {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--np-border);
  border-radius: 12px;
  resize: vertical;
}
.np-textarea:focus {
  border-color: var(--np-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(50, 83, 60, 0.15);
}
.np-select {
  height: 42px;
  padding: 0 32px 0 12px;
  border: 1px solid var(--np-border);
  border-radius: 12px;
  background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%235f665f' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") no-repeat right 10px center;
  color: var(--np-text);
  font: 400 14px 'Inter', sans-serif;
  appearance: none;
  cursor: pointer;
}
.np-select:focus {
  border-color: var(--np-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(50, 83, 60, 0.15);
}

/* ---------- Buttons ---------- */.np-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  font: 600 14px/1 'Inter', sans-serif;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.np-btn .material-symbols-outlined {
  font-size: 18px;
}
.np-btn--sm {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}
.np-btn--primary {
  background: var(--np-primary);
  color: #fff;
}
.np-btn--primary:hover:not(:disabled) {
  background: var(--np-primary-hover);
}
.np-btn--ghost {
  border-color: var(--np-border);
  background: #fff;
  color: var(--np-text);
}
.np-btn--ghost:hover:not(:disabled) {
  border-color: #c9cbc2;
  background: var(--np-surface);
}
.np-btn--added {
  border-color: var(--np-primary-light);
  background: var(--np-primary-soft);
  color: var(--np-primary);
}
.np-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.np-btn:focus-visible,
.np-icon-btn:focus-visible,
.np-person-pick:focus-visible,
.np-step:focus-visible,
.np-link:focus-visible {
  outline: 2px solid var(--np-primary);
  outline-offset: 2px;
}
.np-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--np-muted);
  cursor: pointer;
}
.np-icon-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: var(--np-text);
}
.np-icon-btn--danger:hover:not(:disabled) {
  background: #fdecea;
  color: var(--np-danger);
}
.np-icon-btn .material-symbols-outlined {
  font-size: 20px;
}

/* ---------- People ---------- */.np-people {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.np-results {
  margin-top: 10px;
  padding: 6px;
  border: 1px solid var(--np-border);
  border-radius: 12px;
}
.np-person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 6px 8px;
  border-radius: 12px;
}
.np-person--invite {
  flex-wrap: wrap;
  background: var(--np-primary-soft);
}
.np-person--friend {
  padding: 0 4px 0 0;
}
.np-person--friend.is-selected {
  background: var(--np-primary-soft);
  box-shadow: inset 3px 0 0 var(--np-primary);
}
.np-person-pick {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.np-person--friend:not(.is-selected):hover {
  background: var(--np-surface);
}
.np-person-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.np-person-name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.np-person-sub {
  display: block;
  color: var(--np-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 17px;
}
.np-person-actions {
  display: flex;
  gap: 6px;
}
.np-person--invite .np-person-actions {
  flex-basis: 100%;
  padding-left: 46px;
}
.np-person--invite .np-person-name,
.np-person--invite .np-person-sub {
  white-space: normal;
}
.np-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 50%;
  background: var(--np-primary);
  color: #fff;
  font: 600 13px/1 'Outfit', sans-serif;
}
.np-avatar--muted {
  background: var(--np-surface);
  color: var(--np-muted);
}
.np-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--np-surface);
  color: var(--np-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-transform: capitalize;
  white-space: nowrap;
}
.np-tag--green {
  background: var(--np-primary-soft);
  color: var(--np-primary);
}

/* ---------- Pantry ---------- */.np-pantry-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
}
.np-pantry-head .np-card-title {
  margin-bottom: 12px;
}
.np-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.np-field--grow {
  flex: 1 1 220px;
}
.np-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.np-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--np-border);
  border-radius: 14px;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.np-item.is-added {
  border-color: var(--np-primary-light);
  background: #f6fbf6;
}
.np-item.is-out {
  background: var(--np-surface);
}
.np-item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.np-item-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.np-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 0 10px;
  color: var(--np-muted);
  font-size: 13px;
}
.np-item-meta .is-soon {
  color: var(--np-amber);
  font-weight: 600;
}
.np-item-btn {
  width: 100%;
  margin-top: auto;
}
.np-more {
  margin-top: 16px;
  text-align: center;
}

/* ---------- Borrow list ---------- */.np-cart {
  border-color: var(--np-primary-light);
}
.np-cart-list {
  display: grid;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}
.np-cart-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 6px 10px 12px;
  border-radius: 12px;
  background: var(--np-surface);
}
.np-cart-name {
  flex: 1 1 140px;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
}
.np-stepper {
  display: inline-flex;
  align-items: center;
  height: 36px;
  border: 1px solid var(--np-border);
  border-radius: 10px;
  background: #fff;
}
.np-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 100%;
  border: 0;
  background: none;
  color: var(--np-primary);
  cursor: pointer;
}
.np-step:disabled {
  color: #b9bdb6;
  cursor: not-allowed;
}
.np-step .material-symbols-outlined {
  font-size: 18px;
}
.np-step-input {
  width: 56px;
  height: 100%;
  border: 0;
  outline: none;
  background: none;
  color: var(--np-text);
  font: 600 14px 'Inter', sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: right;
  -moz-appearance: textfield;
}
.np-step-input::-webkit-outer-spin-button,
.np-step-input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
.np-step-unit {
  padding: 0 4px;
  color: var(--np-muted);
  font-size: 13px;
}
.np-cart-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

/* ---------- Requests ---------- */.np-requests {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.np-request {
  padding: 14px;
  border: 1px solid var(--np-border);
  border-radius: 14px;
  background: #fff;
}
.np-request-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.np-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.np-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--np-surface);
  font-size: 13px;
}
.np-chip strong {
  font-weight: 600;
}
.np-message {
  margin: 10px 0 0;
  padding-left: 10px;
  border-left: 3px solid var(--np-primary-light);
  color: var(--np-muted);
  font-size: 14px;
  font-style: italic;
}
.np-request-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-top: 12px;
}
.np-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 2px 10px 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
}
.np-status .material-symbols-outlined {
  font-size: 16px;
}
.np-status--waiting {
  background: var(--np-amber-soft);
  color: var(--np-amber);
}
.np-status--approved {
  background: var(--np-primary-soft);
  color: var(--np-primary);
}
.np-status--declined {
  background: #fdecea;
  color: var(--np-danger);
}
.np-status--cancelled {
  background: var(--np-surface);
  color: var(--np-muted);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 575.98px) {
  .np-card {
    padding: 16px;
  }
  .np-select {
    flex: 1 1 140px;
  }
  .np-cart-foot {
    flex-direction: column-reverse;
    align-items: stretch;
  }
   .np-cart-name {
    flex-basis: 100%;
  }
  .np-stepper {
    flex: 1;
    justify-content: space-between;
  }
}

@media (prefers-reduced-motion: reduce) {
  .np-spinner {
    animation-duration: 2s;
  }
}
</style>
