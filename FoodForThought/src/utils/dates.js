// dates.js
// Date helpers shared by the planner, shopping list and pantry.
// Everything works in LOCAL time: toISOString() would shift to UTC and give the previous day in Singapore.

// Date -> 'YYYY-MM-DD'
export function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 'YYYY-MM-DD' -> Date at local midnight
export function fromISODate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// A new Date n days later (n can be negative)
export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// Midnight on the Monday of the week containing `date` (the app's weeks run Monday -> Sunday)
export function mondayOf(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // getDay(): 0 = Sunday
  return d
}

// Today at midnight
export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Whole days from today until a date (negative = in the past), or null if there's no date
export function daysUntil(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - startOfToday()) / 86400000) // ms in a day
}
