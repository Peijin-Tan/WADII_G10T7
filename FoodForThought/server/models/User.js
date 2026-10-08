const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /.+@.+\..+/
    },

    password: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
)

// TODO: Hash passwords with bcrypt before save and add a comparePassword method

module.exports = mongoose.model('User', userSchema)
