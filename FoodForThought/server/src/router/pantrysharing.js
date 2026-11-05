// Neighbour Pantry: sharing pantries with friends and borrowing from them (Community page).
// Mounted inside the pantry router (pantry.js), so every route is under /pantry and needs a login.
//
// Neighbours (both people must agree before anything is shared)
//   GET    /pantry/neighbours                       -> { friends, invites: { incoming, outgoing } }
//   GET    /pantry/neighbours/search?q=alex         -> people you could invite (name or exact email)
//   GET    /pantry/neighbours/:friendId             -> that neighbour's pantry (only if you are neighbours)
//   POST   /pantry/friends/:userId                  -> send a neighbour invite
//   PATCH  /pantry/friends/invites/:inviteId        -> { action: 'accept' | 'decline' } (the person invited)
//   DELETE /pantry/friends/invites/:inviteId        -> cancel an invite you sent
//   DELETE /pantry/friends/:friendId                -> stop being neighbours (both stop seeing each other's pantry)
//
// Borrow requests
//   GET    /pantry/requests                         -> { incoming (waiting for you), outgoing (yours, incl. recent answers) }
//   POST   /pantry/requests                         -> { friendId, items: [{ itemId, quantity }], message? }
//   PATCH  /pantry/requests/:requestId              -> { status: 'approved' | 'rejected' } (the pantry owner)
//   DELETE /pantry/requests/:requestId              -> cancel a request you sent that is still pending
//
// Approving moves the items: taken from the owner's pantry, added to the borrower's.

const express = require('express')
const mongoose = require('mongoose')
const User = require('../../models/User')
const Pantry = require('../../models/Pantry')
const PantryShare = require('../../models/PantryShare')
const PantryRequest = require('../../models/PantryRequest')
const NeighbourInvite = require('../../models/NeighbourInvite')
const { convertAmount } = require('../services/units')
const { normalizePantryItemName } = require('../services/pantryrequestapproval')
const { httpError } = require('../utils/http')

// What a neighbour can do with your pantry. Same for everyone for now.
const DEFAULT_PERMISSIONS = { canView: true, canBuy: true, canBorrow: true, canTakeover: false }
// How long answered/cancelled requests stay in the borrower's list
const HISTORY_DAYS = 14

const round3 = (n) => Math.round(n * 1000) / 1000
const sameId = (a, b) => String(a?._id || a) === String(b?._id || b)

function checkId(id, what) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, `${what} not found`)
}

// "alex.tan@gmail.com" -> "a•••@gmail.com": enough to tell two Alexes apart without showing the whole address
function maskEmail(email = '') {
  const [name, domain] = String(email).split('@')
  if (!domain) return ''
  return `${name.slice(0, 1)}•••@${domain}`
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Transactions need a replica set (Atlas has one); a plain local MongoDB doesn't. Asked once, then remembered.
let transactionsSupported = null
async function canUseTransactions() {
  if (transactionsSupported === null) {
    try {
      const info = await mongoose.connection.db.admin().command({ hello: 1 })
      transactionsSupported = Boolean(info.setName || info.msg === 'isdbgrid')
    } catch {
      transactionsSupported = false
    }
  }
  return transactionsSupported
}

// Runs the work in a transaction, so a failed approval can't leave items taken from one pantry but not added
// to the other. Without transaction support it runs the same steps directly (checks still happen first).
async function runAtomically(work) {
  if (!(await canUseTransactions())) return work(null)
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(() => work(session))
  } finally {
    await session.endSession()
  }
}

