const mongoose = require('mongoose');
const { MATCH_STATUS, MATCH_FORMATS, PLAYER_TYPES, PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES, DISMISSAL_TYPES } = require('../config/constants');

// ============================================
// SUB-SCHEMAS
// ============================================
const playerInTeamSchema = new mongoose.Schema({
  playerType: {
    type: String,
    enum: Object.values(PLAYER_TYPES),
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  name: {
    type: String,
    required: [true, 'Player name is required'],
    trim: true,
    maxlength: 100
  },
  playingRole: {
    type: String,
    enum: Object.values(PLAYING_ROLES),
    default: PLAYING_ROLES.BATSMAN
  },
  battingStyle: {
    type: String,
    enum: Object.values(BATTING_STYLES),
    default: BATTING_STYLES.RIGHT_HAND
  },
  bowlingStyle: {
    type: String,
    enum: Object.values(BOWLING_STYLES),
    default: BOWLING_STYLES.NONE
  },
  battingOrder: {
    type: Number,
    default: 0
  },
  isCaptain: { type: Boolean, default: false },
  isWicketKeeper: { type: Boolean, default: false }
});

const battingStatsSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, required: true },
  playerName: String,
  runs: { type: Number, default: 0 },
  ballsFaced: { type: Number, default: 0 },
  fours: { type: Number, default: 0 },
  sixes: { type: Number, default: 0 },
  isOut: { type: Boolean, default: false },
  dismissalType: { type: String, enum: [...Object.values(DISMISSAL_TYPES), null], default: null },
  dismissedBy: { type: String, default: null },
  fielder: { type: String, default: null },
  isNotOut: { type: Boolean, default: true },
  isOnStrike: { type: Boolean, default: false },
  isRetired: { type: Boolean, default: false },
  position: { type: Number, default: 0 }
}, { _id: true });

battingStatsSchema.virtual('strikeRate').get(function () {
  return this.ballsFaced > 0 ? ((this.runs / this.ballsFaced) * 100).toFixed(2) : '0.00';
});

const bowlingStatsSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, required: true },
  playerName: String,
  overs: { type: Number, default: 0 },
  balls: { type: Number, default: 0 },
  maidens: { type: Number, default: 0 },
  runsConceded: { type: Number, default: 0 },
  wickets: { type: Number, default: 0 },
  wides: { type: Number, default: 0 },
  noBalls: { type: Number, default: 0 },
  dotBalls: { type: Number, default: 0 },
  fours: { type: Number, default: 0 },
  sixes: { type: Number, default: 0 },
  currentOverRuns: { type: Number, default: 0 } // resets each over, used for maiden detection
}, { _id: true });

bowlingStatsSchema.virtual('economyRate').get(function () {
  const totalOvers = this.overs + (this.balls / 6);
  return totalOvers > 0 ? (this.runsConceded / totalOvers).toFixed(2) : '0.00';
});

const partnershipSchema = new mongoose.Schema({
  batsman1: { type: String, required: true },
  batsman2: { type: String, required: true },
  runs: { type: Number, default: 0 },
  balls: { type: Number, default: 0 },
  wicketNumber: { type: Number, required: true }
});

const fallOfWicketSchema = new mongoose.Schema({
  wicketNumber: Number,
  playerName: String,
  score: Number,
  overs: String,
  dismissalType: String
});

const inningsSchema = new mongoose.Schema({
  inningsNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 4
  },
  battingTeam: {
    type: String,
    enum: ['team_a', 'team_b'],
    required: true
  },
  bowlingTeam: {
    type: String,
    enum: ['team_a', 'team_b'],
    required: true
  },
  totalRuns: { type: Number, default: 0 },
  totalWickets: { type: Number, default: 0 },
  totalOvers: { type: Number, default: 0 },
  totalBalls: { type: Number, default: 0 },
  extras: {
    wides: { type: Number, default: 0 },
    noBalls: { type: Number, default: 0 },
    byes: { type: Number, default: 0 },
    legByes: { type: Number, default: 0 },
    penalty: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  battingStats: [battingStatsSchema],
  bowlingStats: [bowlingStatsSchema],
  partnerships: [partnershipSchema],
  fallOfWickets: [fallOfWicketSchema],
  currentBatsmen: {
    striker: { type: mongoose.Schema.Types.ObjectId, default: null },
    nonStriker: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  currentBowler: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  isDeclared: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  target: { type: Number, default: null }
});

inningsSchema.virtual('runRate').get(function () {
  const overs = this.totalOvers + (this.totalBalls / 6);
  return overs > 0 ? (this.totalRuns / overs).toFixed(2) : '0.00';
});

inningsSchema.virtual('oversDisplay').get(function () {
  return `${this.totalOvers}.${this.totalBalls}`;
});

// ============================================
// MAIN MATCH SCHEMA
// ============================================
const matchSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  format: {
    type: String,
    enum: Object.values(MATCH_FORMATS),
    required: true
  },
  totalOvers: {
    type: Number,
    required: true,
    min: 1,
    max: 90
  },
  status: {
    type: String,
    enum: Object.values(MATCH_STATUS),
    default: MATCH_STATUS.NOT_STARTED,
    index: true
  },
  teamA: {
    name: { type: String, required: true },
    players: [playerInTeamSchema]
  },
  teamB: {
    name: { type: String, required: true },
    players: [playerInTeamSchema]
  },
  toss: {
    wonBy: { type: String, enum: ['team_a', 'team_b', null], default: null },
    decision: { type: String, enum: ['bat', 'bowl', null], default: null }
  },
  innings: [inningsSchema],
  currentInnings: {
    type: Number,
    default: 0
  },
  result: {
    winner: { type: String, enum: ['team_a', 'team_b', 'draw', 'tie', 'no_result', null], default: null },
    winMargin: { type: Number, default: null },
    winType: { type: String, enum: ['runs', 'wickets', null], default: null },
    summary: { type: String, default: null }
  },
  manOfTheMatch: {
    player: { type: mongoose.Schema.Types.ObjectId, default: null },
    playerName: { type: String, default: null },
    votes: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      votedFor: mongoose.Schema.Types.ObjectId
    }]
  },
  venue: String,
  matchDate: { type: Date, default: Date.now },
  startedAt: Date,
  completedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
matchSchema.index({ room: 1, status: 1 });
matchSchema.index({ createdBy: 1, createdAt: -1 });
matchSchema.index({ 'teamA.players.user': 1 });
matchSchema.index({ 'teamB.players.user': 1 });
matchSchema.index({ status: 1, matchDate: -1 });

module.exports = mongoose.model('Match', matchSchema);
