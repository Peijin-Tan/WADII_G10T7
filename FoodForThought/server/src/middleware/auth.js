const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const User = require('../../models/User')

async function requireAuth(req, res, next) {
  const authorization = req.get('Authorization')

  
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Please log in first'
    })
  }

  const token = authorization.slice(7).trim()

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      message: 'Authentication is not configured'
    })
  }

  let decoded

  try {
    // Verify the signature and expiry
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    })
  } catch (err) {
    return res.status(401).json({
      message: 'Invalid or expired login. Please log in again.'
    })
  }

  // Our login route will store the user's ID in "sub"
  if (
    typeof decoded !== 'object' ||
    typeof decoded.sub !== 'string' ||
    !mongoose.isObjectIdOrHexString(decoded.sub)
  ) {
    return res.status(401).json({
      message: 'Invalid login token'
    })
  }

  try {
    const user = await User.findById(decoded.sub)
      .select('_id name role')

    if (!user) {
      return res.status(401).json({
        message: 'User account no longer exists'
      })
    }

    // Make the verified user available to the next route
    req.user = user

    next()
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Unable to verify your account'
    })
  }
}

module.exports = requireAuth