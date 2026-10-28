<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  section: {
    type: String,
    default: 'all'
  }
})

const auth = useAuthStore()

const cuisines = ref([])
const activity = ref([])

const loadingCuisines = ref(true)
const loadingActivity = ref(true)

const cuisineError = ref('')
const activityError = ref('')

// Donut colours
const cuisineColours = [
  '#82B2C0',
  '#F6C7B3',
  '#F0E2C3',
  '#C3DEDD',
  '#DCECE9'
]

const totalCuisineLikes = computed(() => {
  let total = 0

  for (const item of cuisines.value) {
    total += item.likeCount
  }

  return total
})

function cuisinePercentage(count) {
  if (totalCuisineLikes.value === 0) return '0.0'

  return (count / totalCuisineLikes.value * 100).toFixed(1)
}

const cuisinePieBackground = computed(() => {
  if (totalCuisineLikes.value === 0) {
    return '#E9ECEF'
  }

  const slices = []
  let start = 0

  for (let i = 0; i < cuisines.value.length; i++) {
    const percentage =
      cuisines.value[i].likeCount / totalCuisineLikes.value * 100

    const end = start + percentage
    const colour = cuisineColours[i % cuisineColours.length]

    slices.push(`${colour} ${start}% ${end}%`)
    start = end
  }

  return `conic-gradient(${slices.join(', ')})`
})

// Your activity chart colours
const commentColour = '#548FA3'
const likeColour = '#C98368'

const totalComments = computed(() => {
  let total = 0

  for (const day of activity.value) {
    total += day.commentCount
  }

  return total
})

const totalLikes = computed(() => {
  let total = 0

  for (const day of activity.value) {
    total += day.likeCount
  }

  return total
})

// Find the highest value across both chart lines.
const highestActivityCount = computed(() => {
  let highest = 0

  for (const day of activity.value) {
    highest = Math.max(
      highest,
      day.commentCount,
      day.likeCount
    )
  }

  return highest
})

// Four equal intervals, using whole numbers.
const chartMaximum = computed(() => {
  return Math.max(
    4,
    Math.ceil(highestActivityCount.value / 4) * 4
  )
})

const chartTicks = computed(() => {
  const ticks = []

  for (let i = 0; i <= 4; i++) {
    ticks.push({
      y: 40 + i * 35,
      value: chartMaximum.value - i * chartMaximum.value / 4
    })
  }

  return ticks
})

const activityPoints = computed(() => {
  const points = []

  for (let i = 0; i < activity.value.length; i++) {
    const day = activity.value[i]

    const x = activity.value.length === 1
      ? 310
      : 40 + (i / (activity.value.length - 1)) * 540

    points.push({
      x: x,
      commentY: 180 - (day.commentCount / chartMaximum.value) * 140,
      likeY: 180 - (day.likeCount / chartMaximum.value) * 140,
      date: day.date,
      commentCount: day.commentCount,
      likeCount: day.likeCount
    })
  }

  return points
})

const commentLine = computed(() => {
  return activityPoints.value
    .map(point => `${point.x},${point.commentY}`)
    .join(' ')
})

const likeLine = computed(() => {
  return activityPoints.value
    .map(point => `${point.x},${point.likeY}`)
    .join(' ')
})

const activityCharts = computed(() => {
  const charts = [
    {
      key: 'comments',
      label: 'Comments',
      colour: commentColour,
      line: commentLine.value,
      points: activityPoints.value.map(point => ({
        x: point.x,
        y: point.commentY,
        date: point.date,
        count: point.commentCount
      }))
    },
    {
      key: 'likes',
      label: 'Likes',
      colour: likeColour,
      line: likeLine.value,
      points: activityPoints.value.map(point => ({
        x: point.x,
        y: point.likeY,
        date: point.date,
        count: point.likeCount
      }))
    }
  ]

  for (const chart of charts) {
    if (chart.points.length === 0) {
      chart.area = ''
      continue
    }

    const firstPoint = chart.points[0]
    const lastPoint = chart.points[chart.points.length - 1]

    chart.area = [
      `${firstPoint.x},180`,
      chart.line,
      `${lastPoint.x},180`
    ].join(' ')
  }

  return charts
})

const activityDescription = computed(() => {
  return activity.value
    .map(day => {
      return `${formatDate(day.date)}: ${day.commentCount} comments, ${day.likeCount} likes`
    })
    .join('. ')
})

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short'
  })
}

