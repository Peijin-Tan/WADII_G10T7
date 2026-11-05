export function clampPantryRequestQuantity(availableQuantity, requestedQuantity) {
  const available = Number(availableQuantity) || 0
  const requested = Number(requestedQuantity) || 1

  if (available <= 0) {
    return 0
  }

  return Math.min(Math.max(Math.round(requested), 1), available)
}

export function buildPantryRequestItem(item, requestedQuantity) {
  const availableQuantity = Number(item.availableQuantity ?? item.quantity ?? 1) || 1
  const safeRequested = clampPantryRequestQuantity(availableQuantity, requestedQuantity)

  return {
    itemId: item.itemId || item._id || item.id,
    name: item.name || 'Item',
    quantity: safeRequested,
    unit: item.unit || 'pcs',
    availableQuantity,
  }
}
