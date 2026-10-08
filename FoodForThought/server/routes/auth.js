const express = require('express')
const bcrypt = require('bcryptjs')
const csurf = require('csurf')
const rateLimit = require('express-rate-limit')

const User = require('../models/User')

const router = express.Router()

// CSRF protection using cookies. The server must use cookie-parser.
const csrfProtection = csurf({ cookie: true })

// Rate limiter for login attempts: only counts failed requests
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  skipSuccessfulRequests: true, // only count failed attempts
  handler: (req, res) => {
    return res.status(429).json({ message: 'Too many login attempts. Please try again later.' })
  }
})

// POST /auth/register
router.post('/register', csrfProtection, async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email and password are required.' })
    }

    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' })
    }

    // allow role from body (supports admin creation via UI/seed per project requirements)
    const role = req.body.role === 'admin' ? 'admin' : 'user'
    const user = new User({ email, password, name, role })
    await user.save()

    // Issue JWT and set cookie (and return token in body so client can store in localStorage during dev)
    let token = null
    try {
      const jwt = require('jsonwebtoken')
      const secret = process.env.JWT_SECRET || 'change-this-secret'
      token = jwt.sign({ id: user._id, name: user.name, role: user.role, email: user.email }, secret, { expiresIn: '7d' })
      res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 })
    } catch (e) {
      console.warn('jsonwebtoken not available; skipping cookie set')
    }

    return res.status(201).json({ message: 'User created', userId: user._id, name: user.name, role: user.role, token })
  } catch (err) {
    console.error('Register error', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// POST /auth/login
// Apply login rate limiter to protect against brute force
router.post('/login', loginLimiter, csrfProtection, async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' })
    }

    const match = await user.comparePassword(password)
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials.' })
    }

        // Issue a JWT and set it as HttpOnly cookie (requires jsonwebtoken installed)
        try {
          const jwt = require('jsonwebtoken')
          const secret = process.env.JWT_SECRET || 'change-this-secret'
          const token = jwt.sign({ id: user._id, name: user.name, role: user.role, email: user.email }, secret, { expiresIn: '7d' })
          // set cookie: secure=true in production (HTTPS)
          res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 })
        } catch (e) {
          // if jsonwebtoken not installed, fallback to no-cookie but still return user info
          console.warn('jsonwebtoken not available; skipping cookie set')
        }

        // also return token in response body for client-side storage (dev convenience)
        return res.json({ message: 'Login successful', userId: user._id, name: user.name, role: user.role, token })
  } catch (err) {
    console.error('Login error', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

// POST /auth/logout - clear token cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token')
  return res.json({ message: 'Logged out' })
})
module.exports = router
