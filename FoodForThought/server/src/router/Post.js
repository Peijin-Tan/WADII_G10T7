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
    res.json(posts)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to retrieve posts' })
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
        cuisine: [],
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

module.exports = router