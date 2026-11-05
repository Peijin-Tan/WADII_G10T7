const mongoose = require('mongoose');

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'tsp', 'tbsp', 'cup'];

const CATEGORIES = [
  'produce', 'meat', 'seafood', 'dairy', 'grains',
  'canned', 'spices', 'condiments', 'frozen', 'other',
];

const pantrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Ingredient name is required'],
      trim: true,
      maxlength: 60,
    },
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
      type: Date,
    },
  },
  {
    timestamps: true,
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

pantrySchema.index({ user: 1, normalizedName: 1 }, { unique: true });

const { normalizeIngredient } = require('../src/services/ingredientnames');

pantrySchema.pre('validate', function () {
  if (this.name) this.normalizedName = normalizeIngredient(this.name)
})

module.exports = mongoose.model('Pantry', pantrySchema);
module.exports.UNITS = UNITS;
module.exports.CATEGORIES = CATEGORIES;
