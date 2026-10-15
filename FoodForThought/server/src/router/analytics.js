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
          postId: post._id.toString(),
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

// GET /analytics/cuisines
router.get('/cuisines', requireAuth, async (req, res) => {
  try {
    const now = new Date()

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )

    const posts = await Post.find()
      .populate('recipeId')
      .lean()

    const cuisineRankings = []

    for (const post of posts) {
      if (!post.recipeId) continue

      const likeCount = await Like.countDocuments({
        postId: post._id,
        createdAt: {
          $gte: monthStart,
          $lte: now
        }
      })

      if (likeCount === 0) continue

      // Prevent duplicate cuisine labels within the same recipe.
      const countedCuisines = []

      for (const value of post.recipeId.cuisine || []) {
        const cuisineName = value.trim().toLowerCase()

        if (
          cuisineName === '' ||
          countedCuisines.includes(cuisineName)
        ) {
          continue
        }

        countedCuisines.push(cuisineName)

        const existingCuisine = cuisineRankings.find(
          item => item.cuisine === cuisineName
        )

        if (existingCuisine) {
          existingCuisine.likeCount += likeCount
        } else {
          cuisineRankings.push({
            cuisine: cuisineName,
            likeCount: likeCount
          })
        }
      }
    }

    cuisineRankings.sort(
      (a, b) =>
        b.likeCount - a.likeCount ||
        a.cuisine.localeCompare(b.cuisine)
    )

    return res.json(cuisineRankings.slice(0, 5))
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve trending cuisines'
    })
  }
})

// GET /analytics/activity
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const now = new Date()

    // Start at midnight six days ago, including today.
    const firstDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )

    firstDay.setDate(firstDay.getDate() - 6)

    const activity = []

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(firstDay)
      dayStart.setDate(dayStart.getDate() + i)

      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const postCount = await Post.countDocuments({
        createdAt: {
          $gte: dayStart,
          $lt: dayEnd,
          $lte: now
        }
      })

      activity.push({
        date: dayStart,
        postCount: postCount
      })
    }

    return res.json(activity)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve community activity'
    })
  }
})
module.exports = router