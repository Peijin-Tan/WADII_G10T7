const mongoose = require('mongoose')

const likeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    recipeKey: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
)

// Each user can like a recipe only once.
likeSchema.index(
  { userId: 1, recipeKey: 1 },
  { unique: true }
)

likeSchema.index({ recipeKey: 1, createdAt: -1 })

module.exports = mongoose.model('Like', likeSchema)