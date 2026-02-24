const mongoose = require('mongoose');
const crypto = require('crypto');
const { MATCH_FORMATS } = require('../config/constants');

// ============================================
// SUB-SCHEMAS
// ============================================
const tournamentTeamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  shortName: { type: String, trim: true, maxlength: 10 },
  captain: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  players: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true },
    isRegistered: { type: Boolean, default: false }
  }],
  logo: { type: String, default: null },
  color: { type: String, default: '#2a9164' }
});

const pointsTableEntrySchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, required: true },
  teamName: { type: String, required: true },
  played: { type: Number, default: 0 },
  won: { type: Number, default: 0 },
  lost: { type: Number, default: 0 },
  tied: { type: Number, default: 0 },
  noResult: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  netRunRate: { type: Number, default: 0 },
  runsScored: { type: Number, default: 0 },
  oversPlayed: { type: Number, default: 0 },
  runsConceded: { type: Number, default: 0 },
  oversBowled: { type: Number, default: 0 },
  position: { type: Number, default: 0 }
});

const fixtureSchema = new mongoose.Schema({
  matchNumber: { type: Number, required: true },
  round: { type: Number, default: 1 },
  roundLabel: { type: String, default: null }, // "Group Stage", "Semi-Final", "Final"
  teamA: { type: mongoose.Schema.Types.ObjectId, default: null },
  teamAName: { type: String, default: 'TBD' },
  teamB: { type: mongoose.Schema.Types.ObjectId, default: null },
  teamBName: { type: String, default: 'TBD' },
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', default: null },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'bye'],
    default: 'scheduled'
  },
  scheduledDate: { type: Date, default: null },
  venue: { type: String, default: null },
  winner: { type: mongoose.Schema.Types.ObjectId, default: null },
  resultSummary: { type: String, default: null },
  // For knockout brackets
  bracketPosition: { type: Number, default: null },
  nextFixture: { type: mongoose.Schema.Types.ObjectId, default: null }
});

const seasonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  year: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true }
});

