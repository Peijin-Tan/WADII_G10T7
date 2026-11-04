const test = require('node:test')
const assert = require('node:assert/strict')

const PantryRequest = require('../models/PantryRequest')
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

test('request schema only accepts borrow requests', () => {
  const request = new PantryRequest({
    requester: '670000000000000000000001',
    owner: '670000000000000000000002',
    requestType: 'buy',
    items: [{ itemId: 'item-1', name: 'Flour', quantity: 300, unit: 'g' }],
    status: 'pending',
  })

  const result = request.validateSync()
  assert.ok(result instanceof Error)
  assert.match(result.message, /valid enum/i)
})
