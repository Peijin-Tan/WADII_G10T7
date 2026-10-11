const mongoose = require('mongoose')

const recipeSchema = new mongoose.Schema(
  {
    externalId: {
      type: Number,
      required: true,
      unique: true
    },

    title: {
      type: String,
      required: true
    },

    image: {
      type: String,
      required: true
    },

    summary: {
      type: String,
      required: true
    },

    cuisine: {
      type: [String],
      required: true
    },

    dietaryCategories: [{
      type: String
    }],

    servings: {
      type: Number,
      required: true
    },

    prepTime: {
      type: Number,
      required: true
    },

    cookingTime: {
      type: Number,
      required: true
    },

    totalTime: {
      type: Number,
      required: true
    },

    ingredients: [{
      name: {
        type: String,
        required: true
      },

      amount: {
        type: Number,
        required: true
      },

      unit: {
        type: String,
        required: true
      }
    }],

    instructions: [{
      step: {
        type: Number,
        required: true
      },

      description: {
        type: String,
        required: true
      }
    }],

    nutrition: [
      {
        name: {
          type: String,
          required: true
        },

        amount: {
          type: Number
        },

        unit: {
          type: String
        }
      }
    ],

    allergens: [{
      type: String
    }],

    source: {
      type: String
    },

    sourceUrl: {
      type: String
    }
  },

  {
    timestamps: true
  }
)

module.exports = mongoose.model('Recipe', recipeSchema)