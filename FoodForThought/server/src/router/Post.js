const express = require('express')
const Post = require('../../models/Post')
const Like = require('../../models/Like')
const User = require('../../models/User')
const requireAuth = require('../middleware/auth')
const mongoose = require('mongoose')
const Recipe = require('../../models/Recipe')

const router = express.Router()
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'name')
      .populate('recipeId')
      .sort({ createdAt: -1 })

    const results = []

    for (const post of posts) {
      const likeCount = await Like.countDocuments({
        postId: post._id
      })

      const postData = post.toObject()
      postData.likeCount = likeCount

      results.push(postData)
    }

    res.json(results)
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: 'Failed to retrieve posts'
    })
  }
})

router.post('/', requireAuth, async (req, res) => {
  const body = req.body || {}

  const content = body.content
  const tags = body.tags === undefined ? [] : body.tags
  const recipe = body.recipe

  // Validate the post
  if (
    typeof content !== 'string' ||
    content.trim() === '' ||
    content.trim().length > 2000
  ) {
    return res.status(400).json({
      message: 'Post content must contain 1–2000 characters'
    })
  }

  if (!Array.isArray(tags)) {
    return res.status(400).json({
      message: 'Tags must be an array'
    })
  }

  const cleanedTags = []

  for (const tag of tags) {
    if (typeof tag !== 'string') {
      return res.status(400).json({
        message: 'Each tag must be text'
      })
    }

    const cleanedTag = tag.trim().toLowerCase()

    if (cleanedTag !== '' && !cleanedTags.includes(cleanedTag)) {
      cleanedTags.push(cleanedTag)
    }
  }

  // Validate the recipe
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    return res.status(400).json({
      message: 'Recipe details are required'
    })
  }

  const requiredTextFields = ['title', 'summary', 'image']

  for (const field of requiredTextFields) {
    if (
      typeof recipe[field] !== 'string' ||
      recipe[field].trim() === ''
    ) {
      return res.status(400).json({
        message: `Recipe ${field} is required`
      })
    }
  }

  if (!Number.isInteger(recipe.servings) || recipe.servings < 1) {
    return res.status(400).json({
      message: 'Servings must be a positive whole number'
    })
  }

  if (
    !Number.isFinite(recipe.prepTime) ||
    recipe.prepTime < 0 ||
    !Number.isFinite(recipe.cookingTime) ||
    recipe.cookingTime < 0
  ) {
    return res.status(400).json({
      message: 'Preparation and cooking times must be non-negative numbers'
    })
  }

  if (
    !Array.isArray(recipe.ingredients) ||
    recipe.ingredients.length === 0
  ) {
    return res.status(400).json({
      message: 'Add at least one ingredient'
    })
  }

  const cleanedIngredients = []

  for (const ingredient of recipe.ingredients) {
    if (
      !ingredient ||
      typeof ingredient.name !== 'string' ||
      ingredient.name.trim() === '' ||
      !Number.isFinite(ingredient.amount) ||
      ingredient.amount <= 0 ||
      typeof ingredient.unit !== 'string' ||
      ingredient.unit.trim() === ''
    ) {
      return res.status(400).json({
        message: 'Each ingredient needs a name, positive amount, and unit'
      })
    }

    cleanedIngredients.push({
      name: ingredient.name.trim(),
      amount: ingredient.amount,
      unit: ingredient.unit.trim()
    })
  }

  if (
    !Array.isArray(recipe.instructions) ||
    recipe.instructions.length === 0
  ) {
    return res.status(400).json({
      message: 'Add at least one instruction'
    })
  }

  const cleanedInstructions = []

  for (let i = 0; i < recipe.instructions.length; i++) {
    const instruction = recipe.instructions[i]

    if (
      !instruction ||
      typeof instruction.description !== 'string' ||
      instruction.description.trim() === ''
    ) {
      return res.status(400).json({
        message: 'Each instruction needs a description'
      })
    }

    cleanedInstructions.push({
      step: i + 1,
      description: instruction.description.trim()
    })
  }

  if (
    !Array.isArray(recipe.cuisine) ||
    recipe.cuisine.length === 0
  ) {
    return res.status(400).json({
      message: 'Select at least one cuisine'
    })
  }

  const cleanedCuisine = []

  for (const cuisine of recipe.cuisine) {
    if (
      typeof cuisine !== 'string' ||
      cuisine.trim() === ''
    ) {
      return res.status(400).json({
        message: 'Each cuisine must be non-empty text'
      })
    }

    const cuisineName = cuisine.trim()

    if (!cleanedCuisine.includes(cuisineName)) {
      cleanedCuisine.push(cuisineName)
    }
  }

  try {
    let createdPost

    // Both documents save together, or neither saves
    await mongoose.connection.transaction(async (session) => {
      const newRecipe = new Recipe({
        source: 'user',
        createdBy: req.user._id,
        title: recipe.title.trim(),
        summary: recipe.summary.trim(),
        image: recipe.image.trim(),
        servings: recipe.servings,
        prepTime: recipe.prepTime,
        cookingTime: recipe.cookingTime,
        totalTime: recipe.prepTime + recipe.cookingTime,
        cuisine: cleanedCuisine,
        dietaryCategories: [],
        allergens: [],
        nutrition: [],
        ingredients: cleanedIngredients,
        instructions: cleanedInstructions
      })

      await newRecipe.save({ session })

      createdPost = new Post({
        userId: req.user._id,
        content: content.trim(),
        tags: cleanedTags,
        recipeId: newRecipe._id
      })

      await createdPost.save({ session })
    })

    await createdPost.populate([
      { path: 'userId', select: 'name' },
      { path: 'recipeId' }
    ])

    return res.status(201).json(createdPost)
  } catch (err) {
    console.error(err)

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Invalid post or recipe data'
      })
    }

    return res.status(500).json({
      message: 'Failed to create the recipe post'
    })
  }
})
router.delete('/:id', requireAuth, async (req, res) => {
  const postId = req.params.id

  if (!mongoose.isValidObjectId(postId)) {
    return res.status(400).json({
      message: 'Invalid post ID'
    })
  }

  try {
    const post = await Post.findById(postId)

    if (!post) {
      return res.status(404).json({
        message: 'This post is no longer available'
      })
    }

    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'You can only delete your own posts'
      })
    }

    // Delete the post and its likes together.
    await mongoose.connection.transaction(async (session) => {
      await Post.deleteOne(
        {
          _id: postId,
          userId: req.user._id
        },
        { session }
      )

      await Like.deleteMany(
        { postId: postId },
        { session }
      )
    })

    return res.json({
      message: 'Post deleted successfully'
    })
  } catch (err) {
    console.error(err)

    return res.status(500).json({
      message: 'Failed to delete post'
    })
  }
})

