const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv').config({ path: './config.env' });
require("node:dns").setServers(["8.8.8.8", "1.1.1.1"]);
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const authRouter = require('./src/router/auth')
const requireAuth = require('./src/middleware/auth')
const User = require('./models/User')
const Recipe = require('./models/Recipe')
const Post = require('./models/Post')
//const adminRouter = require('./src/router/admin')
const postsRouter = require('./src/router/Post')
const usersRouter = require('./src/router/users')
const plannerRouter = require('./src/router/Planner')
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
})
app.use(limiter)


// Mount routes
app.use('/auth', authRouter)
app.use('/posts', postsRouter)
<<<<<<< Updated upstream
app.use('/users', usersRouter)
app.use('/planner', plannerRouter)
=======
app.use('/recipes', recipeRouter)
app.use('/planner', plannerRouter)

app.get('/admin/stats', async (req, res) => {
  try {
    const [totalUsers, totalRecipes, totalCommunityPosts, roleBreakdown] = await Promise.all([
      User.countDocuments(),
      Recipe.countDocuments(),
      Post.countDocuments(),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ])
    ])

    const summary = {
      totalUsers,
      totalRecipes,
      totalCommunityPosts,
      totalAdmins: roleBreakdown.find(item => item._id === 'admin')?.count ?? 0,
      totalRegularUsers: roleBreakdown.find(item => item._id === 'user')?.count ?? 0
    }

    res.json(summary)
  } catch (error) {
    console.error('Admin stats error:', error)
    res.status(500).json({
      message: 'Unable to load admin statistics'
    })
  }
})
>>>>>>> Stashed changes

app.get('/admin/stats', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required'
    })
  }

  try {
    const [totalRecipes, totalCommunityPosts, roleBreakdown] = await Promise.all([
      Recipe.countDocuments(),
      Post.countDocuments(),
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
      totalCommunityPosts,
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
app.use('/planner', plannerRouter)

// Mount admin
//app.use('/admin', adminRouter)

// Expose a simple CSRF token endpoint (uses csurf internally)
// This endpoint will set a CSRF cookie when called by the client.
const csurf = require('csurf')
const csrfProtection = csurf({ cookie: true })
app.get('/csrf-token', csrfProtection, (req, res) => {
  // The token will be available as req.csrfToken()
  res.json({ csrfToken: req.csrfToken() })
})

// Connect to Mongo and start server
async function connectDb() {
  const uri =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/foodforthought";

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

(async () => {
  try {
    await connectDb();
  } catch (err) {
    console.error("Failed to start (MongoDB connection).");
    console.error(
      "Set MONGODB_URI (Atlas) or start local MongoDB on mongodb://127.0.0.1:27017"
    );
    console.error(err);
    process.exit(1);
  }

  const hostname = "localhost";
  const port = 8000;

  app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
})();


