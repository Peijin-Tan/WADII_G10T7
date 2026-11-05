const mongoose = require("mongoose");

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const ENTRY_STATUS = ["Planned", "Cooked", "Skipped"];

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) => typeof id === "string" && OBJECT_ID_RE.test(id);

function normalizeWeekStart(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return null;
  const weekStart = new Date(`${isoDate}T00:00:00+08:00`);
  if (Number.isNaN(weekStart.getTime())) return null;
  const isMonday = new Date(`${isoDate}T12:00:00Z`).getUTCDay() === 1;
  return isMonday ? weekStart : null;
}

const entrySchema = new mongoose.Schema({
  recipeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Recipe",
    required: function () {
      return !(this.customMeal && this.customMeal.title);
    },
  },
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
    max: 6,
  },
  mealSlot: {
    type: String,
    enum: MEAL_SLOTS,
    required: true,
  },
  servings: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  status: {
    type: String,
    enum: ENTRY_STATUS,
    default: "Planned",
  },
  cookedAt: {
    type: Date,
  },
  pantryDeductions: [
    {
      _id: false,
      pantryItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Pantry" },
      name: String,
      quantity: Number,
      unit: String,
    },
  ],
});

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
      required: true,
    },
    entries: [entrySchema],
  },
  { timestamps: true }
);

mealPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

mealPlanSchema.index({ "entries.status": 1, "entries.cookedAt": 1 });

const MealPlan = mongoose.model("MealPlan", mealPlanSchema);

module.exports = MealPlan;
module.exports.normalizeWeekStart = normalizeWeekStart;
module.exports.MEAL_SLOTS = MEAL_SLOTS;
module.exports.ENTRY_STATUS = ENTRY_STATUS;
module.exports.isValidId = isValidId;
