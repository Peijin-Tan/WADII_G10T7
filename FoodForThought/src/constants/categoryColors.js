const FOOD = {
  produce: { ink: '#3d7a35', wash: '#e6f2e1' },
  meat: { ink: '#b03a3f', wash: '#fbe4e4' },
  seafood: { ink: '#2a6c96', wash: '#e0edf6' },
  dairy: { ink: '#8a6a00', wash: '#fbf1cf' },
  grains: { ink: '#9a5b22', wash: '#f6e8d7' },
  canned: { ink: '#b84a26', wash: '#fce6dc' },
  spices: { ink: '#7a3b69', wash: '#f2e3ee' },
  condiments: { ink: '#6e7120', wash: '#eff0d4' },
  frozen: { ink: '#1f7690', wash: '#dcf0f6' },
  other: { ink: '#56606b', wash: '#e8ebee' },
}

export const CATEGORY_COLORS = {
  ...FOOD,
  'meat-seafood': FOOD.meat,
  'dairy-eggs': FOOD.dairy,
  'grains-noodles': FOOD.grains,
  'canned-sauces': FOOD.canned,
  'spices-condiments': FOOD.condiments,
}

export function categoryStyle(category) {
  const c = CATEGORY_COLORS[category] || FOOD.other
  return { '--cat-ink': c.ink, '--cat-wash': c.wash }
}
