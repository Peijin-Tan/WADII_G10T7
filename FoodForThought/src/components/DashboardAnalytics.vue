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

// Cuisine donut chart
const cuisineColours = [
  '#82B2C0', // Blue
  '#F6C7B3', // Peach
  '#F0E2C3', // Cream yellow
  '#C3DEDD', // Teal
  '#DCECE9'  // Pale mint
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
    return '#e9ecef'
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

// Community activity line chart
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

const activityPoints = computed(() => {
  const points = []
  const maximum = highestPostCount.value || 1

  for (let i = 0; i < activity.value.length; i++) {
    const day = activity.value[i]

    const x = activity.value.length === 1
      ? 310
      : 40 + (i / (activity.value.length - 1)) * 540

    const y = 180 - (day.postCount / maximum) * 140

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

const activityDescription = computed(() => {
  return activity.value
    .map(day => `${formatDate(day.date)}: ${day.postCount} posts`)
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

    <!-- Cuisine donut chart -->
    <div
      v-if="props.section === 'all' || props.section === 'cuisines'"
      class="col-12"
    >
      <section class="card shadow-sm">
        <div class="card-body">
          <h2 class="h5 fw-bold">Trending Cuisines</h2>

          <p class="text-muted small">
            Top five cuisines by likes received this month.
          </p>

          <p v-if="loadingCuisines" role="status">
            Loading cuisines...
          </p>

          <div v-else-if="cuisineError">
            <p class="text-danger" role="alert">
              {{ cuisineError }}
            </p>

            <button
              type="button"
              class="btn btn-outline-success btn-sm"
              @click="loadCuisines"
            >
              Try again
            </button>
          </div>

          <p
            v-else-if="totalCuisineLikes === 0"
            class="text-muted mb-0"
          >
            No cuisine likes recorded this month yet.
          </p>

          <div v-else>
            <div class="cuisine-donut mx-auto my-4">
              <div
                class="cuisine-ring"
                :style="{ background: cuisinePieBackground }"
                aria-hidden="true"
              ></div>

              <div class="cuisine-centre">
                <span class="fs-3 fw-bold">
                  {{ totalCuisineLikes }}
                </span>
              </div>
            </div>

            <ul class="list-unstyled mb-3">
              <li
                v-for="(item, index) in cuisines"
                :key="item.cuisine"
                class="d-flex align-items-center gap-2 mb-2"
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

                <span class="ms-auto text-muted small text-end">
                  {{ item.likeCount }}
                  {{ item.likeCount === 1 ? 'like' : 'likes' }}
                  · {{ cuisinePercentage(item.likeCount) }}%
                </span>
              </li>
            </ul>

            <p class="text-muted small mb-0">
              Percentages show the share of like counts among these
              top five cuisines. Recipes with multiple cuisines
              contribute likes to each.
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- Community activity line chart -->
    <div
      v-if="props.section === 'all' || props.section === 'activity'"
      class="col-12"
    >
      <section class="card shadow-sm">
        <div class="card-body">
          <h2 class="h5 fw-bold">Community Activity</h2>

          <p class="text-muted small">
            Posts shared over the last seven days.
          </p>

          <p v-if="loadingActivity" role="status">
            Loading activity...
          </p>

          <div v-else-if="activityError">
            <p class="text-danger" role="alert">
              {{ activityError }}
            </p>

            <button
              type="button"
              class="btn btn-outline-success btn-sm"
              @click="loadActivity"
            >
              Try again
            </button>
          </div>

          <p
            v-else-if="activity.length === 0"
            class="text-muted mb-0"
          >
            No activity data available.
          </p>

          <div v-else>
            <p class="fw-semibold">
              {{ totalPosts }}
              {{ totalPosts === 1 ? 'post' : 'posts' }}
              shared
            </p>

            <p v-if="totalPosts === 0" class="text-muted small">
              No posts shared during this period.
            </p>

            <svg
              viewBox="0 0 620 225"
              class="activity-line-chart"
              role="img"
              aria-label="Community posts per day over the last seven days"
            >
              <desc>{{ activityDescription }}</desc>

              <line
                x1="40"
                y1="180"
                x2="580"
                y2="180"
                stroke="#dee2e6"
              />

              <polyline
                :points="activityLine"
                fill="none"
                stroke="#82B2C0"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <g
                v-for="point in activityPoints"
                :key="point.date"
              >
                <title>
                  {{ formatDate(point.date) }}:
                  {{ point.postCount }}
                  {{ point.postCount === 1 ? 'post' : 'posts' }}
                </title>

                <circle
                  :cx="point.x"
                  :cy="point.y"
                  r="5"
                  fill="#82B2C0"
                />

                <text
                  :x="point.x"
                  :y="point.y - 12"
                  text-anchor="middle"
                  class="chart-count"
                >
                  {{ point.postCount }}
                </text>

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
.cuisine-donut {
  position: relative;
  width: 220px;
  max-width: 100%;
  aspect-ratio: 1;
}

.cuisine-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  mask: radial-gradient(
    circle closest-side,
    transparent 65%,
    black 66%
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

.cuisine-colour {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}

.activity-line-chart {
  display: block;
  width: 100%;
  height: auto;
}

.chart-count {
  fill: #212529;
  font-size: 13px;
  font-weight: 600;
}

.chart-date {
  fill: #6c757d;
  font-size: 12px;
}
</style>