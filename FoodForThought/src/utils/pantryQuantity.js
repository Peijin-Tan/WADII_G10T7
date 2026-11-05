export function applyPantryQuantityChange(items, itemId, direction, step = 1) {
  const change = Number(step) || 1

  return (items || []).map((item) => {
    const currentId = item.itemId || item._id || item.id

    if (String(currentId) !== String(itemId)) {
      return item
    }

    const currentQuantity = Number(item.quantity) || 0
    const nextQuantity = direction === 'increase'
      ? currentQuantity + change
      : currentQuantity - change

    return {
      ...item,
      quantity: Math.max(0, Number.isFinite(nextQuantity) ? nextQuantity : currentQuantity),
    }
  })
}
