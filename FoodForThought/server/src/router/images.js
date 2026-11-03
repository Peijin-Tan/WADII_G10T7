// Recipe photos stored in MongoDB (models/Image.js), mounted at /images.
//
//   GET /images/:id   -> the image itself (public, like the recipes that show it)
//
// Uploading is POST /recipes/upload-image (recipe.js), which returns { imageUrl: '/images/<id>' }.
// Mounted BEFORE the rate limiter in index.js: one page of recipe cards loads many images.

const express = require('express')
const mongoose = require('mongoose')
const Image = require('../../models/Image')

const router = express.Router()

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).end()
  }

  try {
    const image = await Image.findById(req.params.id).select('data contentType').lean()
    if (!image) return res.status(404).end()

    res.set('Content-Type', image.contentType)
    // An image never changes (editing a recipe uploads a new one), so browsers can keep it for a year
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    return res.send(Buffer.from(image.data.buffer || image.data))
  } catch (err) {
    console.error('Load image error:', err)
    return res.status(500).end()
  }
})

module.exports = router

// Deletes a stored photo if no recipe uses it any more. url looks like '/images/<id>'.
// Used when a recipe is deleted or its photo is replaced.
module.exports.deleteImageIfUnused = async function deleteImageIfUnused(url) {
  const match = /^\/images\/([0-9a-f]{24})$/i.exec(url || '')
  if (!match) return
  const Recipe = require('../../models/Recipe')
  if (await Recipe.exists({ image: url })) return
  await Image.deleteOne({ _id: match[1] })
}
