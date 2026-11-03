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

test('approved takeover request retains item names and quantities in a single aggregated change', () => {
  const result = getApprovedPantryChange('takeover', [
    { name: 'Black Beans', quantity: 1, unit: 'can' },
    { name: 'black beans', quantity: 2, unit: 'can' },
  ])

  assert.equal(result.requesterAdditions[0].quantity, 3)
  assert.equal(result.ownerDeductions[0].quantity, 3)
  assert.equal(result.requesterAdditions[0].name, 'Black Beans')
})
