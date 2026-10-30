const mongoose = require("mongoose");

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const ENTRY_STATUS = ["Planned", "Cooked", "Skipped"];

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) => typeof id === "string" && OBJECT_ID_RE.test(id);

// Turns 'YYYY-MM-DD' (a Monday) into Monday 00:00 Singapore time.
// e.g. '2026-09-28' -> 2026-09-27T16:00:00.000Z (same as the sample data in Planner.vue)
// Returns null if the string is invalid or not a Monday.
function normalizeWeekStart(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return null;
  const weekStart = new Date(`${isoDate}T00:00:00+08:00`);
  if (Number.isNaN(weekStart.getTime())) return null;
  // check the calendar date is a Monday (noon UTC avoids any timezone edge)
  const isMonday = new Date(`${isoDate}T12:00:00Z`).getUTCDay() === 1;
  return isMonday ? weekStart : null;
}

// One planned meal. Embedded because a week is small (<= ~28 entries) and the planner always loads the whole week together
const entrySchema = new mongoose.Schema({
  recipeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Recipe",
    // a recipe is required unless the user added a custom meal (from the Add Meal modal)
    required: function () {
      return !(this.customMeal && this.customMeal.title);
    },
  },
  // for meals that aren't in the recipe collection, e.g. "Homemade Protein Smoothie Bowl"
  customMeal: {
    title: { type: String, trim: true, maxlength: 120 },
    calories: { type: Number, min: 0 },
    protein: { type: Number, min: 0 },
    carbs: { type: Number, min: 0 },
    fat: { type: Number, min: 0 },
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
    max: 12,
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
// (no `next` parameter: works on both Mongoose 8 and 9, where next() was removed from pre hooks)
entrySchema.pre("validate", function () {
  if (this.status === "Cooked" && !this.cookedAt) this.cookedAt = new Date();
  if (this.status !== "Cooked") this.cookedAt = undefined;
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

const MealPlan = mongoose.model("MealPlan", mealPlanSchema);

module.exports = MealPlan;
module.exports.normalizeWeekStart = normalizeWeekStart;
module.exports.MEAL_SLOTS = MEAL_SLOTS;
module.exports.ENTRY_STATUS = ENTRY_STATUS;
module.exports.isValidId = isValidId;