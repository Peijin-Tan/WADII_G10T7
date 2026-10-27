const mongoose = require('mongoose')

const recipeSchema = new mongoose.Schema(
  {
    externalId: {
      type: Number,
      required: false,
      default: undefined
    },

    createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return this.source === 'user'
    }
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
      type: String,
      enum: ['spoonacular', 'user'],
      default: 'user'
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