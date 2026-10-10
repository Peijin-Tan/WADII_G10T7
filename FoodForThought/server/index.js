const express = require('express')
const mongoose = require('mongoose')
const dotenv = require('dotenv').config({ path: './config.env' });
require("node:dns").setServers(["8.8.8.8", "1.1.1.1"]);
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')

const authRouter = require('./routes/auth')
const adminRouter = require('./routes/admin')

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

// Mount admin
app.use('/admin', adminRouter)

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