// ============================================
// MAIN TOURNAMENT SCHEMA
// ============================================
const tournamentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tournament name is required'],
    trim: true,
    maxlength: [150, 'Name cannot exceed 150 characters']
  },
  code: {
    type: String,
    unique: true,
    uppercase: true,
    index: true
  },
  description: {
    type: String,
    maxlength: 2000,
    default: null
  },
  format: {
    type: String,
    enum: ['league', 'knockout', 'group_knockout', 'round_robin', 'double_elimination'],
    required: true
  },
  matchFormat: {
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
    enum: ['draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled'],
    default: 'draft',
    index: true
  },
  teams: [tournamentTeamSchema],
  minTeams: { type: Number, default: 4, min: 2 },
  maxTeams: { type: Number, default: 16, max: 64 },
  maxPlayersPerTeam: { type: Number, default: 15, min: 2, max: 25 },

  // Points system (for league formats)
  pointsSystem: {
    win: { type: Number, default: 2 },
    loss: { type: Number, default: 0 },
    tie: { type: Number, default: 1 },
    noResult: { type: Number, default: 1 },
    bonusPoint: { type: Number, default: 0 }
  },
  pointsTable: [pointsTableEntrySchema],

  // Fixtures
  fixtures: [fixtureSchema],
  totalRounds: { type: Number, default: 0 },
  currentRound: { type: Number, default: 0 },

  // Knockout specific
  knockoutConfig: {
    groupCount: { type: Number, default: null },
    teamsPerGroup: { type: Number, default: null },
    qualifyFromGroup: { type: Number, default: 2 }
  },

  // Season
  season: seasonSchema,

  // Schedule
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  registrationDeadline: { type: Date, default: null },

  // Venue
  venues: [{ type: String, maxlength: 200 }],
  defaultVenue: { type: String, maxlength: 200 },

  // Awards
  awards: {
    manOfTheTournament: { player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String },
    bestBatsman: { player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, runs: Number },
    bestBowler: { player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, wickets: Number },
    bestFielder: { player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, catches: Number }
  },

  // Stats
  stats: {
    totalMatchesPlayed: { type: Number, default: 0 },
    totalRunsScored: { type: Number, default: 0 },
    totalWicketsTaken: { type: Number, default: 0 },
    highestScore: { value: { type: Number, default: 0 }, team: String, against: String },
    lowestScore: { value: { type: Number, default: 999 }, team: String, against: String },
    highestIndividualScore: { value: { type: Number, default: 0 }, player: String, team: String },
    bestBowlingFigures: { wickets: { type: Number, default: 0 }, runs: { type: Number, default: 0 }, player: String, team: String }
  },

  // Rules
  rules: {
    type: String,
    maxlength: 5000,
    default: null
  },

  // Admin
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPublic: { type: Boolean, default: true },
  entryFee: { type: Number, default: 0 },
  prizeMoney: { type: Number, default: 0 },
  banner: { type: String, default: null },

  // Sponsorship
  sponsors: [{
    name: { type: String, maxlength: 100 },
    logo: { type: String },
    tier: { type: String, enum: ['title', 'gold', 'silver', 'associate'], default: 'associate' }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
tournamentSchema.index({ status: 1, startDate: -1 });
tournamentSchema.index({ organizer: 1 });
tournamentSchema.index({ 'teams._id': 1 });

// Pre-validate: generate code
tournamentSchema.pre('validate', async function (next) {
  if (!this.code) {
    const prefix = this.name.replace(/[^A-Z]/gi, '').substring(0, 3).toUpperCase() || 'TRN';
    this.code = `${prefix}-${crypto.randomInt(10000, 99999)}`;
  }
  next();
});

// Virtual: team count
tournamentSchema.virtual('teamCount').get(function () {
  return this.teams ? this.teams.length : 0;
});

// Virtual: is registration open
tournamentSchema.virtual('canRegister').get(function () {
  return this.status === 'registration_open' &&
    this.teams.length < this.maxTeams &&
    (!this.registrationDeadline || new Date() < this.registrationDeadline);
});

// Method: add fixture result and update points table
tournamentSchema.methods.recordFixtureResult = function (fixtureId, winnerId, resultSummary, matchStats) {
  const fixture = this.fixtures.id(fixtureId);
  if (!fixture) throw new Error('Fixture not found');

  fixture.status = 'completed';
  fixture.winner = winnerId;
  fixture.resultSummary = resultSummary;

  // Update points table for league formats
  if (['league', 'round_robin', 'group_knockout'].includes(this.format)) {
    const teamAEntry = this.pointsTable.find(e => e.team.toString() === fixture.teamA?.toString());
    const teamBEntry = this.pointsTable.find(e => e.team.toString() === fixture.teamB?.toString());

    if (teamAEntry && teamBEntry) {
      teamAEntry.played += 1;
      teamBEntry.played += 1;

      if (winnerId) {
        if (winnerId.toString() === fixture.teamA?.toString()) {
          teamAEntry.won += 1;
          teamAEntry.points += this.pointsSystem.win;
          teamBEntry.lost += 1;
          teamBEntry.points += this.pointsSystem.loss;
        } else {
          teamBEntry.won += 1;
          teamBEntry.points += this.pointsSystem.win;
          teamAEntry.lost += 1;
          teamAEntry.points += this.pointsSystem.loss;
        }
      } else {
        teamAEntry.tied += 1;
        teamBEntry.tied += 1;
        teamAEntry.points += this.pointsSystem.tie;
        teamBEntry.points += this.pointsSystem.tie;
      }

      // Update NRR if stats provided
      if (matchStats) {
        if (matchStats.teamARuns !== undefined) {
          teamAEntry.runsScored += matchStats.teamARuns;
          teamAEntry.oversPlayed += matchStats.teamAOvers;
          teamBEntry.runsConceded += matchStats.teamARuns;
          teamBEntry.oversBowled += matchStats.teamAOvers;
        }
        if (matchStats.teamBRuns !== undefined) {
          teamBEntry.runsScored += matchStats.teamBRuns;
          teamBEntry.oversPlayed += matchStats.teamBOvers;
          teamAEntry.runsConceded += matchStats.teamBRuns;
          teamAEntry.oversBowled += matchStats.teamBOvers;
        }

        // Recalculate NRR
        [teamAEntry, teamBEntry].forEach(e => {
          const forRate = e.oversPlayed > 0 ? e.runsScored / e.oversPlayed : 0;
          const againstRate = e.oversBowled > 0 ? e.runsConceded / e.oversBowled : 0;
          e.netRunRate = parseFloat((forRate - againstRate).toFixed(3));
        });
      }

      // Recalculate positions
      const sorted = [...this.pointsTable].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.netRunRate - a.netRunRate;
      });
      sorted.forEach((entry, idx) => {
        const original = this.pointsTable.find(e => e.team.toString() === entry.team.toString());
        if (original) original.position = idx + 1;
      });
    }
  }

  this.stats.totalMatchesPlayed += 1;
};

module.exports = mongoose.model('Tournament', tournamentSchema);
