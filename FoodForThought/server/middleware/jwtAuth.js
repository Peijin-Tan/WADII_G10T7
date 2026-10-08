const jwt = require('jsonwebtoken')

module.exports = function jwtAuth(req, res, next) {
  const secret = process.env.JWT_SECRET || 'change-this-secret'
  let token = null
  // check cookie first
  if (req.cookies && req.cookies.token) token = req.cookies.token
  // then Authorization header
  if (!token && req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ')
    if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1]
  }

  if (!token) return next()

  try {
    const payload = jwt.verify(token, secret)
    req.user = { id: payload.id, name: payload.name, role: payload.role, email: payload.email }
  } catch (e) {
    // invalid token – ignore and continue without user
    console.warn('Invalid token', e.message)
  }

  next()
}
