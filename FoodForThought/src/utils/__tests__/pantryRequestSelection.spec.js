import { describe, expect, it } from 'vitest'
import { buildPantryRequestItem, clampPantryRequestQuantity } from '@/utils/pantryRequest'

describe('pantry request selection', () => {
  it('caps the requested quantity at the available stock', () => {
    expect(clampPantryRequestQuantity(6, 10)).toBe(6)
    expect(clampPantryRequestQuantity(6, 4)).toBe(4)
    expect(clampPantryRequestQuantity(6, 0)).toBe(1)
  })

  it('builds a request item without mutating unrelated selections', () => {
    const item = { _id: 'abc', name: 'Black beans', quantity: 4, unit: 'pcs' }
    const result = buildPantryRequestItem(item, 2)

    expect(result).toMatchObject({
      itemId: 'abc',
      name: 'Black beans',
      quantity: 2,
      unit: 'pcs',
      availableQuantity: 4,
    })
  })
})
