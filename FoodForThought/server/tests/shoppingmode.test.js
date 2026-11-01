// Unit tests for shopping mode: the basket details that decide what goes into the pantry.
// Run from the server folder with:   npm test
// No database: the Pantry model's database methods are replaced with fakes.

const test = require('node:test')
const assert = require('node:assert/strict')

const Pantry = require('../models/Pantry')
const { defaultBasket, reconcileItems } = require('../src/services/shoppinglistbuilder')
const { addBasketItem } = require('../src/services/pantrysync')
const { checkBasket, readyForPantry } = require('../src/router/shoppinglist')

/* ---------- Pre-filled details when an item goes into the basket ---------- */

test('basket starts from the list: amount, pantry unit and pantry category', () => {
  assert.deepEqual(defaultBasket({ name: 'Jasmine rice', quantity: 600, unit: 'g', category: 'grains-noodles' }),
    { name: 'Jasmine rice', quantity: 600, unit: 'g', category: 'grains', expiryDate: null, addToPantry: true })
  assert.equal(defaultBasket({ name: 'Eggs', quantity: 6, unit: 'piece', category: 'dairy-eggs' }).unit, 'pcs')
  assert.equal(defaultBasket({ name: 'Prawns', quantity: 600, unit: 'g', category: 'meat-seafood' }).category, 'seafood')
})

test('things the pantry cannot store start switched off', () => {
  const soap = defaultBasket({ name: 'Dish soap', quantity: 1, unit: 'bottle', category: 'other' })
  assert.equal(soap.addToPantry, false)
  assert.equal(soap.unit, 'pcs') // still a valid pantry unit, in case the user switches it on
})

/* ---------- Checking what the user typed ---------- */

test('basket details are cleaned up and the use-by date is a Singapore calendar day', () => {
  const b = checkBasket({ name: '  Jasmine rice ', quantity: '2', unit: 'kg', category: 'grains', expiryDate: '2026-11-30' })
  assert.equal(b.name, 'Jasmine rice')
  assert.equal(b.quantity, 2)
  assert.equal(b.expiryDate.toISOString(), '2026-11-29T16:00:00.000Z') // 30 Nov 00:00 in Singapore
  assert.equal(b.addToPantry, true)
  assert.equal(checkBasket({ name: 'Rice', quantity: 1, unit: 'kg', category: 'nonsense' }).category, 'other')
})

test('bad basket details get a clear message', () => {
  assert.throws(() => checkBasket({ name: '', quantity: 1, unit: 'g' }), /name/)
  assert.throws(() => checkBasket({ name: 'Rice', quantity: 0, unit: 'g' }), /more than 0/)
  assert.throws(() => checkBasket({ name: 'Rice', quantity: 1, unit: 'bag' }), /Unit must be one of/)
  assert.throws(() => checkBasket({ name: 'Rice', quantity: 1, unit: 'g', expiryDate: '30/11/2026' }), /valid date/)
})

/* ---------- Which items "Add to pantry" moves ---------- */

test('only bought items switched on for the pantry are added, and never twice', () => {
  const basket = (on) => ({ name: 'x', quantity: 1, unit: 'pcs', addToPantry: on })
  assert.equal(readyForPantry({ purchased: true, basket: basket(true) }), true)
  assert.equal(readyForPantry({ purchased: true, basket: basket(false) }), false) // e.g. dish soap
  assert.equal(readyForPantry({ purchased: false, basket: basket(true) }), false)
  assert.equal(readyForPantry({ purchased: true, addedToPantry: true, basket: basket(true) }), false)
  // ticked before shopping mode existed (no basket): goes in if the pantry has a unit for it
  assert.equal(readyForPantry({ purchased: true, quantity: 200, unit: 'g' }), true)
  assert.equal(readyForPantry({ purchased: true, quantity: 1, unit: 'bottle' }), false)
})

test('regenerating the list keeps basket details on items still ticked', () => {
  const basket = { name: 'Jasmine rice', quantity: 2, unit: 'kg', category: 'grains', addToPantry: true }
  const old = [{ _id: 'a', name: 'Jasmine rice', unit: 'g', quantity: 600, purchased: true, basket, source: 'auto' }]
  const fresh = [{ name: 'Jasmine rice', unit: 'g', quantity: 600, purchased: false, source: 'auto' }]
  assert.deepEqual(reconcileItems(old, fresh)[0].basket, basket)
  // the plan now needs MORE than was bought -> unticked, so the details go too
  const more = [{ name: 'Jasmine rice', unit: 'g', quantity: 900, purchased: false, source: 'auto' }]
  assert.equal(reconcileItems(old, more)[0].basket, undefined)
})

/* ---------- Putting the basket into the pantry ---------- */

// A fake pantry row with the bits addBasketItem uses
function pantryRow(fields) {
  return { ...fields, saved: false, async save() { this.saved = true } }
}

test('a new ingredient is created with what was bought', async (t) => {
  t.mock.method(Pantry, 'findOne', async () => null)
  const create = t.mock.method(Pantry, 'create', async (doc) => doc)
  const expiry = new Date('2026-11-29T16:00:00Z')
  const reason = await addBasketItem('u1', { name: 'Jasmine rice', quantity: 2, unit: 'kg', category: 'grains', expiryDate: expiry })
  assert.equal(reason, null)
  const doc = create.mock.calls[0].arguments[0]
  assert.deepEqual([doc.name, doc.quantity, doc.unit, doc.category, doc.expiryDate], ['Jasmine rice', 2, 'kg', 'grains', expiry])
})

test('buying more of something you have adds to it, in the unit it is stored in', async (t) => {
  const row = pantryRow({ name: 'Jasmine rice', quantity: 500, unit: 'g' })
  t.mock.method(Pantry, 'findOne', async () => row)
  await addBasketItem('u1', { name: 'Jasmine rice', quantity: 2, unit: 'kg' })
  assert.equal(row.quantity, 2500) // 500 g + 2 kg
  assert.equal(row.saved, true)
})

test('the earlier use-by date is kept, so older stock is used first', async (t) => {
  const older = new Date('2026-11-02T16:00:00Z')
  const newer = new Date('2026-11-09T16:00:00Z')
  const row = pantryRow({ name: 'Milk', quantity: 1, unit: 'l', expiryDate: older })
  t.mock.method(Pantry, 'findOne', async () => row)
  await addBasketItem('u1', { name: 'Milk', quantity: 1, unit: 'l', expiryDate: newer })
  assert.equal(row.expiryDate, older)

  // ...unless the old stock was used up, then the new date is the one that matters
  const empty = pantryRow({ name: 'Milk', quantity: 0, unit: 'l', expiryDate: older })
  t.mock.method(Pantry, 'findOne', async () => empty)
  await addBasketItem('u1', { name: 'Milk', quantity: 1, unit: 'l', expiryDate: newer })
  assert.equal(empty.expiryDate.getTime(), newer.getTime())
})

test('units that cannot be converted are skipped with a reason', async (t) => {
  const row = pantryRow({ name: 'Rice', quantity: 2, unit: 'cup' })
  t.mock.method(Pantry, 'findOne', async () => row)
  const reason = await addBasketItem('u1', { name: 'Rice', quantity: 1, unit: 'kg' })
  assert.match(reason, /stores it in cup/)
  assert.equal(row.saved, false)
})
