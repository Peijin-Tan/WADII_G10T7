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
      enum: ['buy', 'borrow'],
      required: true,
    },
    items: [{
      itemId: { type: String, required: true },
      name: { type: String, required: true, trim: true },
      quantity: { type: Number, default: 1 },
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
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('PantryRequest', pantryRequestSchema)
