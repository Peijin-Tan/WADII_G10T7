const { normalizeIngredient } = require('./ingredientnames')

function getApprovedPantryChange(requestType, items = []) {
  if (requestType !== 'borrow') {
    throw new Error('Only borrow requests are supported.')
  }

  const byName = new Map()

  for (const item of items || []) {
    if (!item?.name) continue

    const quantity = Number(item.quantity || 1)
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const key = normalizeIngredient(item.name)
    const existing = byName.get(key) || {
      name: item.name || 'Item',
      quantity: 0,
      unit: item.unit || 'pcs',
    }

    existing.quantity += quantity
    byName.set(key, existing)
  }

  const itemsList = Array.from(byName.values())

  return {
    requesterAdditions: itemsList.map((item) => ({ ...item })),
    ownerDeductions: itemsList.map((item) => ({ ...item })),
  }
}

module.exports = {
  getApprovedPantryChange,
  normalizePantryItemName: (value) => normalizeIngredient(String(value || 'item')),
}