// GET /posts/liked — posts the logged-in user has liked
router.get('/liked', requireAuth, async (req, res) => {
  try {
    const likes = await Like.find({
      userId: req.user._id
    })

    const postIds = []

    for (const like of likes) {
      postIds.push(like.postId.toString())
    }

    res.json(postIds)
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: 'Failed to retrieve your likes'
    })
  }
})

// POST /posts/:id/like — like a post
router.post('/:id/like', requireAuth, async (req, res) => {
  const postId = req.params.id

  if (!mongoose.isObjectIdOrHexString(postId)) {
    return res.status(400).json({
      message: 'Invalid post ID'
    })
  }

  try {
    const post = await Post.findById(postId)

    if (!post) {
      return res.status(404).json({
        message: 'Post not found'
      })
    }

    try {
      await Like.create({
        userId: req.user._id,
        postId: postId
      })
    } catch (err) {
      // Already liked: keep the existing like
      if (err.code !== 11000) {
        throw err
      }
    }

    const likeCount = await Like.countDocuments({
      postId: postId
    })

    res.json({
      liked: true,
      likeCount: likeCount
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: 'Failed to like post'
    })
  }
})

// DELETE /posts/:id/like — unlike a post
router.delete('/:id/like', requireAuth, async (req, res) => {
  const postId = req.params.id

  if (!mongoose.isObjectIdOrHexString(postId)) {
    return res.status(400).json({
      message: 'Invalid post ID'
    })
  }

  try {
    const post = await Post.findById(postId)

    if (!post) {
      return res.status(404).json({
        message: 'Post not found'
      })
    }

    await Like.deleteOne({
      userId: req.user._id,
      postId: postId
    })

    const likeCount = await Like.countDocuments({
      postId: postId
    })

    res.json({
      liked: false,
      likeCount: likeCount
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: 'Failed to unlike post'
    })
  }
})

module.exports = router