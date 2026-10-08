const express = require('express')
const jwtAuth = require('../middleware/jwtAuth')
const requireRole = require('../middleware/requireRole')

const router = express.Router()

// apply jwt auth to set req.user (if token present)
router.use(jwtAuth)

// protected admin route
router.get('/', requireRole('admin'), (req, res) => {
  res.json({ message: 'Welcome to the admin area', user: req.user })
})

module.exports = router