async function loadCuisines() {
  loadingCuisines.value = true
  cuisineError.value = ''

  try {
    const response = await axios.get('/analytics/cuisines', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    cuisines.value = response.data
  } catch (err) {
    cuisineError.value =
      err.response?.data?.message ||
      'Unable to load trending cuisines.'
  } finally {
    loadingCuisines.value = false
  }
}

// Prevent responses from an earlier login replacing current data.
let activityRequest = 0

async function loadActivity() {
  const request = ++activityRequest
  const token = auth.token

  activity.value = []
  activityError.value = ''
  loadingActivity.value = false

  if (!token) {
    activityError.value = 'Please log in to view your activity.'
    return
  }

  loadingActivity.value = true

  try {
    const response = await axios.get('/analytics/activity', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (
      request !== activityRequest ||
      token !== auth.token
    ) {
      return
    }

    activity.value = response.data
  } catch (err) {
    if (
      request !== activityRequest ||
      token !== auth.token
    ) {
      return
    }

    activityError.value =
      err.response?.data?.message ||
      'Unable to load your activity.'
  } finally {
    if (
      request === activityRequest &&
      token === auth.token
    ) {
      loadingActivity.value = false
    }
  }
}

// Reload personal activity when the logged-in account changes.
watch(() => auth.token, () => {
  if (
    props.section === 'all' ||
    props.section === 'activity'
  ) {
    loadActivity()
  }
})

onMounted(() => {
  if (
    props.section === 'all' ||
    props.section === 'cuisines'
  ) {
    loadCuisines()
  }

  if (
    props.section === 'all' ||
    props.section === 'activity'
  ) {
    loadActivity()
  }
})
</script>

<template>
  <div class="row g-4 text-start">
    <!-- Trending cuisines -->
    <div
      v-if="props.section === 'all' || props.section === 'cuisines'"
      class="col-12"
    >
      <section class="analytics-card">
        <div class="panel-header">
          <h2 class="panel-label mb-0">
            Trending cuisines
          </h2>

          <span class="period-label">This month</span>
        </div>

        <div class="panel-body">
          <p
            v-if="loadingCuisines"
            class="text-muted"
            role="status"
          >
            Loading cuisines...
          </p>

          <div v-else-if="cuisineError">
            <p class="text-danger" role="alert">
              {{ cuisineError }}
            </p>

            <button
              type="button"
              class="btn analytics-button btn-sm"
              @click="loadCuisines"
            >
              Try again
            </button>
          </div>

          <p
            v-else-if="totalCuisineLikes === 0"
            class="text-muted small mb-0"
          >
            No cuisine likes recorded this month yet.
          </p>

          <div v-else>
            <p class="chart-introduction">
              Where the community's tastes are heading.
            </p>

            <div class="cuisine-donut mx-auto my-4">
              <div
                class="cuisine-ring"
                :style="{ background: cuisinePieBackground }"
                aria-hidden="true"
              ></div>

              <div class="cuisine-centre">
                <span class="donut-total">
                  {{ cuisines.length }}
                </span>

                <span class="text-muted small">
                  {{ cuisines.length === 1 ? 'Cuisine' : 'Cuisines' }}
                </span>
              </div>
            </div>

            <ul class="list-unstyled mb-3">
              <li
                v-for="(item, index) in cuisines"
                :key="item.cuisine"
                class="cuisine-legend-row"
              >
                <span
                  class="cuisine-colour"
                  :style="{
                    backgroundColor:
                      cuisineColours[index % cuisineColours.length]
                  }"
                  aria-hidden="true"
                ></span>

                <span class="text-capitalize">
                  {{ item.cuisine }}
                </span>

                <span class="ms-auto text-muted text-end">
                  {{ item.likeCount }}
                  {{ item.likeCount === 1 ? 'like' : 'likes' }}

                  <span class="ms-2">
                    {{ cuisinePercentage(item.likeCount) }}%
                  </span>
                </span>
              </li>
            </ul>

            <p class="chart-note mb-0">
              Share of like counts among the top cuisines.
              A recipe can contribute to more than one cuisine.
            </p>
          </div>
        </div>
      </section>
    </div>
    <!-- Your activity -->
    <div
      v-if="props.section === 'all' || props.section === 'activity'"
      class="col-12"
    >
      <p
        v-if="loadingActivity"
        class="text-muted"
        role="status"
      >
        Loading your activity...
      </p>

      <div v-else-if="activityError" class="analytics-card">
        <div class="panel-body">
          <p class="text-danger" role="alert">
            {{ activityError }}
          </p>

          <button
            type="button"
            class="btn analytics-button btn-sm"
            @click="loadActivity"
          >
            Try again
          </button>
        </div>
      </div>

      <p
        v-else-if="activity.length === 0"
        class="text-muted small"
      >
        No activity data available.
      </p>

      <div v-else class="d-flex flex-column gap-4">
        <section
          v-for="chart in activityCharts"
          :key="chart.key"
          class="analytics-card"
        >
          <div class="panel-header">
            <h2 class="panel-label mb-0">
              Your {{ chart.label }}
            </h2>

            <span class="period-label">Last 7 days</span>
          </div>

          <div class="panel-body activity-chart-body">
            <div class="d-flex align-items-baseline gap-2">
              <span class="activity-total">
                {{ chart.key === 'comments' ? totalComments : totalLikes }}
              </span>

              <span class="text-muted small">
                {{ chart.label.toLowerCase() }} this period
              </span>
            </div>

            <svg
              viewBox="0 15 620 205"
              class="activity-line-chart"
              role="img"
              :aria-label="chart.label + ' over the last seven days'"
            >
              <desc>
                {{ chart.label }} per day, including today.
              </desc>

              <defs>
                <linearGradient
                  :id="'activityFill-' + chart.key"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop
                    offset="0%"
                    :stop-color="chart.colour"
                    stop-opacity="0.3"
                  />

                  <stop
                    offset="100%"
                    :stop-color="chart.colour"
                    stop-opacity="0"
                  />
                </linearGradient>
              </defs>

              <!-- Grid and scale -->
              <g
                v-for="tick in chartTicks"
                :key="tick.value"
              >
                <line
                  x1="40"
                  :y1="tick.y"
                  x2="580"
                  :y2="tick.y"
                  class="chart-grid"
                />

                <text
                  x="28"
                  :y="tick.y + 4"
                  text-anchor="end"
                  class="chart-date"
                >
                  {{ tick.value }}
                </text>
              </g>

              <!-- Shaded area -->
              <polygon
                :points="chart.area"
                :fill="'url(#activityFill-' + chart.key + ')'"
              />

              <!-- Line -->
              <polyline
                :points="chart.line"
                fill="none"
                :stroke="chart.colour"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Points and dates -->
              <g
                v-for="point in chart.points"
                :key="point.date"
                class="chart-point"
              >
                <circle
                  :cx="point.x"
                  :cy="point.y"
                  r="3"
                  :fill="chart.colour"
                  class="chart-dot"
                >
                  <title>
                    {{ formatDate(point.date) }}:
                    {{ point.count }} {{ chart.label }}
                  </title>
                </circle>

                <text
                  :x="point.x"
                  y="210"
                  text-anchor="middle"
                  class="chart-date"
                >
                  {{ formatDate(point.date) }}
                </text>
              </g>
            </svg>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-card {
  background-color: var(--fft-card);
  border: 1px solid rgb(194 200 192 / 40%);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--fft-surface-high);
}

