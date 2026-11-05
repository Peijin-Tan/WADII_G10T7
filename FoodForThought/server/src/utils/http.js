function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function makeHandler({ fallback, castError, duplicate } = {}) {
  return (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message })
      if (err.name === 'ValidationError') {
        const first = Object.values(err.errors || {})[0]
        return res.status(400).json({ message: first ? first.message : err.message })
      }
      if (err.name === 'CastError') {
        return res.status(castError?.status || 400).json({ message: castError?.message || err.message })
      }
      if (err.code === 11000 && duplicate) return res.status(409).json({ message: duplicate })
      console.error(err)
      res.status(500).json({ message: fallback || 'Something went wrong' })
    }
  }
}

module.exports = { httpError, makeHandler }
