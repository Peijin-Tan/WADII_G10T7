const express = require('express')
const mongoose = require('mongoose')
const Comment = require('../../models/Comment')
const User = require('../../models/User')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const comments = await Comment.find()
      .populate('userId', 'name')
      .populate('recipeId', '_id title')
      .sort({ createdAt: -1 })

    const results = comments.map(comment => ({
      ...comment.toObject(),
      userName: comment.userId?.name || 'Unknown user',
      recipeName: comment.recipeId?.title || 'Recipe'
    }))

    res.json(results)
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: 'Failed to retrieve comments'
    })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Admin access required to delete comments'
    })
  }

  const { id } = req.params

  if (!mongoose.isObjectIdOrHexString(id)) {
    return res.status(400).json({
      message: 'Invalid comment ID'
    })
  }

  try {
    const deletedComment = await Comment.findByIdAndDelete(id)

    if (!deletedComment) {
      return res.status(404).json({
        message: 'Comment not found'
      })
    }

    return res.json({
      message: 'Comment deleted successfully',
      commentId: id
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      message: 'Unable to delete comment'
    })
  }
})

module.exports = router
