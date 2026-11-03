const mongoose = require('mongoose')

const pantryRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestType: {
      type: String,
      enum: ['borrow', 'takeover'],
      required: true,
    },
    items: [{
      itemId: { type: String, required: true },
      name: { type: String, required: true, trim: true },
      quantity: { type: Number, default: 1, min: 0.001 },
      unit: { type: String, default: 'pcs' },
    }],
    message: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
      default: 'pending',
    },
    collected: {
      type: Boolean,
      default: false,
    },
    repaymentOutstanding: {
      type: Boolean,
      default: false,
    },
    approvedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('PantryRequest', pantryRequestSchema)
