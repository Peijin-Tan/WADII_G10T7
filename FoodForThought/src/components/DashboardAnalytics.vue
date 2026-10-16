<script setup>
import { ref, computed, onMounted } from 'vue'
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

// Community activity
const highestPostCount = computed(() => {
  let highest = 0

  for (const day of activity.value) {
    if (day.postCount > highest) {
      highest = day.postCount
    }
  }

  return highest
})

const totalPosts = computed(() => {
  let total = 0

  for (const day of activity.value) {
    total += day.postCount
  }

  return total
})

// Use an integer scale with four equal intervals.
const chartMaximum = computed(() => {
  return Math.max(
    4,
    Math.ceil(highestPostCount.value / 4) * 4
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

    const y = 180 - (day.postCount / chartMaximum.value) * 140

    points.push({
      x: x,
      y: y,
      date: day.date,
      postCount: day.postCount
    })
  }

  return points
})

const activityLine = computed(() => {
  return activityPoints.value
    .map(point => `${point.x},${point.y}`)
    .join(' ')
})

const activityArea = computed(() => {
  if (activityPoints.value.length === 0) return ''

  const firstPoint = activityPoints.value[0]
  const lastPoint =
    activityPoints.value[activityPoints.value.length - 1]

  return [
    `${firstPoint.x},180`,
    activityLine.value,
    `${lastPoint.x},180`
  ].join(' ')
})

const activityDescription = computed(() => {
  return activity.value
    .map(day => {
      const word = day.postCount === 1 ? 'post' : 'posts'
      return `${formatDate(day.date)}: ${day.postCount} ${word}`
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

async function loadActivity() {
  loadingActivity.value = true
  activityError.value = ''

  try {
    const response = await axios.get('/analytics/activity', {
      headers: {
        Authorization: `Bearer ${auth.token}`
      }
    })

    activity.value = response.data
  } catch (err) {
    activityError.value =
      err.response?.data?.message ||
      'Unable to load community activity.'
  } finally {
    loadingActivity.value = false
  }
}

onMounted(() => {
  if (props.section === 'all' || props.section === 'cuisines') {
    loadCuisines()
  }

  if (props.section === 'all' || props.section === 'activity') {
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
          <h2 class="panel-label mb-0">Trending cuisines</h2>
          <span class="period-label">This month</span>
        </div>

        <div class="panel-body">
          <p v-if="loadingCuisines" class="text-muted" role="status">
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
                  {{ totalCuisineLikes }}
                </span>

                <span class="text-muted small">
                  Cuisine
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
              Share of like counts among the top five cuisines.
              A recipe can contribute to more than one cuisine.
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- Community activity -->
    <div
      v-if="props.section === 'all' || props.section === 'activity'"
      class="col-12"
    >
      <section class="analytics-card">
        <div class="panel-header">
          <h2 class="panel-label mb-0">Community activity</h2>
          <span class="period-label">Last 7 days</span>
        </div>

        <div class="panel-body">
          <p v-if="loadingActivity" class="text-muted" role="status">
            Loading activity...
          </p>

          <div v-else-if="activityError">
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

          <p
            v-else-if="activity.length === 0"
            class="text-muted small mb-0"
          >
            No activity data available.
          </p>

          <div v-else>
            <div class="mb-1">
              <span class="activity-total">{{ totalPosts }}</span>

              <span class="text-muted small ms-2">
                {{ totalPosts === 1 ? 'post shared' : 'posts shared' }}
              </span>
            </div>

            <p class="chart-introduction mb-3">
              Daily posts across the community, including today.
            </p>

            <p v-if="totalPosts === 0" class="text-muted small">
              No posts shared during this period.
            </p>

            <svg
              viewBox="0 0 620 225"
              class="activity-line-chart"
              role="img"
              aria-label="Daily community posts over the last seven days"
            >
              <desc>{{ activityDescription }}</desc>

              <defs>
                <linearGradient
                  id="communityActivityFill"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop
                    offset="0%"
                    stop-color="#82B2C0"
                    stop-opacity="0.4"
                  />

                  <stop
                    offset="100%"
                    stop-color="#82B2C0"
                    stop-opacity="0"
                  />
                </linearGradient>
              </defs>

              <!-- Grid and scale -->
              <g v-for="tick in chartTicks" :key="tick.value">
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

              <!-- Faded area -->
              <polygon
                :points="activityArea"
                fill="url(#communityActivityFill)"
              />

              <!-- Connecting line -->
              <polyline
                :points="activityLine"
                fill="none"
                stroke="#548FA3"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Points and dates -->
              <g
                v-for="(point, index) in activityPoints"
                :key="point.date"
                class="chart-point"
              >
                <title>
                  {{ formatDate(point.date) }}:
                  {{ point.postCount }}
                  {{ point.postCount === 1 ? 'post' : 'posts' }}
                </title>

                <circle
                  :cx="point.x"
                  :cy="point.y"
                  r="12"
                  fill="transparent"
                />

                <circle
                  :cx="point.x"
                  :cy="point.y"
                  :r="index === activityPoints.length - 1 ? 4 : 2"
                  fill="#548FA3"
                  class="chart-dot"
                />

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
        </div>
      </section>
    </div>

  </div>
</template>

<style scoped>
.analytics-card {
  background-color: #FFFFFF;
  border: 1px solid #E6E8E7;
  border-radius: 14px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid #EFF1EF;
}

.panel-label {
  color: #66716B;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.period-label {
  color: #7B847E;
  font-size: 0.75rem;
}

.panel-body {
  padding: 22px;
}

.chart-introduction {
  color: #7B847E;
  font-size: 0.8rem;
}

.chart-note {
  color: #7B847E;
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

.donut-total {
  color: #303833;
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.04em;
}

.cuisine-legend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #F0F2F0;
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

.activity-total {
  color: #303833;
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.04em;
}

.activity-line-chart {
  display: block;
  width: 100%;
  height: auto;
}

.chart-grid {
  stroke: #E9EEEC;
  stroke-width: 1;
  stroke-dasharray: 3 5;
}

.chart-date {
  fill: #7C8581;
  font-size: 11px;
}

.chart-point:hover .chart-dot {
  r: 5;
}

.analytics-button {
  --bs-btn-color: #4B8A6C;
  --bs-btn-border-color: #CFDCD4;
  --bs-btn-hover-color: #386850;
  --bs-btn-hover-bg: #F0F5F2;
  --bs-btn-hover-border-color: #4B8A6C;
  --bs-btn-active-color: #386850;
  --bs-btn-active-bg: #E5EEE8;
  --bs-btn-active-border-color: #4B8A6C;
}
</style>