const express = require('express')
const User = require('../../models/User')
const requireAuth = require('../middleware/auth')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }

  next()
}

router.get('/', requireAuth, requireAdmin, async (req, res) => {
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

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: 'You cannot delete your own admin account.' })
    }

    const deletedUser = await User.findByIdAndDelete(id)

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found.' })
    }

    return res.status(200).json({
      message: 'User deleted successfully.',
      deletedUser: {
        _id: deletedUser._id,
        name: deletedUser.name,
        email: deletedUser.email,
        role: deletedUser.role
      }
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ message: 'Unable to delete user.' })
  }
})

module.exports = router
