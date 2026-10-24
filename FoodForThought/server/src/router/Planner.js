const express = require('express')
const MealPlan = require('../../models/MealPlan')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { start } = req.query // 'YYYY-MM-DD' (the Monday of the week)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) {
      return res.status(400).json({ message: 'start must be YYYY-MM-DD' })
    }

    const from = new Date(`${start}T00:00:00.000Z`)
    const to = new Date(from)
    to.setUTCDate(to.getUTCDate() + 7) // next Monday, exclusive

    const plans = await MealPlan
      .find({ date: { $gte: from, $lt: to } }) // add `user: req.user.id` if per-user
      .sort({ date: 1 })
      .lean()

    res.json(plans)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to retrieve meal plans' })
  }
})

module.exports = router