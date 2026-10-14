const express = require('express')
const Post = require('../../models/Post')
const Like = require('../../models/Like')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    // Start of the current month
    const now = new Date()

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )

    const posts = await Post.find()
      .populate('recipeId')
      .lean()

    const recipeRankings = []

    for (const post of posts) {
      // Skip posts without a recipe.
      if (!post.recipeId) {
        continue
      }

      // Count likes received by this post this month.
      const likeCount = await Like.countDocuments({
        postId: post._id,
        createdAt: {
          $gte: monthStart, //greater than or equal to (start of the month)
          $lte: now //lesser than or equal to
        }
      })

      if (likeCount === 0) {
        continue
      }

      const recipe = post.recipeId

      // Check whether this recipe is already in the rankings.
      const existingRecipe = recipeRankings.find(
        item => item.recipeId === recipe._id.toString()
      )

      if (existingRecipe) {
        existingRecipe.likeCount += likeCount
      } else {
        recipeRankings.push({
          recipeId: recipe._id.toString(),
          title: recipe.title,
          image: recipe.image,
          cuisine: recipe.cuisine,
          totalTime: recipe.totalTime,
          likeCount: likeCount
        })
      }
    }

    // Sort by likes, then alphabetically if likes are equal.
    recipeRankings.sort(
      (a, b) =>
        b.likeCount - a.likeCount ||
        a.title.localeCompare(b.title)
    )

    // Return the top five recipes.
    return res.json(recipeRankings.slice(0, 5))
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve top recipes'
    })
  }
})

module.exports = router