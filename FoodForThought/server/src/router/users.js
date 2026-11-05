// Admin-only user management (used by the admin dashboard), mounted at /users.
//
//   GET    /users
//   PATCH  /users/:id/role
//   DELETE /users/:id
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
const PantryShare = require('../../models/PantryShare')
const NeighbourInvite = require('../../models/NeighbourInvite')
const PantryRequest = require('../../models/PantryRequest')
const requireAuth = require('../middleware/auth')
const requireAdmin = require('../middleware/requireAdmin')
const router = express.Router()

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

// PATCH /users/:id/role
router.patch('/:id/role', checkId, async (req, res) => {
  try {
    const { role } = req.body || {}
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: "Role must be 'user' or 'admin'." })
    }
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot change your own role.' })
    }

    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found.' })

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

    const either = [id, new mongoose.Types.ObjectId(id)]

    const [pantry, mealPlans, shoppingLists, preferences, comments, likes, shares, invites, requests] = await Promise.all([
      Pantry.collection.deleteMany({ user: { $in: either } }),
      MealPlan.deleteMany({ userId: id }),
      ShoppingList.deleteMany({ userId: id }),
      UserPreference.deleteMany({ userId: id }),
      Comment.deleteMany({ userId: id }),
      Like.deleteMany({ userId: id }),
      PantryShare.deleteMany({ $or: [{ owner: id }, { friend: id }] }),
      NeighbourInvite.deleteMany({ $or: [{ from: id }, { to: id }] }),
      PantryRequest.deleteMany({ $or: [{ requester: id }, { owner: id }] }),
    ])

    return res.status(200).json({
      message: 'User deleted successfully.',
      deletedUser: {
        _id: deletedUser._id,
        name: deletedUser.name,
        email: deletedUser.email,
        role: deletedUser.role
      },
      removed: {
        pantryItems: pantry.deletedCount,
        mealPlans: mealPlans.deletedCount,
        shoppingLists: shoppingLists.deletedCount,
        preferences: preferences.deletedCount,
        comments: comments.deletedCount,
        likes: likes.deletedCount,
        neighbourLinks: shares.deletedCount,
        neighbourInvites: invites.deletedCount,
        borrowRequests: requests.deletedCount,
      }
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: 'Unable to delete user.' })
  }
})

module.exports = router