module.exports = function createPantrySharingRouter({ PantryLegacy, pantryUserQuery, handle }) {
  const router = express.Router()

  // Are these two people neighbours? (accepting an invite creates a share each way)
  const findShare = (ownerId, friendId) => PantryShare.findOne({ owner: ownerId, friend: friendId, status: 'active' })

  // Cancel every pending borrow request between two people (used when they stop being neighbours)
  const cancelRequestsBetween = (a, b) => PantryRequest.updateMany(
    { status: 'pending', $or: [{ requester: a, owner: b }, { requester: b, owner: a }] },
    { $set: { status: 'cancelled', respondedAt: new Date() } }
  )

  /* ---------------- Neighbours ---------------- */

  // GET /pantry/neighbours
  router.get('/neighbours', handle(async (req, res) => {
    const [shares, incoming, outgoing] = await Promise.all([
      PantryShare.find({ owner: req.userId, status: 'active' }).populate('friend', '_id name email').lean(),
      NeighbourInvite.find({ to: req.userId, status: 'pending' }).populate('from', '_id name email').sort({ createdAt: -1 }).lean(),
      NeighbourInvite.find({ from: req.userId, status: 'pending' }).populate('to', '_id name email').sort({ createdAt: -1 }).lean(),
    ])

    const friends = shares
      .filter((share) => share.friend) // the other account was deleted
      .map((share) => ({ _id: String(share.friend._id), name: share.friend.name, email: share.friend.email, since: share.createdAt }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const person = (user) => user && { _id: String(user._id), name: user.name, emailHint: maskEmail(user.email) }
    res.json({
      friends,
      invites: {
        incoming: incoming.filter((i) => i.from).map((i) => ({ _id: i._id, from: person(i.from), createdAt: i.createdAt })),
        outgoing: outgoing.filter((i) => i.to).map((i) => ({ _id: i._id, to: person(i.to), createdAt: i.createdAt })),
      },
    })
  }))

  // GET /pantry/neighbours/search?q=   (at least 2 letters; matches a name, or a whole email address)
  router.get('/neighbours/search', handle(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 60)
    if (q.length < 2) return res.json({ users: [] })

    const users = await User.find({
      _id: { $ne: req.userId },
      role: { $ne: 'admin' },
      $or: [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { email: q.toLowerCase() }],
    }).select('_id name email').sort({ name: 1 }).limit(8).lean()

    const ids = users.map((u) => u._id)
    const [shares, invites] = await Promise.all([
      PantryShare.find({ owner: req.userId, friend: { $in: ids }, status: 'active' }).select('friend').lean(),
      NeighbourInvite.find({
        status: 'pending',
        $or: [{ from: req.userId, to: { $in: ids } }, { to: req.userId, from: { $in: ids } }],
      }).lean(),
    ])

    res.json({
      users: users.map((user) => {
        const invite = invites.find((i) => sameId(i.from, user._id) || sameId(i.to, user._id))
        let relation = 'none'
        if (shares.some((s) => sameId(s.friend, user._id))) relation = 'neighbour'
        else if (invite) relation = sameId(invite.from, req.userId) ? 'invited' : 'invitedYou'
        return { _id: String(user._id), name: user.name, emailHint: maskEmail(user.email), relation, inviteId: invite?._id || null }
      }),
    })
  }))

  // Both shares (one each way) so each neighbour can see the other's pantry
  async function connect(a, b) {
    await Promise.all([
      PantryShare.findOneAndUpdate({ owner: a, friend: b }, { $set: { ...DEFAULT_PERMISSIONS, status: 'active' } }, { upsert: true, setDefaultsOnInsert: true }),
      PantryShare.findOneAndUpdate({ owner: b, friend: a }, { $set: { ...DEFAULT_PERMISSIONS, status: 'active' } }, { upsert: true, setDefaultsOnInsert: true }),
    ])
  }

  // POST /pantry/friends/:userId   send an invite
  router.post('/friends/:userId', handle(async (req, res) => {
    const otherId = req.params.userId
    checkId(otherId, 'User')
    if (otherId === req.userId) throw httpError(400, "You can't add yourself as a neighbour.")

    const other = await User.findOne({ _id: otherId, role: { $ne: 'admin' } }).select('_id name').lean()
    if (!other) throw httpError(404, 'User not found')

    if (await findShare(req.userId, otherId)) throw httpError(409, `${other.name} is already your neighbour.`)

    if (await NeighbourInvite.exists({ from: req.userId, to: otherId, status: 'pending' })) {
      throw httpError(409, `You've already invited ${other.name}.`)
    }

    // They already invited you: sending one back counts as accepting theirs
    const theirs = await NeighbourInvite.findOne({ from: otherId, to: req.userId, status: 'pending' })
    if (theirs) {
      await connect(req.userId, otherId)
      theirs.status = 'accepted'
      await theirs.save()
      return res.json({ message: `You and ${other.name} are now neighbours.`, connected: true })
    }

    const invite = await NeighbourInvite.create({ from: req.userId, to: otherId })
    res.status(201).json({ message: `Invite sent to ${other.name}. Their pantry shows up once they accept.`, invite })
  }))

  // PATCH /pantry/friends/invites/:inviteId   { action: 'accept' | 'decline' }
  router.patch('/friends/invites/:inviteId', handle(async (req, res) => {
    const { action } = req.body || {}
    if (!['accept', 'decline'].includes(action)) throw httpError(400, 'Action must be accept or decline.')
    checkId(req.params.inviteId, 'Invite')

    const invite = await NeighbourInvite.findOne({ _id: req.params.inviteId, to: req.userId, status: 'pending' }).populate('from', '_id name')
    if (!invite || !invite.from) throw httpError(404, 'This invite is no longer available.')

    if (action === 'accept') {
      await connect(req.userId, invite.from._id)
      invite.status = 'accepted'
    } else {
      invite.status = 'declined'
    }
    await invite.save()

    res.json({
      message: action === 'accept' ? `You and ${invite.from.name} are now neighbours.` : `Invite from ${invite.from.name} declined.`,
    })
  }))

  // DELETE /pantry/friends/invites/:inviteId   cancel an invite you sent
  router.delete('/friends/invites/:inviteId', handle(async (req, res) => {
    checkId(req.params.inviteId, 'Invite')
    const invite = await NeighbourInvite.findOneAndUpdate(
      { _id: req.params.inviteId, from: req.userId, status: 'pending' },
      { $set: { status: 'cancelled' } }
    )
    if (!invite) throw httpError(404, 'This invite is no longer pending.')
    res.json({ message: 'Invite cancelled.' })
  }))

  // DELETE /pantry/friends/:friendId   stop being neighbours
  router.delete('/friends/:friendId', handle(async (req, res) => {
    const friendId = req.params.friendId
    checkId(friendId, 'Neighbour')

    const removed = await PantryShare.deleteMany({
      $or: [{ owner: req.userId, friend: friendId }, { owner: friendId, friend: req.userId }],
    })
    if (!removed.deletedCount) throw httpError(404, 'This person is not your neighbour.')

    const cancelled = await cancelRequestsBetween(req.userId, friendId)
    res.json({
      message: 'Removed from your neighbours. You no longer see each other\'s pantry.',
      cancelledRequests: cancelled.modifiedCount || 0,
    })
  }))

  // GET /pantry/neighbours/:friendId   a neighbour's pantry
  router.get('/neighbours/:friendId', handle(async (req, res) => {
    const friendId = req.params.friendId
    checkId(friendId, 'Neighbour')

    const share = await findShare(friendId, req.userId).lean()
    if (!share || !share.canView) {
      throw httpError(403, 'This neighbour has not shared their pantry with you.')
    }

    const friend = await User.findById(friendId).select('_id name').lean()
    if (!friend) throw httpError(404, 'Neighbour not found')

    const items = await PantryLegacy.find(pantryUserQuery(friendId)).sort({ category: 1, name: 1 }).lean()

    res.json({
      friend,
      access: { canView: share.canView, canBorrow: share.canBorrow },
      items: items.map((item) => ({
        _id: String(item._id),
        name: item.name,
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'pcs',
        category: item.category || 'other',
        expiryDate: item.expiryDate || null,
      })),
    })
  }))

  /* ---------------- Borrow requests ---------------- */

  // GET /pantry/requests
  router.get('/requests', handle(async (req, res) => {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000)
    const [incoming, outgoing] = await Promise.all([
      PantryRequest.find({ owner: req.userId, status: 'pending', requestType: 'borrow' })
        .populate('requester', '_id name').sort({ createdAt: -1 }).lean(),
      PantryRequest.find({
        requester: req.userId,
        requestType: 'borrow',
        $or: [{ status: 'pending' }, { updatedAt: { $gte: since } }],
      }).populate('owner', '_id name').sort({ createdAt: -1 }).limit(20).lean(),
    ])

    // Hide requests from/to an account that was deleted (populate gives null for them)
    res.json({ incoming: incoming.filter((r) => r.requester), outgoing: outgoing.filter((r) => r.owner) })
  }))

  // POST /pantry/requests   { friendId, items: [{ itemId, quantity }], message? }
  router.post('/requests', handle(async (req, res) => {
    const { friendId, message, items } = req.body || {}
    const requestType = req.body?.requestType || 'borrow'

    if (requestType !== 'borrow') throw httpError(400, 'Only borrow requests are supported.')
    if (!friendId) throw httpError(400, 'Choose a neighbour to borrow from.')
    checkId(friendId, 'Neighbour')

    const picked = Array.isArray(items) ? items : []
    if (picked.length === 0) throw httpError(400, 'Please select at least one item to borrow.')
    if (picked.length > 20) throw httpError(400, 'You can borrow up to 20 items in one request.')

    const share = await findShare(friendId, req.userId)
    if (!share) throw httpError(403, 'You need to be neighbours before you can borrow.')
    if (!share.canBorrow) throw httpError(403, 'This neighbour has turned off borrow requests.')

    // Use the owner's own item (name, unit, what's left), not what the browser sent
    const ownerItems = await PantryLegacy.find({ ...pantryUserQuery(friendId), _id: { $in: picked.map((i) => i.itemId).filter(mongoose.isValidObjectId) } }).lean()
    const requestItems = picked.map((pick) => {
      const ownerItem = ownerItems.find((o) => sameId(o._id, pick.itemId))
      if (!ownerItem) throw httpError(409, 'One of these ingredients is no longer in their pantry. Refresh and try again.')

      const quantity = Number(pick.quantity)
      const available = Number(ownerItem.quantity) || 0
      if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(400, `Enter how much ${ownerItem.name} you need.`)
      if (quantity > available) throw httpError(400, `They only have ${available} ${ownerItem.unit || 'pcs'} of ${ownerItem.name}.`)

      return { itemId: String(ownerItem._id), name: ownerItem.name, quantity: round3(quantity), unit: ownerItem.unit || 'pcs' }
    })

    if (new Set(requestItems.map((i) => i.itemId)).size !== requestItems.length) {
      throw httpError(400, 'Each ingredient can only be in a request once.')
    }

    // Don't ask for the same thing twice while the first ask is still waiting
    const waiting = await PantryRequest.find({ requester: req.userId, owner: friendId, status: 'pending' }).lean()
    const repeat = requestItems.find((item) => waiting.some((w) => w.items.some((i) => i.itemId === item.itemId)))
    if (repeat) throw httpError(409, `You already asked for ${repeat.name}. Wait for an answer or cancel that request first.`)

    const request = await PantryRequest.create({
      requester: req.userId,
      owner: friendId,
      requestType: 'borrow',
      items: requestItems,
      message: String(message || '').trim().slice(0, 300),
      status: 'pending',
    })

    const owner = await User.findById(friendId).select('name').lean()
    res.status(201).json({ message: `Borrow request sent to ${owner?.name || 'your neighbour'}.`, request })
  }))

  // DELETE /pantry/requests/:requestId   the borrower cancels a pending request
  router.delete('/requests/:requestId', handle(async (req, res) => {
    checkId(req.params.requestId, 'Request')
    const request = await PantryRequest.findOneAndUpdate(
      { _id: req.params.requestId, requester: req.userId, status: 'pending' },
      { $set: { status: 'cancelled', respondedAt: new Date() } },
      { new: true }
    )
    if (!request) throw httpError(404, 'This request has already been answered or cancelled.')
    res.json({ message: 'Request cancelled.', request })
  }))

  // PATCH /pantry/requests/:requestId   the owner approves or rejects
  router.patch('/requests/:requestId', handle(async (req, res) => {
    const { status } = req.body || {}
    if (!['approved', 'rejected'].includes(status)) throw httpError(400, 'Status must be approved or rejected.')
    checkId(req.params.requestId, 'Request')

    let request
    await runAtomically(async (session) => {
      request = await PantryRequest.findOne({
        _id: req.params.requestId,
        owner: req.userId,
        requestType: 'borrow',
        status: 'pending',
      }).session(session)
      if (!request) throw httpError(404, 'This request has already been answered or cancelled.')

      if (status === 'approved') {
        const requesterId = String(request.requester)
        // The borrower's account may have been deleted: never move items to nobody
        if (!(await User.exists({ _id: requesterId }).session(session))) {
          throw httpError(409, 'This person no longer has an account, so nothing was moved.')
        }
        if (!(await findShare(req.userId, requesterId).session(session))) {
          throw httpError(409, 'You are no longer neighbours, so this request can\'t be approved.')
        }
        // Check every item first, then move them, so a problem with one item changes nothing
        const moves = []
        for (const item of request.items) {
          moves.push(await planMove({ item, ownerId: req.userId, requesterId, session }))
        }
        for (const move of moves) await applyMove(move, session)
      }

      request.status = status
      request.respondedAt = new Date()
      await request.save({ session })
    })

    res.json({ message: status === 'approved' ? 'Approved. The items were moved to their pantry.' : 'Request rejected.', request })
  }))

  // Works out how one requested item moves, and checks it can (enough left, units that convert).
  // Changes nothing: applyMove() does the writes once every item has passed.
  async function planMove({ item, ownerId, requesterId, session }) {
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(400, `The amount of ${item.name} must be above 0.`)

    const ownerItem = await PantryLegacy.findOne({
      ...pantryUserQuery(ownerId),
      $or: [
        ...(mongoose.isValidObjectId(item.itemId) ? [{ _id: item.itemId }] : []),
        { normalizedName: normalizePantryItemName(item.name) },
      ],
    }).session(session)
    if (!ownerItem) throw httpError(409, `${item.name} is no longer in your pantry.`)

    const ownerUnit = String(ownerItem.unit || 'pcs')
    const asOwnerUnit = convertAmount(quantity, item.unit || ownerUnit, ownerUnit, item.name)
    const transferQty = Number.isFinite(asOwnerUnit) ? asOwnerUnit : quantity
    const ownerQty = Number(ownerItem.quantity) || 0
    if (ownerQty < transferQty) throw httpError(409, `You don't have enough ${item.name} left to approve this.`)

    const requesterItem = await PantryLegacy.findOne({
      ...pantryUserQuery(requesterId),
      normalizedName: normalizePantryItemName(item.name),
    }).session(session)

    let added = transferQty
    if (requesterItem) {
      added = convertAmount(transferQty, ownerUnit, String(requesterItem.unit || ownerUnit), item.name)
      if (!Number.isFinite(added)) {
        throw httpError(409, `They keep ${item.name} in ${requesterItem.unit} but you have it in ${ownerUnit}, so it can't be added to their pantry automatically.`)
      }
    }

    return { item, ownerItem, ownerUnit, remaining: round3(ownerQty - transferQty), requesterId, requesterItem, added, transferQty }
  }

  // Owner: subtract (or remove the row when it's all gone). Borrower: add to their row, or create one.
  async function applyMove(move, session) {
    const { item, ownerItem, ownerUnit, remaining, requesterId, requesterItem, added, transferQty } = move

    if (remaining <= 0) await PantryLegacy.deleteOne({ _id: ownerItem._id }, { session })
    else await PantryLegacy.updateOne({ _id: ownerItem._id }, { $set: { quantity: remaining } }, { session })

    if (requesterItem) {
      await PantryLegacy.updateOne(
        { _id: requesterItem._id },
        { $set: { quantity: round3((Number(requesterItem.quantity) || 0) + added) } },
        { session }
      )
    } else {
      await Pantry.create([{
        user: requesterId,
        name: ownerItem.name || item.name,
        quantity: round3(transferQty),
        unit: ownerUnit,
        category: ownerItem.category || 'other',
        ...(ownerItem.expiryDate ? { expiryDate: ownerItem.expiryDate } : {}),
      }], { session })
    }
  }

  return router
}
