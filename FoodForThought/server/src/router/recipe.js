
const express = require('express')
const mongoose = require('mongoose')
const Recipe = require('../../models/Recipe')
const requireAuth = require('../middleware/auth')

const router = express.Router()

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
// Create a recipe for the logged-in user
router.post('/', requireAuth, async (req, res) => {
  try {
    const recipeData = {
      ...req.body,
      source: 'user',
      createdBy: req.user._id
    }

    // Never trust a creator ID supplied by the frontend.
    // The authenticated user's ID is assigned above.
    const recipe = await Recipe.create(recipeData)

    // Return the creator's name as well as the recipe.
    await recipe.populate('createdBy', 'name')

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
