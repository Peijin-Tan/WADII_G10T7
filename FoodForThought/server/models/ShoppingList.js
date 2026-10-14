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

const ShoppingList = mongoose.model("ShoppingList", shoppingListSchema);

exports.model = ShoppingList;

// fetch the list for a meal plan (scoped to its owner), or null if not generated yet
exports.retrieveListByMealPlan = function (userId, mealPlanId) {
  if (!isValidId(userId) || !isValidId(mealPlanId)) return null;
  return ShoppingList.findOne({ mealPlanId, userId }).lean();
};

// all of a user's lists, newest week first
exports.retrieveListsByUser = function (userId) {
  if (!isValidId(userId)) return null;
  return ShoppingList.find({ userId }).sort({ weekStart: -1 }).lean();
};

// saves an already-computed list for a plan: creates it the first time, overwrites items on regenerate
// (the scaling / merging / pantry-subtraction happens in the service layer, not here)
exports.saveGeneratedList = function (userId, mealPlanId, weekStart, items) {
  if (!isValidId(userId) || !isValidId(mealPlanId)) return null;
  return ShoppingList.findOneAndUpdate(
    { mealPlanId },
    { $set: { userId, weekStart, items, generatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
};

// tick / untick an item after shopping
exports.setItemPurchased = function (userId, listId, itemId, purchased) {
  if (!isValidId(userId) || !isValidId(listId) || !isValidId(itemId)) return null;
  const update = purchased
    ? { $set: { "items.$.purchased": true, "items.$.purchasedAt": new Date() } }
    : { $set: { "items.$.purchased": false }, $unset: { "items.$.purchasedAt": "" } };
  return ShoppingList.updateOne(
    { _id: listId, userId, "items._id": itemId },
    update
  );
};

// used when a meal plan is deleted (prevents orphaned lists)
exports.deleteListByMealPlan = function (mealPlanId) {
  if (!isValidId(mealPlanId)) return null;
  return ShoppingList.deleteOne({ mealPlanId });
};

// admin deletes a user: remove all of their lists
exports.deleteListsByUser = function (userId) {
  if (!isValidId(userId)) return null;
  return ShoppingList.deleteMany({ userId });
};