Mounting the auth router

1. Install dependencies (from project root):

```bash
npm install express bcrypt mongoose helmet express-rate-limit cookie-parser csurf
```

2. If you already have an Express app, mount the router:

```js
// in your server entry (e.g. server/index.js or app.js)
const express = require('express')
const mongoose = require('mongoose')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')
const authRouter = require('./routes/auth')

const app = express()
app.use(helmet())
app.use(express.json())
app.use(cookieParser())

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use(limiter)

// mount
app.use('/auth', authRouter)

// CSRF token endpoint (client can fetch and include this token on subsequent POSTs)
const csurf = require('csurf')
const csrfProtection = csurf({ cookie: true })
app.get('/csrf-token', csrfProtection, (req, res) => res.json({ csrfToken: req.csrfToken() }))

// connect to mongo, start server
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/foodforthought')
  .then(() => app.listen(3001))
  .catch(console.error)
```

To start server:
node index.js

3. Client usage (from the Vue app):

- Register: POST `/auth/register` JSON { email, password }
- Login: POST `/auth/login` JSON { email, password }

Notes
- This router hashes passwords using bcrypt. For production use, add rate-limiting, input validation, session or JWT handling, and CSRF protections.
