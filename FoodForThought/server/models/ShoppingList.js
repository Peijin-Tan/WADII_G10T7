const mongoose = require("mongoose");

const INGREDIENT_CATEGORIES = [
  "produce",
  "meat-seafood",
  "dairy-eggs",
  "grains-noodles",
  "canned-sauces",
  "spices-condiments",
  "frozen",
  "bakery",
  "other",
];

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) => typeof id === "string" && OBJECT_ID_RE.test(id);

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  normalizedName: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0, // already scaled by servings, merged, and minus pantry stock
  },
  unit: {
    type: String,
    default: "",
    lowercase: true,
    trim: true,
  },
  category: {
    type: String,
    enum: INGREDIENT_CATEGORIES,
    default: "other",
  },
  purchased: {
    type: Boolean,
    default: false,
  },
  purchasedAt: {
    type: Date,
  },
});

// Derived from a MealPlan, so it is kept separate and regenerated whenever the plan changes
const shoppingListSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mealPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MealPlan",
      required: true,
    },
    weekStart: {
      type: Date,
      required: true,
    },
    items: [itemSchema],
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// one list per meal plan
shoppingListSchema.index({ mealPlanId: 1 }, { unique: true });

// a user's lists, newest week first
shoppingListSchema.index({ userId: 1, weekStart: -1 });

module.exports = mongoose.model("ShoppingList", shoppingListSchema);
