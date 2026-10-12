const express = require('express')
const Post = require('../../models/Post')
const Like = require('../../models/Like')

const router = express.Router()
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 })
    res.json(posts)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Failed to retrieve posts' })
  }
})

module.exports = router