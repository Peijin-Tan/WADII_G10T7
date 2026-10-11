const mongoose = require('mongoose')

const likeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    }
  },
  {
    timestamps: true
  }
)

// A user can like the same post only once
likeSchema.index(
  { userId: 1, postId: 1 },
  { unique: true }
)

// Count likes for a post, including within a date range
likeSchema.index({ postId: 1, createdAt: -1 })

// Community like activity within a date range
likeSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Like', likeSchema)