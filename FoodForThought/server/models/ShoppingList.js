const mongoose = require('mongoose');
const { CATEGORIES, normalizeName } = require('../src/services/shoppinglistbuilder');

const { Schema } = mongoose;
const Pantry = require('./Pantry');

const basketSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: Pantry.UNITS, required: true },
    category: { type: String, enum: Pantry.CATEGORIES, default: 'other' },
    expiryDate: { type: Date, default: null },
    addToPantry: { type: Boolean, default: true },
  },
  { _id: false },
);

const itemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true },

  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'piece', trim: true },
  category: { type: String, enum: CATEGORIES, default: 'other' },

  pantryQuantity: { type: Number, default: 0, min: 0 },

  alsoNeed: [
    {
      _id: false,
      quantity: { type: Number, min: 0, required: true },
      unit: { type: String, trim: true, required: true },
      pantryQuantity: { type: Number, min: 0, default: 0 },
    },
  ],

  usedIn: [
    {
      _id: false,
      recipeId: { type: Schema.Types.ObjectId, ref: 'Recipe' },
      title: String,
    },
  ],

  source: { type: String, enum: ['auto', 'manual'], default: 'auto' },

  purchased: { type: Boolean, default: false },
  purchasedAt: { type: Date, default: null },

  addedToPantry: { type: Boolean, default: false },

  basket: { type: basketSchema, default: undefined },
});

itemSchema.pre('validate', function () {
  if (!this.normalizedName) this.normalizedName = normalizeName(this.name);
});

const shoppingListSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mealPlanId: { type: Schema.Types.ObjectId, ref: 'MealPlan', default: null },
    weekStart: { type: Date, required: true },
    items: [itemSchema],
    generatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

shoppingListSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.models.ShoppingList || mongoose.model('ShoppingList', shoppingListSchema);