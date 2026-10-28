const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../../models/User')
const requireAuth = require('../middleware/auth')

const router = express.Router()

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: 'Email and password are required'
    })
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      message: 'Authentication is not configured'
    })
  }

  try {
    const user = await User.findOne({
      email: email.trim().toLowerCase()
    }).select('+password')

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        message: 'Invalid email or password'
      })
    }

    const token = jwt.sign(
      {},
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        subject: user._id.toString(),
        expiresIn: '1h'
      }
    )

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        role: user.role
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: 'Unable to log in'
    })
  }
})

// POST /auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body || {}

  const safeRole = typeof role === 'string' && ['user', 'admin'].includes(role)
    ? role
    : 'user'

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' || !password ||
    typeof role !== 'string' || !['user', 'admin'].includes(role)
  ) {
    return res.status(400).json({
      message: 'Name, email, password, and a valid role are required'
    })
  }

  try {
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() })
    if (existingUser) {
      return res.status(400).json({
        message: 'Email is already registered'
      })
    }

    const newUser = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: safeRole
    })

    await newUser.save()

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        role: newUser.role
      }
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({
      message: 'Unable to register user',
      error: err.message
    })
  }
})

// GET /auth/me — verifies a token and returns the user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// PATCH /auth/change-password
router.patch('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {}

  if (
    typeof currentPassword !== 'string' || !currentPassword.trim() ||
    typeof newPassword !== 'string' || newPassword.length < 8 ||
    typeof confirmPassword !== 'string' || confirmPassword.length < 8
  ) {
    return res.status(400).json({
      message: 'Current password, a new password with at least 8 characters, and confirmation are required.'
    })
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      message: 'New password and confirmation password do not match.'
    })
  }

  try {
    const user = await User.findById(req.user._id).select('+password')

    if (!user) {
      return res.status(404).json({
        message: 'User not found.'
      })
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword)

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        message: 'Current password is incorrect.'
      })
    }

    user.password = newPassword
    await user.save()

    return res.json({
      message: 'Password updated successfully.'
    })
  } catch (error) {
    console.error('Change password error:', error)
    return res.status(500).json({
      message: 'Unable to update password.'
    })
  }
})

module.exports = router;