const mongoose = require('mongoose');
const crypto = require('crypto');
const { ROOM_STATUS, ROOM_ROLES, MATCH_FORMATS } = require('../config/constants');

const roomMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: Object.values(ROOM_ROLES),
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  isPlaying: {
    type: Boolean,
    default: false
  },
  playingInTeam: {
    type: String,
    enum: ['team_a', 'team_b', null],
    default: null
  }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [100, 'Room name cannot exceed 100 characters']
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [roomMemberSchema],
  status: {
    type: String,
    enum: Object.values(ROOM_STATUS),
    default: ROOM_STATUS.WAITING,
    index: true
  },
  matchFormat: {
    type: String,
    enum: Object.values(MATCH_FORMATS),
    default: MATCH_FORMATS.T20
  },
  totalOvers: {
    type: Number,
    required: [true, 'Total overs is required'],
    min: [1, 'Minimum 1 over'],
    max: [90, 'Maximum 90 overs']
  },
  teamAName: {
    type: String,
    required: [true, 'Team A name is required'],
    trim: true,
    maxlength: [50, 'Team name cannot exceed 50 characters']
  },
  teamBName: {
    type: String,
    required: [true, 'Team B name is required'],
    trim: true,
    maxlength: [50, 'Team name cannot exceed 50 characters']
  },
  venue: {
    type: String,
    trim: true,
    maxlength: [200, 'Venue cannot exceed 200 characters']
  },
  matchDate: {
    type: Date,
    default: Date.now
  },
  maxPlayersPerTeam: {
    type: Number,
    default: 11,
    min: [2, 'Minimum 2 players per team'],
    max: [18, 'Maximum 18 players per team']
  },
  match: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    default: null
  },
  inviteLink: {
    type: String,
    default: null
  },
  spectatorCount: {
    type: Number,
    default: 0
  },
  isPrivate: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
roomSchema.index({ creator: 1 });
roomSchema.index({ status: 1, createdAt: -1 });
roomSchema.index({ 'members.user': 1 });

// Virtual: member count
roomSchema.virtual('memberCount').get(function () {
  return this.members ? this.members.length : 0;
});

// Virtual: is full
roomSchema.virtual('isFull').get(function () {
  return this.members && this.members.length >= 3;
});

// Static: generate unique room code
roomSchema.statics.generateRoomCode = async function () {
  let code;
  let exists = true;
  while (exists) {
    code = 'CRK-' + crypto.randomInt(1000, 9999).toString();
    exists = await this.findOne({ roomCode: code });
  }
  return code;
};

// Method: check if user is member
roomSchema.methods.isMember = function (userId) {
  return this.members.some(m => m.user.toString() === userId.toString());
};

// Method: check if user is creator
roomSchema.methods.isCreator = function (userId) {
  return this.creator.toString() === userId.toString();
};

// Method: get member by user ID
roomSchema.methods.getMember = function (userId) {
  return this.members.find(m => m.user.toString() === userId.toString());
};

// Method: get available roles
roomSchema.methods.getAvailableRoles = function () {
  const takenRoles = this.members.map(m => m.role);
  return Object.values(ROOM_ROLES).filter(r => !takenRoles.includes(r));
};

// Pre-validate: ensure unique roles
roomSchema.pre('validate', function (next) {
  if (this.members && this.members.length > 1) {
    const roles = this.members.map(m => m.role);
    const uniqueRoles = new Set(roles);
    if (roles.length !== uniqueRoles.size) {
      return next(new Error('Each room member must have a unique role'));
    }
  }
  next();
});

module.exports = mongoose.model('Room', roomSchema);
