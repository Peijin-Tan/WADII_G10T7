const mongoose = require('mongoose')

const commentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    recipeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recipe',
      required: true
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    }
  },
  {
    timestamps: true
  }
)

commentSchema.index({ userId: 1, createdAt: -1 })
commentSchema.index({ recipeId: 1, createdAt: -1 })

module.exports = mongoose.model('Comment', commentSchema)