.panel-label {
  color: var(--fft-secondary-text);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.period-label {
  color: var(--fft-muted);
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
}

.panel-body {
  padding: 22px;
}

.chart-introduction {
  color: var(--fft-muted);
  font-size: 0.8rem;
}

.chart-note {
  color: var(--fft-muted);
  font-size: 0.72rem;
  line-height: 1.6;
}

.cuisine-donut {
  position: relative;
  width: 200px;
  max-width: 100%;
  aspect-ratio: 1;
}

.cuisine-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  mask: radial-gradient(
    circle closest-side,
    transparent 70%,
    black 71%
  );
}

.cuisine-centre {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.donut-total,
.activity-total {
  color: var(--fft-text);
  font-family: 'Outfit', sans-serif;
  font-size: 32px;
  font-weight: 500;
  line-height: 40px;
  letter-spacing: -0.01em;
}

.cuisine-legend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--fft-surface-high);
  color: var(--fft-secondary-text);
  font-family: 'Inter', sans-serif;
  font-size: 0.8rem;
}

.cuisine-legend-row:last-child {
  border-bottom: 0;
}

.cuisine-colour {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.activity-legend-line {
  display: inline-block;
  width: 20px;
  height: 3px;
  border-radius: 2px;
}

.activity-line-chart {
  display: block;
  width: 100%;
  height: auto;
}

.activity-chart-panel {
  padding-top: 16px;
  border-top: 1px solid var(--fft-surface-high);
}

.activity-chart-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  color: var(--fft-secondary-text);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
}

.chart-grid {
  stroke: var(--fft-surface-high);
  stroke-width: 1;
  stroke-dasharray: 3 5;
}

.chart-date {
  fill: var(--fft-muted);
  font-family: 'Inter', sans-serif;
  font-size: 11px;
}

.chart-point:hover .chart-dot {
  r: 5;
}

.analytics-button {
  --bs-btn-color: var(--fft-primary);
  --bs-btn-border-color: var(--fft-border);

  --bs-btn-hover-color: var(--fft-primary-hover);
  --bs-btn-hover-bg: var(--fft-surface-low);
  --bs-btn-hover-border-color: var(--fft-primary);

  --bs-btn-active-color: var(--fft-primary-hover);
  --bs-btn-active-bg: var(--fft-surface-high);
  --bs-btn-active-border-color: var(--fft-primary);

  --bs-btn-disabled-color: var(--fft-muted);
  --bs-btn-disabled-border-color: var(--fft-border);
}
</style>