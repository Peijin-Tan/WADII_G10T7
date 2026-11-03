// "Eleen Chia" -> "EC": the letters shown in the avatar circle (navbar in App.vue and the Profile page).
// No profile photo is stored, so both places show the same initials.
export function initialsOf(name) {
  return (
    (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('') || '?'
  )
}
