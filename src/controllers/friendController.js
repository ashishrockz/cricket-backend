const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { FRIEND_STATUS } = require('../config/constants');

/**
 * @desc    Send friend request
 * @route   POST /api/v1/friends/request
 * @access  Private
 */
const sendFriendRequest = asyncHandler(async (req, res, next) => {
  const { recipientId } = req.body;
  const requesterId = req.user._id;

  if (requesterId.toString() === recipientId) {
    return next(ApiError.badRequest('You cannot send a friend request to yourself'));
  }

  const recipient = await User.findById(recipientId);
  if (!recipient || !recipient.isActive) {
    return next(ApiError.notFound('User not found'));
  }

  // Check existing friendship
  const existing = await Friendship.getFriendship(requesterId, recipientId);
  if (existing) {
    if (existing.status === FRIEND_STATUS.ACCEPTED) {
      return next(ApiError.conflict('You are already friends with this user'));
    }
    if (existing.status === FRIEND_STATUS.PENDING) {
      return next(ApiError.conflict('A friend request already exists between you'));
    }
    if (existing.status === FRIEND_STATUS.BLOCKED) {
      return next(ApiError.forbidden('Unable to send friend request'));
    }
    // If rejected, allow re-request by updating
    existing.requester = requesterId;
    existing.recipient = recipientId;
    existing.status = FRIEND_STATUS.PENDING;
    await existing.save();
    return ApiResponse.success(res, { friendship: existing }, 'Friend request sent');
  }

  const friendship = await Friendship.create({
    requester: requesterId,
    recipient: recipientId,
    status: FRIEND_STATUS.PENDING
  });

  ApiResponse.created(res, { friendship }, 'Friend request sent');
});

/**
 * @desc    Respond to friend request (accept/reject)
 * @route   PUT /api/v1/friends/request/:id
 * @access  Private
 */
const respondToRequest = asyncHandler(async (req, res, next) => {
  const { action } = req.body;
  const friendship = await Friendship.findById(req.params.id);

  if (!friendship) {
    return next(ApiError.notFound('Friend request not found'));
  }

  if (friendship.recipient.toString() !== req.user._id.toString()) {
    return next(ApiError.forbidden('You can only respond to requests sent to you'));
  }

  if (friendship.status !== FRIEND_STATUS.PENDING) {
    return next(ApiError.badRequest('This request has already been responded to'));
  }

  friendship.status = action === 'accept' ? FRIEND_STATUS.ACCEPTED : FRIEND_STATUS.REJECTED;
  await friendship.save();

  const message = action === 'accept' ? 'Friend request accepted' : 'Friend request rejected';
  ApiResponse.success(res, { friendship }, message);
});

/**
 * @desc    Get friends list
 * @route   GET /api/v1/friends
 * @access  Private
 */
const getFriendsList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const userId = req.user._id;

  const filter = {
    $or: [
      { requester: userId, status: FRIEND_STATUS.ACCEPTED },
      { recipient: userId, status: FRIEND_STATUS.ACCEPTED }
    ]
  };

  const [friendships, totalDocs] = await Promise.all([
    Friendship.find(filter)
      .populate('requester', 'username fullName avatar playingRole city')
      .populate('recipient', 'username fullName avatar playingRole city')
      .skip(skip).limit(limit).lean(),
    Friendship.countDocuments(filter)
  ]);

  const friends = friendships.map(f => {
    const friend = f.requester._id.toString() === userId.toString() ? f.recipient : f.requester;
    return { ...friend, friendshipId: f._id, friendsSince: f.updatedAt };
  });

  ApiResponse.paginated(res, friends, buildPaginationResponse(page, limit, totalDocs));
});

/**
 * @desc    Get pending friend requests (received)
 * @route   GET /api/v1/friends/requests/pending
 * @access  Private
 */
const getPendingRequests = asyncHandler(async (req, res) => {
  const requests = await Friendship.find({
    recipient: req.user._id,
    status: FRIEND_STATUS.PENDING
  })
    .populate('requester', 'username fullName avatar playingRole city')
    .sort({ createdAt: -1 })
    .lean();

  ApiResponse.success(res, { requests, count: requests.length });
});

/**
 * @desc    Get sent friend requests
 * @route   GET /api/v1/friends/requests/sent
 * @access  Private
 */
const getSentRequests = asyncHandler(async (req, res) => {
  const requests = await Friendship.find({
    requester: req.user._id,
    status: FRIEND_STATUS.PENDING
  })
    .populate('recipient', 'username fullName avatar playingRole city')
    .sort({ createdAt: -1 })
    .lean();

  ApiResponse.success(res, { requests, count: requests.length });
});

/**
 * @desc    Remove friend
 * @route   DELETE /api/v1/friends/:id
 * @access  Private
 */
const removeFriend = asyncHandler(async (req, res, next) => {
  const friendship = await Friendship.findById(req.params.id);
  if (!friendship) {
    return next(ApiError.notFound('Friendship not found'));
  }

  const userId = req.user._id.toString();
  if (friendship.requester.toString() !== userId && friendship.recipient.toString() !== userId) {
    return next(ApiError.forbidden('You can only remove your own friends'));
  }

  await Friendship.findByIdAndDelete(req.params.id);
  ApiResponse.success(res, null, 'Friend removed successfully');
});

module.exports = {
  sendFriendRequest, respondToRequest, getFriendsList,
  getPendingRequests, getSentRequests, removeFriend
};
