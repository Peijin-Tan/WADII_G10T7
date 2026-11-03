const mongoose = require('mongoose')

// A recipe photo, stored in MongoDB so every teammate and any deployed server sees the same images
// (files in public/img only exist on the computer that saved them).
// Served by GET /images/:id (src/router/images.js). Photos are shrunk in the browser before upload
// (RecipeForm.vue), so most are 100-300 KB; MongoDB documents can be up to 16 MB.
const imageSchema = new mongoose.Schema(
  {
    data: {
      type: Buffer,
      required: true
    },

    contentType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp'],
      required: true
    },

    size: {
      type: Number
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('Image', imageSchema)
