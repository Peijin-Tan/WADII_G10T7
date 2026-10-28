
const express = require('express')
const UserPreference = require('../../models/UserPreference')
const requireAuth = require('../middleware/auth')

const router = express.Router()

// GET /preferences
// Retrieve the logged-in user's dietary preferences.
router.get('/', requireAuth, async (req, res) => {
  try {
    const preferences = await UserPreference.findOne({
      userId: req.user._id
    })

    return res.json({
      dietaryPreferences: preferences?.dietaryPreferences || [],
      allergens: preferences?.allergens || []
    })
  } catch (error) {
    console.error('Get preferences error:', error)
    return res.status(500).json({
      message: 'Unable to load dietary preferences.'
    })
  }
})

// PUT /preferences
// Save the logged-in user's dietary preferences.
router.put('/', requireAuth, async (req, res) => {
  try {
    const { dietaryPreferences, allergens } = req.body

    if (
      (dietaryPreferences !== undefined &&
        (!Array.isArray(dietaryPreferences) ||
          !dietaryPreferences.every(item => typeof item === 'string'))) ||
      (allergens !== undefined &&
        (!Array.isArray(allergens) ||
          !allergens.every(item => typeof item === 'string')))
    ) {
      return res.status(400).json({
        message: 'Dietary preferences and allergens must be arrays of strings.'
      })
    }

    const update = {}

    if (dietaryPreferences !== undefined) {
      update.dietaryPreferences = [
        ...new Set(dietaryPreferences.map(item => item.trim()).filter(Boolean))
      ]
    }

    if (allergens !== undefined) {
      update.allergens = [
        ...new Set(allergens.map(item => item.trim()).filter(Boolean))
      ]
    }

    const preferences = await UserPreference.findOneAndUpdate(
      { userId: req.user._id },
      { $set: update, $setOnInsert: { userId: req.user._id } },
      {
        returnDocument: 'after',
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    )

    return res.json({
      message: 'Dietary preferences saved successfully.',
      dietaryPreferences: preferences.dietaryPreferences,
      allergens: preferences.allergens
    })
  } catch (error) {
    console.error('Save preferences error:', error)
    return res.status(500).json({
      message: 'Unable to save dietary preferences.'
    })
  }
})

module.exports = router