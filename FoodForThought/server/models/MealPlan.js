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

const MealPlan = mongoose.model("MealPlan", mealPlanSchema);

exports.model = MealPlan;

// snaps any date to the Monday 00:00 (Singapore time) of its week so the unique {userId, weekStart} index works
exports.normalizeWeekStart = function (date) {
  const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const sgt = new Date(d.getTime() + SGT_OFFSET_MS);
  const daysSinceMonday = (sgt.getUTCDay() + 6) % 7;
  sgt.setUTCDate(sgt.getUTCDate() - daysSinceMonday);
  sgt.setUTCHours(0, 0, 0, 0);
  return new Date(sgt.getTime() - SGT_OFFSET_MS);
};

// fetch the user's plan for a week, or null if none exists yet
exports.retrievePlanByUserAndWeek = function (userId, weekStart) {
  const start = exports.normalizeWeekStart(weekStart);
  if (!isValidId(userId) || !start) return null;
  return MealPlan.findOne({ userId, weekStart: start }).lean();
};

// validates objectId then fetch plan (scoped to its owner) to prevent crash and cross-user access
exports.retrievePlanById = function (userId, planId) {
  if (!isValidId(userId) || !isValidId(planId)) return null;
  return MealPlan.findOne({ _id: planId, userId }).lean();
};

// opens the planner for a week: returns the existing plan or creates an empty one
exports.getOrCreatePlan = function (userId, weekStart) {
  const start = exports.normalizeWeekStart(weekStart);
  if (!isValidId(userId) || !start) return null;
  return MealPlan.findOneAndUpdate(
    { userId, weekStart: start },
    { $setOnInsert: { entries: [] } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
};

// add a recipe to a day + meal slot (starts as Planned)
exports.addEntry = function (userId, planId, entryData) {
  if (!isValidId(userId) || !isValidId(planId)) return null;
  const { recipeId, dayOfWeek, mealSlot, servings } = entryData;
  return MealPlan.updateOne(
    { _id: planId, userId },
    { $push: { entries: { recipeId, dayOfWeek, mealSlot, servings, status: "Planned" } } },
    { runValidators: true }
  );
};

// edit a planned meal's day / slot / servings (whitelisted fields only)
exports.updateEntryDetails = function (userId, planId, entryId, updateData) {
  if (!isValidId(userId) || !isValidId(planId) || !isValidId(entryId)) return null;
  const set = {};
  for (const field of ["dayOfWeek", "mealSlot", "servings"]) {
    if (updateData[field] !== undefined) set[`entries.$.${field}`] = updateData[field];
  }
  return MealPlan.updateOne(
    { _id: planId, userId, "entries._id": entryId },
    { $set: set },
    { runValidators: true }
  );
};

// mark a meal Planned / Cooked / Skipped; only Cooked keeps a cookedAt timestamp
exports.setEntryStatus = function (userId, planId, entryId, status) {
  if (!isValidId(userId) || !isValidId(planId) || !isValidId(entryId)) return null;
  if (!ENTRY_STATUS.includes(status)) return null;
  const update =
    status === "Cooked"
      ? { $set: { "entries.$.status": status, "entries.$.cookedAt": new Date() } }
      : { $set: { "entries.$.status": status }, $unset: { "entries.$.cookedAt": "" } };
  return MealPlan.updateOne(
    { _id: planId, userId, "entries._id": entryId },
    update,
    { runValidators: true }
  );
};

// remove one meal from the plan
exports.removeEntry = function (userId, planId, entryId) {
  if (!isValidId(userId) || !isValidId(planId) || !isValidId(entryId)) return null;
  return MealPlan.updateOne(
    { _id: planId, userId },
    { $pull: { entries: { _id: entryId } } }
  );
};

// pull a recipe out of every plan before the recipe itself is deleted (prevents dangling recipeIds)
exports.removeEntriesByRecipe = function (recipeId) {
  if (!isValidId(recipeId)) return null;
  return MealPlan.updateMany({}, { $pull: { entries: { recipeId } } });
};

// delete a plan and its shopping list (prevents orphaned shopping list)
exports.deletePlanAndShoppingList = async function (userId, planId) {
  if (!isValidId(userId) || !isValidId(planId)) return null;
  await ShoppingList.deleteListByMealPlan(planId);
  return MealPlan.deleteOne({ _id: planId, userId });
};

// admin deletes a user: remove all of their plans and shopping lists
exports.deletePlansByUser = async function (userId) {
  if (!isValidId(userId)) return null;
  await ShoppingList.deleteListsByUser(userId);
  return MealPlan.deleteMany({ userId });
};