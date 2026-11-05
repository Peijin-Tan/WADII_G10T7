
const express = require('express')
const mongoose = require('mongoose')
const Recipe = require('../../models/Recipe')
const Like = require('../../models/Like')
const Comment = require('../../models/Comment')
const Post = require('../../models/Post')
const UserPreference = require('../../models/UserPreference')
const requireAuth = require('../middleware/auth')
const path = require('path')
const fs = require('fs')
const multer = require('multer')

const router = express.Router()


// Create uploads folder if it doesn't exist
const uploadDir = path.join(__dirname, '../../../public/img')

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Configure image storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + '-' + Math.round(Math.random() * 1E9)

    const extension = path.extname(file.originalname).toLowerCase()

    cb(null, uniqueName + extension)
  }
})

// Only allow image files
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ]

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only JPG, PNG and WebP images are allowed'))
  }
}

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB maximum
  }
})

// Allow both logged-in and guest users to browse recipes.
// If a token is provided, verify it before continuing.
function optionalAuth(req, res, next) {
  if (!req.get('Authorization')) {
    return next()
  }

  return requireAuth(req, res, next)
}

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

function normaliseValue(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\s_-]/g, '')
}

const dietaryAliases = {
  vegetarian: ['vegetarian'],
  vegan: ['vegan'],
  glutenfree: ['glutenfree'],
  dairyfree: ['dairyfree'],
  pescatarian: ['pescetarian', 'pescatarian'],
  keto: ['ketogenic', 'keto']
}

function matchesDietaryPreferences(recipe, dietaryPreferences) {
  if (!dietaryPreferences || dietaryPreferences.length === 0) {
    return true
  }

  const recipeDiets = (recipe.dietaryCategories || [])
    .map(diet => diet.toLowerCase().replace(/[^a-z]/g, ''))

  return dietaryPreferences.every(preference => {
    const normalisedPreference = preference.toLowerCase()
    const acceptedTags = dietaryAliases[normalisedPreference] || [
      normalisedPreference.replace(/[^a-z]/g, '')
    ]

    return acceptedTags.some(tag =>
      recipeDiets.includes(tag.replace(/[^a-z]/g, ''))
    )
  })
}

function filterRecipesByPreferences(recipes, preferences) {
  const selectedDiets = preferences?.dietaryPreferences || []
  const selectedAllergens = preferences?.allergens || []

  return recipes.filter(recipe => {

    // 1. Dietary preference filtering
    // Show recipes matching AT LEAST ONE selected dietary category.
    if (selectedDiets.length > 0) {
      const recipeDiets = (recipe.dietaryCategories || [])
        .map(normaliseValue)

      const matchesDiet = selectedDiets.some(preference => {
        const normalisedPreference = normaliseValue(preference)

        const aliases = dietaryAliases[normalisedPreference] || [
          normalisedPreference
        ]

        return aliases.some(alias =>
          recipeDiets.includes(normaliseValue(alias))
        )
      })

      if (!matchesDiet) {
        return false
      }
    }

    // 2. Allergen filtering
    // Exclude recipes containing ANY selected allergen.
    if (selectedAllergens.length > 0) {
      const recipeAllergens = (recipe.allergens || [])
        .map(normaliseValue)

      const containsAllergen = selectedAllergens.some(allergen =>
        recipeAllergens.includes(normaliseValue(allergen))
      )

      if (containsAllergen) {
        return false
      }
    }

    // 3. If no restrictions, show the recipe.
    return true
  })
}


