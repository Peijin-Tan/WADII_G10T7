const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, 'config.env') })

require('node:dns').setServers(['8.8.8.8', '1.1.1.1'])
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const csrf = require('csurf')

const authRouter = require('./src/router/auth')
const requireAuth = require('./src/middleware/auth')
const usersRouter = require('./src/router/users')
const postsRouter = require('./src/router/Post')
const pantryRouter = require('./src/router/pantry')
const commentsRouter = require('./src/router/comments')
const plannerRouter = require('./src/router/Planner')
const shoppinglistRouter = require('./src/router/shoppinglist')
const recipeRouter = require('./src/router/recipe')
const dashboardRouter = require('./src/router/analytics')
const activityRouter = require('./src/router/activity')
const preferencesRouter = require('./src/router/preferences')
const adminRouter = require('./src/router/admin')

const app = express()
app.use(cors({
  origin: 'http://localhost:5173'
}))

// Serve uploaded recipe images from the frontend public/img folder
app.use('/img', express.static(
  path.join(__dirname, '../public/img')
))

// Basic security middlewares
app.use(helmet())

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Rate limiting
// General: 1000 requests per 15 minutes per IP. One page can make several requests (the dashboard
// loads about 6), so the old limit of 100 ran out after a few minutes of normal use.
// Images (/img above) are served before this, so they don't count.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a few minutes and try again.' },
})
// DISABLE_RATE_LIMIT=true turns both limits off, ONLY for running the automated E2E tests locally
// (a full Playwright run makes hundreds of requests and logs in many times). Never set it in production.
const rateLimitOff = process.env.DISABLE_RATE_LIMIT === 'true'
if (rateLimitOff) console.warn('Rate limiting is OFF (DISABLE_RATE_LIMIT=true). Only use this for local testing.')
if (!rateLimitOff) app.use(limiter)

// Logging in / signing up keeps a tight limit so passwords can't be guessed quickly:
// 10 FAILED attempts per 15 minutes per IP (successful logins don't count).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many failed attempts. Please wait 15 minutes and try again.' },
})
if (!rateLimitOff) app.use(['/auth/login', '/auth/register'], authLimiter)

// Mount routes
app.use('/auth', authRouter)
app.use('/posts', postsRouter)
app.use('/comments', commentsRouter)
app.use('/users', usersRouter)
app.use('/planner', plannerRouter)
app.use('/pantry', pantryRouter)
app.use('/shoppinglist', shoppinglistRouter)
app.use('/recipes', recipeRouter)
app.use('/analytics', dashboardRouter)
app.use('/activity', activityRouter)
app.use('/preferences', preferencesRouter)
app.use('/admin', adminRouter)

// Expose a simple CSRF token endpoint (uses csurf internally)
const csrfProtection = csrf({ cookie: true })
app.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() })
})

// Connect to Mongo and start server
async function connectDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/foodforthought'

  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  return mongoose.connection
}

;(async () => {
  try {
    await connectDb()
  } catch (err) {
    console.error('Failed to start (MongoDB connection).')
    console.error('Set MONGODB_URI (Atlas) or start local MongoDB on mongodb://127.0.0.1:27017')
    console.error(err)
    process.exit(1)
  }

  const hostname = 'localhost'
  const port = 8000

  app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`)
  })
})()


