const mongoose = require('mongoose')

const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },

    image: {
      type: String,
      trim: true,
      default: ''
    },

    recipeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recipe',
      default: null
    },

    tags: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: []
    }
  },
  {
    timestamps: true
  }
)

// Community feed, newest first
postSchema.index({ createdAt: -1 })

// Posts belonging to a particular user
postSchema.index({ userId: 1, createdAt: -1 })

// Category trends over time
postSchema.index({ tags: 1, createdAt: -1 })

module.exports = mongoose.model('Post', postSchema)