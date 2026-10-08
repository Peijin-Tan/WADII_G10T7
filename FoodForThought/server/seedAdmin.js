const mongoose = require('mongoose')
const User = require('./models/User')

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/foodforthought'

async function run() {
  await mongoose.connect(MONGO)
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@foodforthought.com'
  const password = process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!'
  const name = process.env.SEED_ADMIN_NAME || 'Administrator'

  let existing = await User.findOne({ email })
  if (existing) {
    console.log('Admin user already exists:', email)
    process.exit(0)
  }

  const user = new User({ email, password, name, role: 'admin' })
  await user.save()
  console.log('Created admin user:', email)
  process.exit(0)
}

run().catch((err) => {
  console.error('Seed error', err)
  process.exit(1)
})
