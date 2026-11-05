import placeholder from '@/assets/meal-placeholder.svg'

export const MEAL_PLACEHOLDER = placeholder

function setSrc(el, url) {
  const next = url || placeholder
  if (el.getAttribute('src') !== next) el.setAttribute('src', next)
}

export const vRecipeImg = {
  mounted(el, binding) {
    el.addEventListener('error', () => {
      if (el.getAttribute('src') !== placeholder) el.setAttribute('src', placeholder)
    })
    setSrc(el, binding.value)
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) setSrc(el, binding.value)
  },
}
