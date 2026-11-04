const test = require('node:test')
const assert = require('node:assert/strict')

const { getApprovedPantryChange } = require('../src/services/pantryrequestapproval')

test('approved borrow request subtracts from owner and adds to requester totals', () => {
  const result = getApprovedPantryChange('borrow', [
    { name: 'Egg', quantity: 1, unit: 'pcs' },
    { name: 'Egg', quantity: 2, unit: 'pcs' },
  ])

  assert.deepEqual(result, {
    requesterAdditions: [{ name: 'Egg', quantity: 3, unit: 'pcs' }],
    ownerDeductions: [{ name: 'Egg', quantity: 3, unit: 'pcs' }],
  })
})

test('takeover requests are rejected in the borrow-only flow', () => {
  assert.throws(() => {
    getApprovedPantryChange('takeover', [{ name: 'Black Beans', quantity: 1, unit: 'can' }])
  }, /borrow/i)
})
