const mongoose = require("mongoose");
const ShoppingList = require("./ShoppingList");

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const ENTRY_STATUS = ["Planned", "Cooked", "Skipped"];

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) => typeof id === "string" && OBJECT_ID_RE.test(id);

// One planned meal. Embedded because a week is small (<= ~28 entries) and the planner always loads the whole week together
const entrySchema = new mongoose.Schema({
  recipeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Recipe",
    required: true,
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6, // 0 = Monday
  },
  mealSlot: {
    type: String,
    enum: MEAL_SLOTS,
    required: true,
  },
  servings: {
    type: Number,
    required: true,
    min: 1, // drives ingredient scaling in the shopping list
  },
  status: {
    type: String,
    enum: ENTRY_STATUS,
    default: "Planned",
  },
  cookedAt: {
    type: Date, // only set while status is Cooked
  },
});

// keeps cookedAt consistent with status when saving via doc.save()
entrySchema.pre("validate", function (next) {
  if (this.status === "Cooked" && !this.cookedAt) this.cookedAt = new Date();
  if (this.status !== "Cooked") this.cookedAt = undefined;
  next();
});

const mealPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    weekStart: {
      type: Date,
      required: true, // always Monday 00:00 Asia/Singapore, use normalizeWeekStart()
    },
    entries: [entrySchema],
  },
  { timestamps: true }
);

// one plan per user per week
mealPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

// dashboard: most-cooked recipes within a date range
mealPlanSchema.index({ "entries.status": 1, "entries.cookedAt": 1 });

module.exports = mongoose.model("MealPlan", mealPlanSchema);
