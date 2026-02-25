const Room = require('../models/Room');
const Match = require('../models/Match');
const User = require('../models/User');
const Friendship = require('../models/Friendship');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { paginate, buildPaginationResponse } = require('../utils/pagination');
const { ROOM_STATUS, PLAYER_TYPES, FRIEND_STATUS } = require('../config/constants');
const { getIO } = require('../socket/socketManager');
const { SOCKET_EVENTS } = require('../config/constants');
const { getPlanFeatures } = require('../services/subscriptionService');

/**
 * @desc    Create a new room
 * @route   POST /api/v1/rooms
 * @access  Private
 */
const createRoom = asyncHandler(async (req, res, next) => {
  const {
    name, matchFormat, totalOvers, teamAName, teamBName,
    venue, matchDate, maxPlayersPerTeam, isPrivate, creatorRole
  } = req.body;

  // ── Subscription plan limit check ──────────────────────────────────────────
  // Each room = one match. Admins bypass this check entirely.
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    const planSlug = req.user.subscriptionPlan || 'free';
    const features = await getPlanFeatures(planSlug);
    const maxRooms = features?.maxRooms ?? 3;

    if (maxRooms !== -1) {
      // Count rooms this user created in the current calendar month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const roomsThisMonth = await Room.countDocuments({
        creator: req.user._id,
        createdAt: { $gte: monthStart }
      });

      if (roomsThisMonth >= maxRooms) {
        const planLabel = planSlug.charAt(0).toUpperCase() + planSlug.slice(1);
        return next(ApiError.forbidden(
          `You have reached your ${planLabel} plan limit of ${maxRooms} match${maxRooms === 1 ? '' : 'es'} per month. ` +
          `Upgrade your subscription to create more matches.`
        ));
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  const roomCode = await Room.generateRoomCode();

  const room = await Room.create({
    roomCode,
    name,
    creator: req.user._id,
    members: [{
      user: req.user._id,
      role: creatorRole,
      joinedAt: new Date(),
      isPlaying: false,
      playingInTeam: null
    }],
    matchFormat,
    totalOvers,
    teamAName,
    teamBName,
    venue,
    matchDate: matchDate || new Date(),
    maxPlayersPerTeam: maxPlayersPerTeam || 11,
    isPrivate: isPrivate || false,
    inviteLink: `${process.env.APP_URL || 'http://localhost:3000'}/join/${roomCode}`
  });

  await room.populate('members.user', 'username fullName avatar');

  ApiResponse.created(res, { room }, 'Room created successfully');
});

/**
 * @desc    Join a room
 * @route   POST /api/v1/rooms/join/:roomCode
 * @access  Private
 */
const joinRoom = asyncHandler(async (req, res, next) => {
  const { roomCode } = req.params;
  const { role } = req.body;

  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) {
    return next(ApiError.notFound('Room not found'));
  }

  if (room.status !== ROOM_STATUS.WAITING && room.status !== ROOM_STATUS.READY) {
    return next(ApiError.badRequest(`Cannot join room. Room is currently ${room.status}`));
  }

  if (room.isMember(req.user._id)) {
    return next(ApiError.conflict('You are already a member of this room'));
  }

  if (room.isFull) {
    return next(ApiError.badRequest('Room is full. Maximum 3 members allowed'));
  }

  const availableRoles = room.getAvailableRoles();
  if (!availableRoles.includes(role)) {
    return next(ApiError.badRequest(`Role '${role}' is already taken. Available roles: ${availableRoles.join(', ')}`));
  }

  room.members.push({
    user: req.user._id,
    role,
    joinedAt: new Date()
  });

  if (room.members.length >= 2) {
    room.status = ROOM_STATUS.READY;
  }

  await room.save();
  await room.populate('members.user', 'username fullName avatar');

  // Notify room members via Socket.IO
  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.ROOM_USER_JOINED, {
      user: { id: req.user._id, username: req.user.username, fullName: req.user.fullName },
      role,
      memberCount: room.members.length
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.success(res, { room }, 'Joined room successfully');
});

