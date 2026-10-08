const express = require('express')
const bcrypt = require('bcrypt')
const csurf = require('csurf')

const User = require('../models/User')

const router = express.Router()

// CSRF protection using cookies. The server must use cookie-parser.
const csrfProtection = csurf({ cookie: true })

// POST /auth/register
router.post('/register', csrfProtection, async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' })
    }

    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' })
    }

    const saltRounds = 10
    const hashed = await bcrypt.hash(password, saltRounds)

    const user = new User({ email, password: hashed })
    await user.save()

    return res.status(201).json({ message: 'User created', userId: user._id })
  } catch (err) {
    console.error('Register error', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// POST /auth/login
router.post('/login', csrfProtection, async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials.' })
    }

    // For now return basic success; replace with JWT/session as needed
    return res.json({ message: 'Login successful', userId: user._id })
  } catch (err) {
    console.error('Login error', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
