/**
 * ShoppingList model
 * ---------------------------------------------------------------
 * One list per user per week (same pattern as MealPlan).
 * Compatible with the existing shoppinglists.json seed data: every
 * field added here has a default, so old documents still load.
 */
const mongoose = require('mongoose');
const { CATEGORIES, normalizeName } = require('../services/shoppingListBuilder');

const { Schema } = mongoose;

const itemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true }, // lowercase, used for matching/merging

  // Amount still to BUY. 0 means the pantry already covers all of it.
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'piece', trim: true },
  category: { type: String, enum: CATEGORIES, default: 'other' },

  // NEW: how much of this the pantry already covers (for the "In Pantry" view).
  pantryQuantity: { type: Number, default: 0, min: 0 },

  // NEW: which recipes in this week's plan need it (shown as tags in the UI).
  usedIn: [
    {
      _id: false,
      recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe' },
      title: String,
    },
  ],

  // NEW: "auto" = generated from the meal plan, "manual" = typed in by the user.
  // Regenerating rebuilds auto items but never touches manual ones.
  source: { type: String, enum: ['auto', 'manual'], default: 'auto' },

  purchased: { type: Boolean, default: false },
  purchasedAt: { type: Date, default: null },
});

// Fill normalizedName automatically if it wasn't set.
itemSchema.pre('validate', function () {
  if (!this.normalizedName) this.normalizedName = normalizeName(this.name);
});

const shoppingListSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mealPlanId: { type: Schema.Types.ObjectId, ref: 'MealPlan', default: null },
    weekStart: { type: Date, required: true }, // Monday 00:00 Singapore time
    items: [itemSchema],
    generatedAt: { type: Date, default: null }, // last time it was built from the meal plan
  },
  { timestamps: true },
);

// One list per user per week.
shoppingListSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

// The "||" avoids an OverwriteModelError if this file is required twice
// (MealPlan.js already requires it).
module.exports = mongoose.models.ShoppingList || mongoose.model('ShoppingList', shoppingListSchema);