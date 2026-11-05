import { describe, expect, it } from 'vitest'
import { applyPantryQuantityChange } from '@/utils/pantryQuantity'

describe('applyPantryQuantityChange', () => {
  it('increments only the targeted item quantity and leaves other values unchanged', () => {
    const selection = [
      { itemId: '1', quantity: 2, name: 'Black beans' },
      { itemId: '2', quantity: 4, name: 'Rice' },
    ]

    const nextSelection = applyPantryQuantityChange(selection, '1', 'increase', 1)

    expect(nextSelection).toHaveLength(2)
    expect(nextSelection[0].quantity).toBe(3)
    expect(nextSelection[1].quantity).toBe(4)
  })

  it('prevents quantities from dropping below zero', () => {
    const selection = [{ itemId: '3', quantity: 0, name: 'Eggs' }]

    const nextSelection = applyPantryQuantityChange(selection, '3', 'decrease', 1)

    expect(nextSelection[0].quantity).toBe(0)
  })
})
