// models/Pantry.js
// One document per pantry ingredient per user.
// Kept as its own collection (instead of an array inside User) so that
// add/edit/delete of a single item is a simple CRUD call, and so the
// shopping-list feature (Angeline) can query a user's pantry directly.

const mongoose = require('mongoose');

// Units we accept. Keep this list short and shared with the shopping list,
// otherwise "subtract pantry quantities" becomes impossible to compute.
const UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp', 'cup'];

const CATEGORIES = [
  'produce', 'meat', 'seafood', 'dairy', 'grains',
  'canned', 'spices', 'condiments', 'frozen', 'other',
];

const pantrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',          // must match the model name Kester uses for users
      required: true,
      index: true,
    },
    // Display name, as the user typed it ("Chicken Breast")
    name: {
      type: String,
      required: [true, 'Ingredient name is required'],
      trim: true,
      maxlength: 60,
    },
    // Lower-cased, trimmed, singular form ("chicken breast") used for
    // matching against Spoonacular ingredient names. Set automatically below.
    normalizedName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      min: [0, 'Quantity cannot be negative'],
      default: 1,
    },
    unit: {
      type: String,
      enum: UNITS,
      default: 'pcs',
    },
    category: {
      type: String,
      enum: CATEGORIES,
      default: 'other',
    },
    expiryDate: {
      type: Date, // optional, nice-to-have for "use soon" sorting later
    },
  },
  {
    timestamps: true,
    // Send `id` instead of `_id` (and drop __v / user), matching the planner's API
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.user;
        return ret;
      },
    },
  }
);

// A user should not have two rows for the same ingredient.
// If they add "eggs" twice, the controller increases the quantity instead.
pantrySchema.index({ user: 1, normalizedName: 1 }, { unique: true });

// very small plural -> singular rule set, applied to one word
function singular(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';     // berries -> berry
  if (word.endsWith('oes')) return word.slice(0, -2);           // tomatoes -> tomato
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1); // eggs -> egg
  return word;
}

function normalizeIngredient(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // drop punctuation and numbers
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

pantrySchema.pre('validate', function () {
  if (this.name) this.normalizedName = normalizeIngredient(this.name)
})

module.exports = mongoose.model('Pantry', pantrySchema);
module.exports.UNITS = UNITS;
module.exports.CATEGORIES = CATEGORIES;
