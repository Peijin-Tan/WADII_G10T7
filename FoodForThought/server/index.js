const express = require('express')
const mongoose = require('mongoose')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')

const authRouter = require('./routes/auth')

const app = express()

// Basic security middlewares
app.use(helmet())

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Rate limiting (apply globally or to specific paths)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
})
app.use(limiter)

// Mount auth routes
app.use('/auth', authRouter)

// Expose a simple CSRF token endpoint (uses csurf internally)
// This endpoint will set a CSRF cookie when called by the client.
const csurf = require('csurf')
const csrfProtection = csurf({ cookie: true })
app.get('/csrf-token', csrfProtection, (req, res) => {
  // The token will be available as req.csrfToken()
  res.json({ csrfToken: req.csrfToken() })
})

// Connect to Mongo and start server
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/foodforthought'
const PORT = process.env.PORT || 3001

mongoose
  .connect(MONGO)
  .then(() => {
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
  })
  .catch((err) => {
    console.error('Mongo connection error', err)
    process.exit(1)
  })
