const mongoose = require('mongoose')

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    dietaryPreferences: {
      type: [String],
      default: []
    },

    allergens: {
      type: [String],
      default: []
    }
  },

  {
    timestamps: true
  }
)

module.exports = mongoose.model(
  'UserPreference',
  userPreferenceSchema
)