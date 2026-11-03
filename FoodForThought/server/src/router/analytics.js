const express = require('express')
const Comment = require('../../models/Comment')
const Like = require('../../models/Like')
const Recipe = require('../../models/Recipe')
const MealPlan = require('../../models/MealPlan')
const requireAuth = require('../middleware/auth')

const router = express.Router()

// FoodForThought runs on Singapore time. These give month and day boundaries in Singapore time
// whatever timezone the server is in (a deployed server is usually UTC, which would otherwise
// put the first 8 hours of each month or day in the wrong one).
const SINGAPORE_OFFSET = 8 * 60 * 60 * 1000
const ONE_DAY = 24 * 60 * 60 * 1000

function singaporeMonth(now = Date.now()) {
  const sg = new Date(now + SINGAPORE_OFFSET)
  const year = sg.getUTCFullYear()
  const month = sg.getUTCMonth()
  return {
    start: new Date(Date.UTC(year, month, 1) - SINGAPORE_OFFSET),
    end: new Date(Date.UTC(year, month + 1, 1) - SINGAPORE_OFFSET),
  }
}

// Midnight (Singapore time) at the start of today
function singaporeToday(now = Date.now()) {
  const sg = new Date(now + SINGAPORE_OFFSET)
  return new Date(Date.UTC(sg.getUTCFullYear(), sg.getUTCMonth(), sg.getUTCDate()) - SINGAPORE_OFFSET)
}

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
    const monthStart = singaporeMonth(now.getTime()).start

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
    const monthStart = singaporeMonth(now.getTime()).start

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
    // today and the six days before it
    const firstDay = new Date(singaporeToday(now.getTime()).getTime() - 6 * ONE_DAY)

    const activity = []

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(firstDay.getTime() + i * ONE_DAY)
      const dayEnd = new Date(dayStart.getTime() + ONE_DAY)

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
    const oneDay = ONE_DAY
    const { start: monthStart, end: monthEnd } = singaporeMonth()

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