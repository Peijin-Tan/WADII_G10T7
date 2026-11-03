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
  // The role is NOT taken from the request: anyone signing up is a normal user.
  // (Before, the form let people pick "Admin" and the server accepted it.)
  // Admins are made by another admin on the admin dashboard, or with: npm run make-admin -- <email>
  const { name, email, password } = req.body || {}

  if (
    typeof name !== 'string' || !name.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' || !password
  ) {
    return res.status(400).json({
      message: 'Name, email and password are required'
    })
  }
  // same rule as the sign-up form, checked here too so it can't be skipped
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' })
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
      role: 'user'
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

module.exports = router;