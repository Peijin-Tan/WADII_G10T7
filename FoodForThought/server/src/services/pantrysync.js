// pantrySync.js
// The two places the shopping list talks to James's pantry collection:
//   getPantry(userId)                     -> what the user has at home, to subtract from the list
//   addBoughtItemsToPantry(userId, items) -> move ticked items into the pantry
//
// It uses the Pantry model directly (models/Pantry.js) and follows the same rule as
// POST /pantry: if the ingredient is already there, increase its quantity, otherwise create it.
// The difference is that this converts units first (300 g into a row stored in kg adds 0.3 kg),
// which POST /pantry doesn't do yet.

const Pantry = require('../../models/Pantry')
const { normalizeName, pantryAmount, pantryCategory } = require('./shoppinglistbuilder')

const PANTRY_NAME_MAX = 60 // same as maxlength on Pantry.name

// Everything the user has (quantity above 0), as [{ name, quantity, unit }]
async function getPantry(userId) {
  return Pantry.find({ user: userId, quantity: { $gt: 0 } }).select('name quantity unit').lean()
}

// items = shopping-list item subdocuments that are ticked and not yet added.
// Each item is handled on its own, so one problem (e.g. a unit the pantry
// doesn't support) doesn't stop the others.
// Returns { added: [the items that were added], skipped: [{ name, reason }] }
async function addBoughtItemsToPantry(userId, items) {
  const added = []
  const skipped = []

  for (const item of items) {
    try {
      const existing = await Pantry.findOne({ user: userId, normalizedName: normalizeName(item.name) })
      const amount = pantryAmount(item, existing ? existing.unit : null)

      if (amount.skip) {
        skipped.push({ name: item.name, reason: amount.skip })
        continue
      }

      if (existing) {
        existing.quantity = Math.round((existing.quantity + amount.quantity) * 1000) / 1000
        await existing.save()
      } else {
        // normalizedName is filled in by the Pantry model's pre('validate') hook
        await Pantry.create({
          user: userId,
          name: item.name.slice(0, PANTRY_NAME_MAX),
          quantity: amount.quantity,
          unit: amount.unit,
          category: pantryCategory(item),
        })
      }
      added.push(item)
    } catch (err) {
      console.error('[shopping-list -> pantry]', item.name, err.message)
      skipped.push({ name: item.name, reason: 'it could not be saved' })
    }
  }

  return { added, skipped }
}

module.exports = { getPantry, addBoughtItemsToPantry }