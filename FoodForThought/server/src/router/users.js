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
const PantryShare = require('../../models/PantryShare')
const NeighbourInvite = require('../../models/NeighbourInvite')
const PantryRequest = require('../../models/PantryRequest')
const requireAuth = require('../middleware/auth')
const requireAdmin = require('../middleware/requireAdmin')
const router = express.Router()

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
// pantry, meal plans, shopping lists, dietary preferences, comments and likes, and their
// Neighbour Pantry links: neighbour shares and invites (both directions) and borrow requests
// they sent or received. Without that, a neighbour still saw "Someone wants to borrow" and
// approving it took items out of their pantry and gave them to an account that no longer exists.
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

    // Some older pantry rows store the user id as text, not as an ObjectId (see pantryUserQuery in pantry.js)
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
      // how much of their data was removed with them
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
