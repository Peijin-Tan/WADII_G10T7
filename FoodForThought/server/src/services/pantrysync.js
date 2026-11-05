const Pantry = require('../../models/Pantry')
const { normalizeName, pantryAmount, pantryCategory } = require('./shoppinglistbuilder')
const { convertAmount, toPantryUnit } = require('./units')

const PANTRY_NAME_MAX = 60

async function getPantry(userId) {
  return Pantry.find({ user: userId, quantity: { $gt: 0 } }).select('name quantity unit').lean()
}

async function addBasketItem(userId, basket) {
  const existing = await Pantry.findOne({ user: userId, normalizedName: normalizeName(basket.name) })
  const stored = toPantryUnit(basket.quantity, basket.unit, basket.name)

  if (!existing) {
    await Pantry.create({
      user: userId,
      name: basket.name.slice(0, PANTRY_NAME_MAX),
      quantity: stored.quantity,
      unit: stored.unit,
      category: basket.category,
      expiryDate: basket.expiryDate || undefined,
    })
    return null
  }

  const amount = convertAmount(stored.quantity, stored.unit, existing.unit, basket.name)
  if (amount === null) return `your pantry stores it in ${existing.unit}`

  const hadStock = existing.quantity > 0
  existing.quantity = Math.round((existing.quantity + amount) * 1000) / 1000
  if (basket.expiryDate) {
    const newDate = new Date(basket.expiryDate)
    if (!hadStock || !existing.expiryDate || newDate < existing.expiryDate) existing.expiryDate = newDate
  }
  await existing.save()
  return null
}

async function addBoughtItemsToPantry(userId, items) {
  const added = []
  const skipped = []

  for (const item of items) {
    try {
      if (item.basket) {
        const reason = await addBasketItem(userId, item.basket)
        if (reason) skipped.push({ name: item.basket.name, reason })
        else added.push(item)
        continue
      }

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

module.exports = { getPantry, addBoughtItemsToPantry, addBasketItem }