const express = require('express')
const Post = require('../../models/Post')
const Like = require('../../models/Like')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')

const router = express.Router()

// Match the keys used by the recipe-like routes.
function getRecipeKey(recipe) {
  if (recipe.externalId != null) {
    return 'spoonacular-' + recipe.externalId
  }

  return 'recipe-' + recipe._id.toString()
}

// GET /analytics
// Top five recipes by likes received this month.
router.get('/', requireAuth, async (req, res) => {
  try {
    const now = new Date()

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )

    // Spoonacular cards do not have Like buttons.
    const recipes = await Recipe.find({
      source: 'user'
    }).lean()

    const recipeRankings = []

    for (const recipe of recipes) {
      const recipeKey = getRecipeKey(recipe)

      const likeCount = await Like.countDocuments({
        recipeKey: recipeKey,
        createdAt: {
          $gte: monthStart,
          $lte: now
        }
      })

      if (likeCount === 0) {
        continue
      }

      recipeRankings.push({
        recipeId: recipe._id.toString(),
        title: recipe.title,
        image: recipe.image,
        cuisine: recipe.cuisine,
        totalTime: recipe.totalTime,
        likeCount: likeCount
      })
    }

    // Most likes first; alphabetical order breaks ties.
    recipeRankings.sort(
      (a, b) =>
        b.likeCount - a.likeCount ||
        a.title.localeCompare(b.title)
    )

    return res.json(recipeRankings.slice(0, 5))
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve top recipes'
    })
  }
})

// GET /analytics/cuisines
// Top five cuisines by recipe likes received this month.
router.get('/cuisines', requireAuth, async (req, res) => {
  try {
    const now = new Date()

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )

    const recipes = await Recipe.find({
      source: 'user'
    }).lean()

    const cuisineRankings = []

    for (const recipe of recipes) {
      const recipeKey = getRecipeKey(recipe)

      const likeCount = await Like.countDocuments({
        recipeKey: recipeKey,
        createdAt: {
          $gte: monthStart,
          $lte: now
        }
      })

      if (likeCount === 0) {
        continue
      }

      // Count each cuisine label only once per recipe.
      const countedCuisines = []

      for (const value of recipe.cuisine || []) {
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
// Temporarily keeps the existing post activity calculation.
// Change this to comment activity once Comment is implemented.
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const now = new Date()

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