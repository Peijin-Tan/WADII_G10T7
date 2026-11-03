// Admin-only user management (used by the admin dashboard), mounted at /users.
//
//   GET    /users            -> every user (name, email, role, joined date)
//   PATCH  /users/:id/role   -> { role: 'user' | 'admin' } promote or demote someone
//   DELETE /users/:id        -> delete a user AND their personal data
//
// Every route needs a logged-in admin (requireAuth + requireAdmin).

const express = require('express')
const mongoose = require('mongoose')
const User = require('../../models/User')
const Pantry = require('../../models/Pantry')
const MealPlan = require('../../models/MealPlan')
const ShoppingList = require('../../models/ShoppingList')
const UserPreference = require('../../models/UserPreference')
const Comment = require('../../models/Comment')
const Like = require('../../models/Like')
const requireAuth = require('../middleware/auth')
const router = express.Router()

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }

  next()
}

// A malformed id would make Mongoose throw (a 500); answer with a clear 400 instead
function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }
  next()
}

router.use(requireAuth, requireAdmin)

router.get('/', async (req, res) => {
  try {
    const users = await User.find({})
      .select('_id name email role createdAt')
      .sort({ createdAt: -1 })

    return res.json(users)
  } catch (error) {
    console.error('List users error:', error)
    return res.status(500).json({ message: 'Unable to load users.' })
  }
})

// PATCH /users/:id/role   body: { role: 'admin' | 'user' }
// Sign-up always creates normal users, so this is how new admins are made.
router.patch('/:id/role', checkId, async (req, res) => {
  try {
    const { role } = req.body || {}
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Role must be 'user' or 'admin'." })
    }
    // Changing your own role could lock you out of this page
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot change your own role.' })
    }

    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found.' })

    // Never leave the app with no admins
    if (user.role === 'admin' && role === 'user' && (await User.countDocuments({ role: 'admin' })) <= 1) {
      return res.status(400).json({ message: 'There must always be at least one admin.' })
    }

    user.role = role
    await user.save()
    return res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
  } catch (error) {
    console.error('Change role error:', error)
    return res.status(500).json({ message: 'Unable to change this user\'s role.' })
  }
})

// DELETE /users/:id
// Also removes the user's personal data, so nothing is left behind that belongs to nobody:
// pantry, meal plans, shopping lists, dietary preferences, comments and likes.
// Recipes and community posts they shared are kept, because other people may have planned them.
router.delete('/:id', checkId, async (req, res) => {
  try {
    const { id } = req.params

    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: 'You cannot delete your own admin account.' })
    }

    const deletedUser = await User.findByIdAndDelete(id)

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found.' })
    }

    const [pantry, mealPlans, shoppingLists, preferences, comments, likes] = await Promise.all([
      Pantry.deleteMany({ user: id }),
      MealPlan.deleteMany({ userId: id }),
      ShoppingList.deleteMany({ userId: id }),
      UserPreference.deleteMany({ userId: id }),
      Comment.deleteMany({ userId: id }),
      Like.deleteMany({ userId: id }),
    ])

    return res.status(200).json({
      message: 'User deleted successfully.',
      deletedUser: {
        _id: deletedUser._id,
        name: deletedUser.name,
        email: deletedUser.email,
        role: deletedUser.role
      },
      // how much of their data was removed with them
      removed: {
        pantryItems: pantry.deletedCount,
        mealPlans: mealPlans.deletedCount,
        shoppingLists: shoppingLists.deletedCount,
        preferences: preferences.deletedCount,
        comments: comments.deletedCount,
        likes: likes.deletedCount,
      }
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: 'Unable to delete user.' })
  }
})

module.exports = router
