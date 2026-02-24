const mongoose = require('mongoose');
const { DELIVERY_OUTCOMES, DISMISSAL_TYPES } = require('../config/constants');

const scoreEventSchema = new mongoose.Schema({
  match: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  inningsNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 4
  },
  overNumber: {
    type: Number,
    required: true,
    min: 0
  },
  ballNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  delivery: {
    outcome: {
      type: String,
      enum: Object.values(DELIVERY_OUTCOMES),
      required: true
    },
    runs: {
      type: Number,
      default: 0,
      min: 0,
      max: 7
    },
    extraRuns: {
      type: Number,
      default: 0,
      min: 0
    },
    isLegalDelivery: {
      type: Boolean,
      default: true
    },
    isBoundaryFour: {
      type: Boolean,
      default: false
    },
    isBoundarySix: {
      type: Boolean,
      default: false
    }
  },
  striker: {
    player: { type: mongoose.Schema.Types.ObjectId, required: true },
    playerName: { type: String, required: true }
  },
  nonStriker: {
    player: { type: mongoose.Schema.Types.ObjectId, required: true },
    playerName: { type: String, required: true }
  },
  bowler: {
    player: { type: mongoose.Schema.Types.ObjectId, required: true },
    playerName: { type: String, required: true }
  },
  wicket: {
    isWicket: { type: Boolean, default: false },
    dismissalType: { type: String, enum: [...Object.values(DISMISSAL_TYPES), null], default: null },
    dismissedPlayer: {
      player: { type: mongoose.Schema.Types.ObjectId, default: null },
      playerName: { type: String, default: null }
    },
    fielder: {
      player: { type: mongoose.Schema.Types.ObjectId, default: null },
      playerName: { type: String, default: null }
    }
  },
  scoreAfterBall: {
    totalRuns: { type: Number, default: 0 },
    totalWickets: { type: Number, default: 0 },
    totalOvers: { type: Number, default: 0 },
    totalBalls: { type: Number, default: 0 }
  },
  scoredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  commentary: {
    type: String,
    maxlength: 500,
    default: null
  },
  isUndone: {
    type: Boolean,
    default: false
  },
  undoneBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  undoneAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
scoreEventSchema.index({ match: 1, inningsNumber: 1, overNumber: 1, ballNumber: 1 });
scoreEventSchema.index({ match: 1, isUndone: 1, createdAt: -1 });

// Static: get last ball event
scoreEventSchema.statics.getLastBall = async function (matchId, inningsNumber) {
  return this.findOne({
    match: matchId,
    inningsNumber,
    isUndone: false
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('ScoreEvent', scoreEventSchema);
