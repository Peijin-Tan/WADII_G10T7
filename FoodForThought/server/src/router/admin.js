// Admin-only data for the admin dashboard, mounted at /admin.
//
//   GET /admin/stats
//   GET /admin/recipes
//
// Deleting a recipe is DELETE /recipes/:id (recipe.js), because its author can do it too.
// Users are managed through /users (users.js), comments through /comments (comments.js).

const express = require('express')
const mongoose = require('mongoose')
const User = require('../../models/User')
const Recipe = require('../../models/Recipe')
const Comment = require('../../models/Comment')
const Like = require('../../models/Like')
const requireAuth = require('../middleware/auth')
const requireAdmin = require('../middleware/requireAdmin')

const router = express.Router()
router.use(requireAuth, requireAdmin)

const DAY = 24 * 60 * 60 * 1000

function recipeKeyOf(recipe) {
  return recipe.externalId != null ? `spoonacular-${recipe.externalId}` : `recipe-${recipe._id}`
}

// GET /admin/stats
router.get('/stats', async (req, res) => {
  try {
    const now = Date.now()
    const [recipeSources, totalComments, totalLikes, roleBreakdown, newUsers7d, newUsers30d] = await Promise.all([
      Recipe.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]),
      Comment.countDocuments(),
      Like.countDocuments(),
      User.aggregate([
        { $match: { role: { $in: ['user', 'admin'] } } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      User.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY) } }),
      User.countDocuments({ createdAt: { $gte: new Date(now - 30 * DAY) } }),
    ])

    const countFor = (list, id) => list.find((item) => item._id === id)?.count ?? 0
    const totalAdmins = countFor(roleBreakdown, 'admin')
    const totalRegularUsers = countFor(roleBreakdown, 'user')
    const spoonacularRecipes = countFor(recipeSources, 'spoonacular')
    const totalRecipes = recipeSources.reduce((sum, item) => sum + item.count, 0)

    return res.json({
      totalUsers: totalAdmins + totalRegularUsers,
      totalAdmins,
      totalRegularUsers,
      newUsers7d,
      newUsers30d,
      totalRecipes,
      communityRecipes: totalRecipes - spoonacularRecipes,
      spoonacularRecipes,
      totalComments,
      totalLikes,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return res.status(500).json({ message: 'Unable to load admin statistics.' })
  }
})

// GET /admin/recipes
router.get('/recipes', async (req, res) => {
  try {
    const source = req.query.source || 'user'
    if (!['user', 'spoonacular', 'all'].includes(source)) {
      return res.status(400).json({ message: "source must be 'user', 'spoonacular' or 'all'." })
    }

    const filter =
      source === 'all' ? {} : source === 'user' ? { source: { $ne: 'spoonacular' } } : { source: 'spoonacular' }

    const recipes = await Recipe.find(filter)
      .select('_id title image cuisine totalTime source externalId createdBy createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(500)
      .lean()

    const authorIds = [...new Set(recipes.map((r) => String(r.createdBy || '')))].filter((id) => mongoose.isValidObjectId(id))
    const authors = await User.find({ _id: { $in: authorIds } }).select('_id name email').lean()
    const authorById = new Map(authors.map((u) => [String(u._id), u]))

    const ids = recipes.map((r) => r._id)
    const keys = recipes.map(recipeKeyOf)

    const [commentCounts, likeCounts] = await Promise.all([
      Comment.aggregate([{ $match: { recipeId: { $in: ids } } }, { $group: { _id: '$recipeId', count: { $sum: 1 } } }]),
      Like.aggregate([{ $match: { recipeKey: { $in: keys } } }, { $group: { _id: '$recipeKey', count: { $sum: 1 } } }]),
    ])
    const comments = new Map(commentCounts.map((c) => [String(c._id), c.count]))
    const likes = new Map(likeCounts.map((l) => [l._id, l.count]))

    return res.json(
      recipes.map((r) => ({
        _id: r._id,
        title: r.title,
        image: r.image || '',
        cuisine: Array.isArray(r.cuisine) ? r.cuisine : r.cuisine ? [String(r.cuisine)] : [],
        totalTime: r.totalTime ?? null,
        source: r.source || 'user',
        createdAt: r.createdAt || null,
        author: authorById.get(String(r.createdBy || '')) || null,
        commentCount: comments.get(String(r._id)) || 0,
        likeCount: likes.get(recipeKeyOf(r)) || 0,
      }))
    )
  } catch (error) {
    console.error('Admin recipes error:', error)
    return res.status(500).json({ message: 'Unable to load recipes.' })
  }
})

module.exports = router
