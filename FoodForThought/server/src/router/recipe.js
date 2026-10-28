
const express = require('express')
const mongoose = require('mongoose')
const Recipe = require('../../models/Recipe')
const Like = require('../../models/Like')
const requireAuth = require('../middleware/auth')

const router = express.Router()

async function findRecipeKey(value) {
  if (value.startsWith('recipe-')) {
    const recipeId = value.slice('recipe-'.length)

    if (!mongoose.isValidObjectId(recipeId)) {
      return null
    }

    const recipe = await Recipe.findById(recipeId)
      .select('_id externalId')

    if (!recipe) {
      return null
    }

    // Saved API recipes use the same key as their API version.
    if (recipe.externalId != null) {
      return 'spoonacular-' + recipe.externalId
    }

    return 'recipe-' + recipe._id.toString()
  }

  if (value.startsWith('spoonacular-')) {
    const externalId = value.slice('spoonacular-'.length)

    if (!/^[1-9]\d*$/.test(externalId)) {
      return null
    }

    if (!Number.isSafeInteger(Number(externalId))) {
      return null
    }

    return 'spoonacular-' + externalId
  }

  return null
}

// GET /recipes/liked
// Retrieve the logged-in user's liked recipe keys.
router.get('/liked', requireAuth, async (req, res) => {
  try {
    const likes = await Like.find({
      userId: req.user._id
    }).select('recipeKey')

    const likedRecipeKeys = []

    for (const like of likes) {
      likedRecipeKeys.push(like.recipeKey)
    }

    return res.json(likedRecipeKeys)
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to retrieve liked recipes'
    })
  }
})

// POST /recipes/:recipeKey/like
// Like a recipe.
router.post('/:recipeKey/like', requireAuth, async (req, res) => {
  try {
    const recipeKey = await findRecipeKey(req.params.recipeKey)

    if (!recipeKey) {
      return res.status(400).json({
        message: 'Invalid or unavailable recipe'
      })
    }

    try {
      await Like.create({
        userId: req.user._id,
        recipeKey: recipeKey
      })
    } catch (err) {
      // The unique index prevents duplicate likes.
      // If it is already liked, continue and return its current state.
      if (err.code !== 11000) {
        throw err
      }
    }

    const likeCount = await Like.countDocuments({
      recipeKey: recipeKey
    })

    return res.json({
      recipeKey: recipeKey,
      liked: true,
      likeCount: likeCount
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to like recipe'
    })
  }
})

// DELETE /recipes/:recipeKey/like
// Remove the logged-in user's like.
router.delete('/:recipeKey/like', requireAuth, async (req, res) => {
  try {
    const recipeKey = await findRecipeKey(req.params.recipeKey)

    if (!recipeKey) {
      return res.status(400).json({
        message: 'Invalid or unavailable recipe'
      })
    }

    await Like.deleteOne({
      userId: req.user._id,
      recipeKey: recipeKey
    })

    const likeCount = await Like.countDocuments({
      recipeKey: recipeKey
    })

    return res.json({
      recipeKey: recipeKey,
      liked: false,
      likeCount: likeCount
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to unlike recipe'
    })
  }
})

// GET /recipes
// Get recipes with optional search and filters
router.get('/', async (req, res) => {
  try {
    const {
      search,
      cuisine,
      diet,
      maxTime
    } = req.query

    const filter = {}

    // Search by recipe title
    if (search) {
      filter.title = {
        $regex: search,
        $options: 'i'
      }
    }

    // Filter by cuisine
    if (cuisine) {
      filter.cuisine = {
        $in: [cuisine]
      }
    }

    // Filter by dietary category
    if (diet) {
      filter.dietaryCategories = {
        $in: [diet]
      }
    }

    // Filter by maximum total time
    if (maxTime) {
      const time = Number(maxTime)

      if (!Number.isFinite(time) || time < 0) {
        return res.status(400).json({
          message: 'maxTime must be a valid non-negative number'
        })
      }

      filter.totalTime = { $lte: time }
    }

    const recipes = await Recipe.find(filter)
      .populate('createdBy', 'name')

    res.status(200).json({
      count: recipes.length,
      data: recipes
    })
  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve recipes',
      error: error.message
    })
  }
})

 // GET /recipes/search?query=chicken
 // Search recipes using Spoonacular
router.get('/search', async (req, res) => {
  try {
    const { query, cuisine, diet, maxTime } = req.query

    const apiKey = process.env.SPOONACULAR_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        message: 'Spoonacular API key is not configured'
      })
    }

    const params = new URLSearchParams({
      number: '10',
      addRecipeInformation: 'true'
    })

    if (query) params.set('query', query)
    if (cuisine) params.set('cuisine', cuisine)
    if (diet) params.set('diet', diet)

    if (maxTime) {
      const time = Number(maxTime)

      if (!Number.isFinite(time) || time < 0) {
        return res.status(400).json({
          message: 'maxTime must be a valid non-negative number'
        })
      }

      params.set('maxReadyTime', String(time))
    }

    const response = await fetch(
      `https://api.spoonacular.com/recipes/complexSearch?${params}`,
      {
        headers: {
          'x-api-key': apiKey
        }
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('Spoonacular API error:', response.status)

      return res.status(response.status === 401 ? 502 : response.status)
        .json({
          message: 'Failed to search Spoonacular recipes',
          details: result.message || result.status || 'API request failed'
        })
    }

    res.status(200).json({
      count: result.results.length,
      data: result.results.map(recipe => ({
        externalId: recipe.id,
        title: recipe.title,
        image: recipe.image,
        summary: recipe.summary || '',
        servings: recipe.servings,
        totalTime: recipe.readyInMinutes,
        cuisine: recipe.cuisines || [],
        dietaryCategories: recipe.diets || [],
        source: 'spoonacular',
        sourceUrl: recipe.sourceUrl || ''
      }))
    })
  } catch (error) {
    console.error('Spoonacular search failed:', error.message)

    res.status(500).json({
      message: 'Failed to search Spoonacular recipes'
    })
  }
})

// GET /recipes/:id
// Get one recipe by its MongoDB document ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: 'Invalid recipe ID'
      })
    }

    const recipe = await Recipe.findById(id)
      .populate('createdBy', 'name')

    if (!recipe) {
      return res.status(404).json({
        message: 'Recipe not found'
      })
    }

    res.status(200).json({
      data: recipe
    })
  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve recipe',
      error: error.message
    })
  }
})

// POST /recipes
// Create a recipe (useful for development and testing)
router.post('/', requireAuth, async (req, res) => {
  try {
    const recipeData = {
      ...req.body,
      source: 'user',
      createdBy: req.user._id
    }

    const recipe = await Recipe.create(recipeData)

    res.status(201).json({
      message: 'Recipe created successfully',
      data: recipe
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'A recipe with this externalId already exists'
      })
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Recipe validation failed',
        error: error.message
      })
    }

    console.error('Create recipe error:', error)

    res.status(500).json({
      message: 'Failed to create recipe'
    })
  }
})

module.exports = router