// GET /recipes
// Get recipes with optional search and filters.
// Logged-in users also receive personalised recipe results.
router.get('/', optionalAuth, async (req, res) => {
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

    let recipes = await Recipe.find(filter)
      .populate('createdBy', 'name')

    // Apply personalised filtering for logged-in users.
    if (req.user) {
      const preferences = await UserPreference.findOne({
        userId: req.user._id
      })

      if (preferences) {
        recipes = filterRecipesByPreferences(
          recipes,
          preferences
        )
      }
    }

    return res.status(200).json({
      count: recipes.length,
      data: recipes
    })

  } catch (error) {
    console.error('Retrieve recipes error:', error)

    return res.status(500).json({
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

// GET /recipes/mine
// Retrieve recipes created by the logged-in user.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const recipes = await Recipe.find({
      createdBy: req.user._id,
      source: 'user'
    }).sort({ createdAt: -1 })

    return res.status(200).json({
      count: recipes.length,
      data: recipes
    })
  } catch (error) {
    console.error('Retrieve my recipes error:', error)

    return res.status(500).json({
      message: 'Failed to retrieve your recipes'
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

    res.status(500).json({
      message: 'Failed to create recipe',
      error: error.message
    })
  }
})

// DELETE /recipes/:id
// The recipe's author or an admin. Also removes its comments and likes.
// Meal plans keep their entry: the planner shows it as "Recipe no longer available" with a Swap button,
// so nobody loses their cooked history.
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid recipe ID' })
  }

  try {
    const recipe = await Recipe.findById(id).select('_id title createdBy externalId')

    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' })
    }

    const isAuthor = recipe.createdBy && recipe.createdBy.toString() === req.user._id.toString()
    if (!isAuthor && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own recipes' })
    }

    await Recipe.deleteOne({ _id: id })

    // A saved Spoonacular recipe shares its likes with the live API recipe ("spoonacular-<id>"),
    // which still exists, so only community recipes ("recipe-<id>") lose their likes.
    const [comments, likes] = await Promise.all([
      Comment.deleteMany({ recipeId: id }),
      recipe.externalId == null ? Like.deleteMany({ recipeKey: `recipe-${id}` }) : { deletedCount: 0 },
      Post.updateMany({ recipeId: id }, { $set: { recipeId: null } }),
    ])

    return res.json({
      message: 'Recipe deleted successfully',
      recipeId: id,
      removed: { comments: comments.deletedCount, likes: likes.deletedCount },
    })
  } catch (error) {
    console.error('Delete recipe error:', error)
    return res.status(500).json({ message: 'Failed to delete recipe' })
  }
})

// PUT /recipes/:id
// Update a recipe created by the logged-in user.
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: 'Invalid recipe ID'
      })
    }

    const recipe = await Recipe.findOne({
      _id: id,
      createdBy: req.user._id,
      source: 'user'
    })

    if (!recipe) {
      return res.status(404).json({
        message: 'Recipe not found or you do not have permission to edit it'
      })
    }

    const allowedFields = [
      'title',
      'image',
      'summary',
      'cuisine',
      'dietaryCategories',
      'servings',
      'prepTime',
      'cookingTime',
      'totalTime',
      'ingredients',
      'instructions',
      'nutrition',
      'allergens',
      'sourceUrl'
    ]

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        recipe[field] = req.body[field]
      }
    })

    await recipe.save()

    return res.status(200).json({
      message: 'Recipe updated successfully',
      data: recipe
    })

  } catch (error) {
    console.error('Update recipe error:', error)

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Recipe validation failed',
        error: error.message
      })
    }

    return res.status(500).json({
      message: 'Failed to update recipe'
    })
  }
})

// DELETE /recipes/:id
// Delete a recipe created by the logged-in user.
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: 'Invalid recipe ID'
      })
    }

    const recipe = await Recipe.findOneAndDelete({
      _id: id,
      createdBy: req.user._id,
      source: 'user'
    })

    if (!recipe) {
      return res.status(404).json({
        message: 'Recipe not found or you do not have permission to delete it'
      })
    }

    return res.status(200).json({
      message: 'Recipe deleted successfully'
    })

  } catch (error) {
    console.error('Delete recipe error:', error)

    return res.status(500).json({
      message: 'Failed to delete recipe'
    })
  }
})

// POST /recipes/upload-image
// Upload a recipe image
router.post(
  '/upload-image',
  requireAuth,
  upload.single('image'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: 'Please select an image'
        })
      }

      const imageUrl = `/img/${req.file.filename}`

      return res.status(200).json({
        message: 'Image uploaded successfully',
        imageUrl: imageUrl
      })

    } catch (error) {
      console.error('Image upload error:', error)

      return res.status(500).json({
        message: 'Failed to upload image'
      })
    }
  }
)

module.exports = router
