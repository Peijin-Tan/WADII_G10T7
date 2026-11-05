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
      enum: ['borrow'],
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
      // cancelled: the borrower took it back, or one of them removed the other as a neighbour
      enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
      default: 'pending',
    },
    // When the owner approved/rejected it (or it was cancelled), shown in the borrower's history
    respondedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('PantryRequest', pantryRequestSchema)
