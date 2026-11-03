const mongoose = require('mongoose')

const pantryShareSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    friend: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'rejected', 'blocked'],
      default: 'pending',
    },
    canView: {
      type: Boolean,
      default: true,
    },
    canBuy: {
      type: Boolean,
      default: true,
    },
    canBorrow: {
      type: Boolean,
      default: true,
    },
    canTakeover: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

pantryShareSchema.index({ owner: 1, friend: 1 }, { unique: true })

module.exports = mongoose.model('PantryShare', pantryShareSchema)
