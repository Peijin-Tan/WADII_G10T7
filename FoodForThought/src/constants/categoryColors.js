// categoryColors.js
// One colour per kind of food, used to colour-code the sections on the Shopping List
// and the Pantry, so "meat" looks the same on both pages.
//   ink  = strong colour (icon tile, title, stripe); white text on it is readable (4.5:1+)
//   wash = light background for the section header
//
// The shopping list and the pantry name their categories differently
// ("dairy-eggs" vs "dairy"), so both spellings are listed.
const FOOD = {
  produce: { ink: '#3d7a35', wash: '#e6f2e1' }, // leafy green
  meat: { ink: '#b03a3f', wash: '#fbe4e4' }, // rose red
  seafood: { ink: '#2a6c96', wash: '#e0edf6' }, // ocean blue
  dairy: { ink: '#8a6a00', wash: '#fbf1cf' }, // butter yellow
  grains: { ink: '#9a5b22', wash: '#f6e8d7' }, // wheat brown
  canned: { ink: '#b84a26', wash: '#fce6dc' }, // tomato tin orange
  spices: { ink: '#7a3b69', wash: '#f2e3ee' }, // beetroot plum
  condiments: { ink: '#6e7120', wash: '#eff0d4' }, // olive / mustard
  frozen: { ink: '#1f7690', wash: '#dcf0f6' }, // ice blue
  other: { ink: '#56606b', wash: '#e8ebee' }, // slate grey (neutral for non-food)
}

export const CATEGORY_COLORS = {
  ...FOOD,
  // shopping-list category names
  'meat-seafood': FOOD.meat,
  'dairy-eggs': FOOD.dairy,
  'grains-noodles': FOOD.grains,
  'canned-sauces': FOOD.canned,
  'spices-condiments': FOOD.condiments,
}

// CSS variables for a section: <section :style="categoryStyle('produce')">
// then use var(--cat-ink) and var(--cat-wash) in the page's CSS.
export function categoryStyle(category) {
  const c = CATEGORY_COLORS[category] || FOOD.other
  return { '--cat-ink': c.ink, '--cat-wash': c.wash }
}
