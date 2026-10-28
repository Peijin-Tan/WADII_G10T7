const express = require('express')
const Comment = require('../../models/Comment')
const Like = require('../../models/Like')
const Recipe = require('../../models/Recipe')
const MealPlan = require('../../models/MealPlan')
const requireAuth = require('../middleware/auth')

const router = express.Router()

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
// Trending cuisines based on recipe likes received this month.
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
// Your comments and likes over the last seven days.
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

      const commentCount = await Comment.countDocuments({
        userId: req.user._id,
        createdAt: {
          $gte: dayStart,
          $lt: dayEnd,
          $lte: now
        }
      })

      const likeCount = await Like.countDocuments({
        userId: req.user._id,
        createdAt: {
          $gte: dayStart,
          $lt: dayEnd,
          $lte: now
        }
      })

      activity.push({
        date: dayStart,
        commentCount: commentCount,
        likeCount: likeCount
      })
    }

    return res.json(activity)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve your activity'
    })
  }
})

// GET /analytics/meal-progress
// Completion of meals scheduled within the current month.
router.get('/meal-progress', requireAuth, async (req, res) => {
  try {
    // The meal-plan model stores weekStart at Singapore midnight.
    const singaporeOffset = 8 * 60 * 60 * 1000
    const oneDay = 24 * 60 * 60 * 1000

    const singaporeNow = new Date(
      Date.now() + singaporeOffset
    )

    const year = singaporeNow.getUTCFullYear()
    const month = singaporeNow.getUTCMonth()

    const monthStart = new Date(
      Date.UTC(year, month, 1) - singaporeOffset
    )

    const monthEnd = new Date(
      Date.UTC(year, month + 1, 1) - singaporeOffset
    )

    // Include weeks beginning last month that overlap this month.
    const earliestWeekStart = new Date(
      monthStart.getTime() - 6 * oneDay
    )

    const plans = await MealPlan.find({
      userId: req.user._id,
      weekStart: {
        $gte: earliestWeekStart,
        $lt: monthEnd
      }
    })
      .select('weekStart entries')
      .lean()

    let totalMeals = 0
    let completedMeals = 0
    let skippedMeals = 0

    for (const plan of plans) {
      for (const entry of plan.entries) {
        const mealDate = new Date(
          new Date(plan.weekStart).getTime() +
          entry.dayOfWeek * oneDay
        )

        if (
          mealDate < monthStart ||
          mealDate >= monthEnd
        ) {
          continue
        }

        totalMeals++

        if (entry.status === 'Cooked') {
          completedMeals++
        } else if (entry.status === 'Skipped') {
          skippedMeals++
        }
      }
    }

    let percentage = 0

    if (totalMeals > 0) {
      percentage = Math.round(
        completedMeals / totalMeals * 100
      )
    }

    return res.json({
      totalMeals: totalMeals,
      completedMeals: completedMeals,
      skippedMeals: skippedMeals,
      percentage: percentage
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve meal-plan progress'
    })
  }
})

module.exports = router