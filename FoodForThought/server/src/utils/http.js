// http.js
// Shared error helpers for the Express routers (planner, pantry, shopping list).
// Before this file each router had its own copy of httpError() and handle().
//
//   throw httpError(404, 'Pantry item not found')      -> sends 404 { message }
//   router.get('/', handle(async (req, res) => {...})) -> every error ends up in one place

// Create an error that handle() turns into a 4xx response with this message
function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Builds a handle() wrapper for one router.
//   fallback      : message for unexpected (500) errors, e.g. 'Something went wrong with your pantry'
//   castError     : { status, message } for a bad id / bad value (default: 400 with Mongoose's message)
//   duplicate     : message for a unique-index clash (MongoDB error 11000), sent as 409
function makeHandler({ fallback, castError, duplicate } = {}) {
  // Wraps an async route so a thrown error / rejected promise always gets a JSON response
  return (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message })
      if (err.name === 'ValidationError') {
        // the first field's message ("Quantity cannot be negative") reads better than Mongoose's summary
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
