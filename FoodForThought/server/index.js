const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv').config({ path: './config.env' })
require('node:dns').setServers(['8.8.8.8', '1.1.1.1'])
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const csrf = require('csurf')

const authRouter = require('./src/router/auth')
const requireAuth = require('./src/middleware/auth')
const User = require('./models/User')
const Recipe = require('./models/Recipe')
const Post = require('./models/Post')
const Comment = require('./models/Comment')
const usersRouter = require('./src/router/users')
const postsRouter = require('./src/router/Post')
const commentsRouter = require('./src/router/comments')
const plannerRouter = require('./src/router/Planner')
const shoppinglistRouter = require('./src/router/shoppinglist')
const recipeRouter = require('./src/router/recipe')
const dashboardRouter = require('./src/router/analytics')
const activityRouter = require('./src/router/activity')

const app = express()
app.use(cors({
  origin: 'http://localhost:5173'
}))

// Basic security middlewares
app.use(helmet())

// Body parsing
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Rate limiting (apply globally or to specific paths)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
})
app.use(limiter)

// Mount routes
app.use('/auth', authRouter)
app.use('/posts', postsRouter)
app.use('/comments', commentsRouter)
app.use('/users', usersRouter)
app.use('/planner', plannerRouter)
app.use('/shoppinglist', shoppinglistRouter)
app.use('/recipes', recipeRouter)
app.use('/analytics', dashboardRouter)
app.use('/activity', activityRouter)

app.get('/admin/stats', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required'
    })
  }

  try {
    const [totalRecipes, totalComments, roleBreakdown] = await Promise.all([
      Recipe.countDocuments(),
      Comment.countDocuments(),
      User.aggregate([
        { $match: { role: { $in: ['user', 'admin'] } } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ])

    const totalAdmins = roleBreakdown.find(item => item._id === 'admin')?.count ?? 0
    const totalRegularUsers = roleBreakdown.find(item => item._id === 'user')?.count ?? 0
    const totalUsers = totalAdmins + totalRegularUsers

    const summary = {
      totalUsers,
      totalRecipes,
      totalComments,
      totalAdmins,
      totalRegularUsers
    }

    return res.json(summary)
  } catch (error) {
    console.error('Admin stats error:', error)
    return res.status(500).json({
      message: 'Unable to load admin statistics'
    })
  }
})

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