/**
 * @desc    Leave a room
 * @route   POST /api/v1/rooms/:id/leave
 * @access  Private
 */
const leaveRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) {
    return next(ApiError.notFound('Room not found'));
  }

  if (!room.isMember(req.user._id)) {
    return next(ApiError.badRequest('You are not a member of this room'));
  }

  if (room.status === ROOM_STATUS.LIVE) {
    return next(ApiError.badRequest('Cannot leave room during a live match'));
  }

  if (room.isCreator(req.user._id) && room.members.length > 1) {
    return next(ApiError.badRequest('Room creator cannot leave while other members are present. Transfer ownership or remove members first.'));
  }

  room.members = room.members.filter(m => m.user.toString() !== req.user._id.toString());

  if (room.members.length === 0) {
    room.status = ROOM_STATUS.CANCELLED;
  } else if (room.members.length < 2) {
    room.status = ROOM_STATUS.WAITING;
  }

  await room.save();

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.ROOM_USER_LEFT, {
      user: { id: req.user._id, username: req.user.username },
      memberCount: room.members.length
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.success(res, null, 'Left room successfully');
});

/**
 * @desc    Get room details
 * @route   GET /api/v1/rooms/:id
 * @access  Private
 */
const getRoomDetails = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id)
    .populate('members.user', 'username fullName avatar playingRole')
    .populate('creator', 'username fullName avatar')
    .populate('match');

  if (!room) {
    return next(ApiError.notFound('Room not found'));
  }

  ApiResponse.success(res, { room });
});

/**
 * @desc    Get room by code
 * @route   GET /api/v1/rooms/code/:roomCode
 * @access  Private
 */
const getRoomByCode = asyncHandler(async (req, res, next) => {
  const room = await Room.findOne({ roomCode: req.params.roomCode.toUpperCase() })
    .populate('members.user', 'username fullName avatar playingRole')
    .populate('creator', 'username fullName avatar');

  if (!room) {
    return next(ApiError.notFound('Room not found'));
  }

  ApiResponse.success(res, { room });
});

/**
 * @desc    Add player to a team in the room
 * @route   POST /api/v1/rooms/:id/players
 * @access  Private
 */
