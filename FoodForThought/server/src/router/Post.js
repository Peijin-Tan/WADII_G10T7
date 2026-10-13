const express = require('express')
const Post = require('../../models/Post')
const Like = require('../../models/Like')
const User = require('../../models/User')
const requireAuth = require('../middleware/auth')

const router = express.Router()
router.get('/', async (req, res) => {
  
  try {

    const posts = await Post.find().populate('userId', 'name').sort({ createdAt: -1 })
    res.json(posts)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to retrieve posts' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  // 1. Read the submitted fields
  const body = req.body || {}

  const content = body.content
  const image = body.image === undefined ? '' : body.image
  const recipeId = body.recipeId === undefined ? null : body.recipeId
  const tags = body.tags === undefined ? [] : body.tags

  // 2. Validate content
  if (typeof content !== 'string') {
    return res.status(400).json({
      message: 'Content must be text'
    })
  }

  const cleanedContent = content.trim()

  if (cleanedContent.length === 0 || cleanedContent.length > 2000) {
    return res.status(400).json({
      message: 'Post content must contain 1–2000 characters'
    })
  }

  // 3. Validate image
  if (typeof image !== 'string') {
    return res.status(400).json({
      message: 'Image must be a URL or file path'
    })
  }

  // 4. Validate tags
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

  try {
    // 5. Check the optional recipe link
    if (recipeId !== null) {
      if (!mongoose.isObjectIdOrHexString(recipeId)) {
        return res.status(400).json({
          message: 'Invalid recipe ID'
        })
      }

      const recipe = await Recipe.findById(recipeId)

      if (!recipe) {
        return res.status(404).json({
          message: 'Recipe not found'
        })
      }
    }

    // 6. Save the post using the verified user's ID
    const post = await Post.create({
      userId: req.user._id,
      content: cleanedContent,
      image: image.trim(),
      recipeId: recipeId,
      tags: cleanedTags
    })

    // 7. Include the author's name in the response
    await post.populate('userId', 'name')

    return res.status(201).json(post)
  } catch (err) {
    console.error(err)

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Invalid post data'
      })
    }

    return res.status(500).json({
      message: 'Failed to create post'
    })
  }
})

module.exports = router