// Only lets admins through. Use it AFTER requireAuth (which sets req.user):
//   router.use(requireAuth, requireAdmin)
//   router.delete('/:id', requireAuth, requireAdmin, handler)
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' })
  }
  next()
}

module.exports = requireAdmin