const addPlayerToTeam = asyncHandler(async (req, res, next) => {
  const { team, playerType, userId, name, playingRole, battingStyle, bowlingStyle, isCaptain, isWicketKeeper } = req.body;

  const room = await Room.findById(req.params.id);
  if (!room) {
    return next(ApiError.notFound('Room not found'));
  }

  // Verify requester is a member
  if (!room.isMember(req.user._id)) {
    return next(ApiError.forbidden('Only room members can add players'));
  }

  // Verify the requester's role allows team management
  const member = room.getMember(req.user._id);
  const isCreator = room.isCreator(req.user._id);
  const canManageTeamA = isCreator || member.role === 'team_a_manager';
  const canManageTeamB = isCreator || member.role === 'team_b_manager';

  if (team === 'team_a' && !canManageTeamA) {
    return next(ApiError.forbidden('You are not authorized to manage Team A'));
  }
  if (team === 'team_b' && !canManageTeamB) {
    return next(ApiError.forbidden('You are not authorized to manage Team B'));
  }

  // If we already have a match, add to match teams
  let match = room.match ? await Match.findById(room.match) : null;

  // Create match if not exists
  if (!match) {
    match = await Match.create({
      room: room._id,
      format: room.matchFormat,
      totalOvers: room.totalOvers,
      teamA: { name: room.teamAName, players: [] },
      teamB: { name: room.teamBName, players: [] },
      venue: room.venue,
      matchDate: room.matchDate,
      createdBy: room.creator
    });
    room.match = match._id;
    await room.save();
  }

  const targetTeam = team === 'team_a' ? match.teamA : match.teamB;

  // Check max players
  if (targetTeam.players.length >= room.maxPlayersPerTeam) {
    return next(ApiError.badRequest(`Team already has maximum ${room.maxPlayersPerTeam} players`));
  }

  let playerData = {
    playerType,
    playingRole: playingRole || 'batsman',
    battingStyle: battingStyle || 'right_hand',
    bowlingStyle: bowlingStyle || 'none',
    isCaptain: isCaptain || false,
    isWicketKeeper: isWicketKeeper || false,
    battingOrder: targetTeam.players.length + 1
  };

  if (playerType === PLAYER_TYPES.REGISTERED) {
    const registeredUser = await User.findById(userId);
    if (!registeredUser) {
      return next(ApiError.notFound('User not found'));
    }

    // Check if user is already in a team
    const existsInA = match.teamA.players.some(p => p.user && p.user.toString() === userId);
    const existsInB = match.teamB.players.some(p => p.user && p.user.toString() === userId);
    if (existsInA || existsInB) {
      return next(ApiError.conflict('This player is already in a team'));
    }

    // Check friendship (only non-room-members need to be friends)
    if (!room.isMember(userId)) {
      const areFriends = await Friendship.areFriends(req.user._id, userId);
      if (!areFriends) {
        return next(ApiError.badRequest('You can only add friends or room members as registered players'));
      }
    }

    playerData.user = userId;
    playerData.name = registeredUser.fullName;
    playerData.playingRole = playingRole || registeredUser.playingRole;
    playerData.battingStyle = battingStyle || registeredUser.battingStyle;
    playerData.bowlingStyle = bowlingStyle || registeredUser.bowlingStyle;
  } else {
    playerData.name = name;
  }

  targetTeam.players.push(playerData);
  await match.save();

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.ROOM_UPDATED, {
      type: 'player_added',
      team,
      player: playerData
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.created(res, {
    match: {
      teamA: match.teamA,
      teamB: match.teamB
    }
  }, 'Player added to team');
});

/**
 * @desc    Remove player from team
 * @route   DELETE /api/v1/rooms/:id/players/:playerId
 * @access  Private
 */
const removePlayerFromTeam = asyncHandler(async (req, res, next) => {
  const room = await Room.findById(req.params.id);
  if (!room) return next(ApiError.notFound('Room not found'));

  if (!room.isMember(req.user._id)) {
    return next(ApiError.forbidden('Only room members can remove players'));
  }

  if (!room.match) return next(ApiError.badRequest('No match created yet'));

  const match = await Match.findById(room.match);
  if (!match) return next(ApiError.notFound('Match not found'));

  if (match.status !== 'not_started') {
    return next(ApiError.badRequest('Cannot remove players after match has started'));
  }

  const playerId = req.params.playerId;
  let removed = false;

  // Try removing from both teams
  const indexA = match.teamA.players.findIndex(p => p._id.toString() === playerId);
  if (indexA > -1) {
    match.teamA.players.splice(indexA, 1);
    removed = true;
  }
  const indexB = match.teamB.players.findIndex(p => p._id.toString() === playerId);
  if (indexB > -1) {
    match.teamB.players.splice(indexB, 1);
    removed = true;
  }

  if (!removed) return next(ApiError.notFound('Player not found in any team'));

  await match.save();
  ApiResponse.success(res, { match: { teamA: match.teamA, teamB: match.teamB } }, 'Player removed');
});

/**
 * @desc    Get user's rooms
 * @route   GET /api/v1/rooms/my-rooms
 * @access  Private
 */
const getMyRooms = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const userId = req.user._id;

  const filter = {
    $or: [
      { creator: userId },
      { 'members.user': userId }
    ]
  };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [rooms, totalDocs] = await Promise.all([
    Room.find(filter)
      .populate('creator', 'username fullName avatar')
      .populate('members.user', 'username fullName avatar')
      .sort({ updatedAt: -1 })
      .skip(skip).limit(limit).lean(),
    Room.countDocuments(filter)
  ]);

  ApiResponse.paginated(res, rooms, buildPaginationResponse(page, limit, totalDocs));
});

module.exports = {
  createRoom, joinRoom, leaveRoom, getRoomDetails, getRoomByCode,
  addPlayerToTeam, removePlayerFromTeam, getMyRooms
};
