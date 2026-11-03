// Makes an existing account an admin. Needed for the FIRST admin, because sign-up
// always creates normal users (after that, admins can promote people on the admin dashboard).
//
//   cd FoodForThought/server
//   npm run make-admin -- someone@example.com
//
// Uses the same database as the server (MONGODB_URI in config.env).
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
const mongoose = require('mongoose')
const User = require('../models/User')

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase()
  if (!email) {
    console.error('Usage: npm run make-admin -- <email>')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/foodforthought')
  const user = await User.findOne({ email })
  if (!user) {
    console.error(`No account with the email ${email}. Sign up first, then run this again.`)
    process.exitCode = 1
  } else if (user.role === 'admin') {
    console.log(`${user.name} (${email}) is already an admin.`)
  } else {
    user.role = 'admin'
    await user.save()
    console.log(`${user.name} (${email}) is now an admin. They need to log out and back in.`)
  }
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
