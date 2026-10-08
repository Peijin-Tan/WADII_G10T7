// Simple role check middleware. Assumes `req.user` is set by your auth/session layer.
module.exports = function requireRole(requiredRole) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({ message: 'Forbidden: insufficient privileges' })
    }

    next()
  }
}
