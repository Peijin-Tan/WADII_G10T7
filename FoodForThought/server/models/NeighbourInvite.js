const mongoose = require('mongoose')

// A request to become pantry neighbours (Community page > Neighbour Pantry).
// "from" asks "to"; nothing is shared until "to" accepts. Accepting creates the two
// PantryShare documents (one each way), see src/router/pantrysharing.js.
const neighbourInviteSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('NeighbourInvite', neighbourInviteSchema)
