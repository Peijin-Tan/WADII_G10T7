const express = require('express')
const mongoose = require('mongoose')
const Comment = require('../../models/Comment')
const Like = require('../../models/Like')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')

const router = express.Router()

const recipeFields =
  '_id title image cuisine totalTime source externalId'

// All activity routes require login.
router.use(requireAuth)

// GET /api/activity/comments
// Retrieve the logged-in user's comments and recipe details.
router.get('/comments', async (req, res) => {
  try {
    const comments = await Comment.find({
      userId: req.user._id
    })
      .populate('recipeId', recipeFields)
      .sort({ createdAt: -1, _id: -1 })
      .lean()

    return res.json(comments)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Unable to load your comments'
    })
  }
})

// PUT /api/activity/comments/:id
// Edit a comment belonging to the logged-in user.
router.put('/comments/:id', async (req, res) => {
  const commentId = req.params.id

  if (!mongoose.isObjectIdOrHexString(commentId)) {
    return res.status(400).json({
      message: 'Invalid comment ID'
    })
  }

  const body = req.body || {}
  const content = body.content

  if (
    typeof content !== 'string' ||
    content.trim() === '' ||
    content.trim().length > 2000
  ) {
    return res.status(400).json({
      message: 'Comment must contain 1–2000 characters'
    })
  }

  try {
    const comment = await Comment.findOneAndUpdate(
      {
        _id: commentId,
        userId: req.user._id
      },
      {
        $set: {
          content: content.trim()
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).populate('recipeId', recipeFields)

    if (!comment) {
      return res.status(404).json({
        message: 'Comment not found or it does not belong to you'
      })
    }

    return res.json(comment)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Unable to update your comment'
    })
  }
})

// DELETE /api/activity/comments/:id
// Delete a comment belonging to the logged-in user.
router.delete('/comments/:id', async (req, res) => {
  const commentId = req.params.id

  if (!mongoose.isObjectIdOrHexString(commentId)) {
    return res.status(400).json({
      message: 'Invalid comment ID'
    })
  }

  try {
    const comment = await Comment.findOneAndDelete({
      _id: commentId,
      userId: req.user._id
    })

    if (!comment) {
      return res.status(404).json({
        message: 'Comment not found or it does not belong to you'
      })
    }

    return res.json({
      message: 'Comment deleted'
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Unable to delete your comment'
    })
  }
})

// GET /api/activity/likes
// Retrieve the logged-in user's likes with recipe previews.
router.get('/likes', async (req, res) => {
  try {
    const likes = await Like.find({
      userId: req.user._id
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean()

    const recipeIds = []
    const externalIds = []

    // Extract recipe IDs from the stored recipe keys.
    for (const like of likes) {
      if (typeof like.recipeKey !== 'string') {
        continue
      }

      if (like.recipeKey.startsWith('recipe-')) {
        const recipeId = like.recipeKey.slice('recipe-'.length)

        if (mongoose.isObjectIdOrHexString(recipeId)) {
          recipeIds.push(recipeId)
        }
      } else if (like.recipeKey.startsWith('spoonacular-')) {
        const externalId = Number(
          like.recipeKey.slice('spoonacular-'.length)
        )

        if (
          Number.isSafeInteger(externalId) &&
          externalId > 0
        ) {
          externalIds.push(externalId)
        }
      }
    }

    // Find recipes matching either type of ID.
    const recipes = await Recipe.find({
      $or: [
        {
          _id: { $in: recipeIds }
        },
        {
          externalId: { $in: externalIds }
        }
      ]
    })
      .select(recipeFields)
      .sort({ _id: 1 })
      .lean()

    const result = []

    for (const like of likes) {
      if (typeof like.recipeKey !== 'string') {
        continue
      }

      let matchedRecipe = null

      for (const recipe of recipes) {
        const databaseKey = 'recipe-' + recipe._id.toString()

        const externalKey = recipe.externalId != null
          ? 'spoonacular-' + recipe.externalId
          : null

        if (
          like.recipeKey === databaseKey ||
          like.recipeKey === externalKey
        ) {
          matchedRecipe = recipe
          break
        }
      }

      result.push({
        _id: like._id,
        recipeKey: like.recipeKey,
        createdAt: like.createdAt,
        recipe: matchedRecipe
      })
    }

    return res.json(result)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Unable to load your liked recipes'
    })
  }
})

// DELETE /api/activity/likes/:id
// Remove a like belonging to the logged-in user.
// The ID here is the Like document's ID, not the recipe ID.
router.delete('/likes/:id', async (req, res) => {
  const likeId = req.params.id

  if (!mongoose.isObjectIdOrHexString(likeId)) {
    return res.status(400).json({
      message: 'Invalid like ID'
    })
  }

  try {
    const like = await Like.findOneAndDelete({
      _id: likeId,
      userId: req.user._id
    })

    if (!like) {
      return res.status(404).json({
        message: 'Like not found or it does not belong to you'
      })
    }

    return res.json({
      message: 'Recipe unliked'
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Unable to unlike this recipe'
    })
  }
})

module.exports = router