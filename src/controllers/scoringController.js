const Match = require('../models/Match');
const Room = require('../models/Room');
const ScoreEvent = require('../models/ScoreEvent');
const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { MATCH_STATUS, DELIVERY_OUTCOMES, SOCKET_EVENTS, ROOM_ROLES } = require('../config/constants');
const { getIO } = require('../socket/socketManager');
const { processBall } = require('../services/scoringService');
const logger = require('../config/logger');

/**
 * @desc    Record a ball/delivery
 * @route   POST /api/v1/scoring/ball
 * @access  Private (any room member)
 */
const recordBall = asyncHandler(async (req, res, next) => {
  const result = await processBall(req.body, req.user._id.toString());

  if (!result.success) {
    if (result.statusCode === 404) return next(ApiError.notFound(result.error));
    if (result.statusCode === 403) return next(ApiError.forbidden(result.error));
    return next(ApiError.badRequest(result.error));
  }

  ApiResponse.success(res, result.data, 'Ball recorded successfully');
});

/**
 * @desc    Undo last ball
 * @route   POST /api/v1/scoring/undo
 * @access  Private (any room member)
 */
const undoBall = asyncHandler(async (req, res, next) => {
  const { matchId } = req.body;

  const match = await Match.findById(matchId);
  if (!match) return next(ApiError.notFound('Match not found'));
  if (match.status !== MATCH_STATUS.IN_PROGRESS) {
    return next(ApiError.badRequest('Match is not in progress'));
  }

  const room = await Room.findById(match.room);
  if (!room) return next(ApiError.notFound('Room not found'));

  // Any room member can undo
  const member = room.getMember(req.user._id);
  if (!member) return next(ApiError.forbidden('You are not a member of this room'));

  const innings = match.innings[match.currentInnings - 1];
  if (!innings) return next(ApiError.badRequest('No active innings'));

  const lastEvent = await ScoreEvent.getLastBall(matchId, innings.inningsNumber);
  if (!lastEvent) return next(ApiError.badRequest('No balls to undo'));

  // Mark event as undone
  lastEvent.isUndone  = true;
  lastEvent.undoneBy  = req.user._id;
  lastEvent.undoneAt  = new Date();
  await lastEvent.save();

  const { delivery, wicket } = lastEvent;

  // ============================================
  // REVERSE RUNS & EXTRAS
  // ============================================
  let totalRunsToReverse = delivery.runs;

  if (delivery.outcome === DELIVERY_OUTCOMES.WIDE) {
    innings.extras.wides -= 1 + (delivery.extraRuns || 0);
    innings.extras.total -= 1 + (delivery.extraRuns || 0);
    totalRunsToReverse    = 1 + (delivery.extraRuns || 0);
  } else if (delivery.outcome === DELIVERY_OUTCOMES.NO_BALL) {
    innings.extras.noBalls -= 1;
    innings.extras.total   -= 1 + (delivery.extraRuns || 0);
    totalRunsToReverse      = delivery.runs + 1 + (delivery.extraRuns || 0);
  } else if (delivery.outcome === DELIVERY_OUTCOMES.BYE) {
    innings.extras.byes  -= delivery.runs;
    innings.extras.total -= delivery.runs;
  } else if (delivery.outcome === DELIVERY_OUTCOMES.LEG_BYE) {
    innings.extras.legByes -= delivery.runs;
    innings.extras.total   -= delivery.runs;
  }

  innings.totalRuns -= totalRunsToReverse;

  // ============================================
  // REVERSE OVER / BALL COUNT
  // ============================================
  if (delivery.isLegalDelivery) {
    if (innings.totalBalls === 0) {
      innings.totalOvers -= 1;
      innings.totalBalls  = 5;
    } else {
      innings.totalBalls -= 1;
    }
  }

  // ============================================
  // REVERSE BATTING STATS
  // ============================================
  const batStats = innings.battingStats.find(b => b.player.toString() === lastEvent.striker.player.toString());
  if (batStats) {
    if (delivery.outcome !== DELIVERY_OUTCOMES.WIDE && delivery.outcome !== DELIVERY_OUTCOMES.DEAD_BALL) {
      batStats.ballsFaced -= 1;
    }
    if (delivery.outcome === DELIVERY_OUTCOMES.NORMAL ||
        delivery.outcome === DELIVERY_OUTCOMES.WICKET  ||
        delivery.outcome === DELIVERY_OUTCOMES.NO_BALL) {
      batStats.runs -= delivery.runs;
      if (delivery.isBoundaryFour) batStats.fours -= 1;
      if (delivery.isBoundarySix)  batStats.sixes -= 1;
    }
  }

  // ============================================
  // REVERSE BOWLING STATS
  // ============================================
  const bowlStats = innings.bowlingStats.find(b => b.player.toString() === lastEvent.bowler.player.toString());
  if (bowlStats) {
    bowlStats.runsConceded -= totalRunsToReverse;
    if (delivery.isLegalDelivery) {
      if (bowlStats.balls === 0) {
        bowlStats.overs -= 1;
        bowlStats.balls  = 5;
      } else {
        bowlStats.balls -= 1;
      }
    }
    if (delivery.outcome === DELIVERY_OUTCOMES.WIDE)   bowlStats.wides   -= 1;
    if (delivery.outcome === DELIVERY_OUTCOMES.NO_BALL) bowlStats.noBalls -= 1;
    if (totalRunsToReverse === 0 && delivery.isLegalDelivery) bowlStats.dotBalls -= 1;
    if (delivery.isBoundaryFour) bowlStats.fours -= 1;
    if (delivery.isBoundarySix)  bowlStats.sixes -= 1;
  }

  // ============================================
  // REVERSE WICKET
  // ============================================
  if (wicket.isWicket) {
    innings.totalWickets -= 1;
    if (bowlStats && delivery.isLegalDelivery) bowlStats.wickets -= 1;

    const dismissedBatStats = innings.battingStats.find(
      b => b.player.toString() === wicket.dismissedPlayer.player.toString()
    );
    if (dismissedBatStats) {
      dismissedBatStats.isOut         = false;
      dismissedBatStats.isNotOut      = true;
      dismissedBatStats.dismissalType = null;
      dismissedBatStats.dismissedBy   = null;
      dismissedBatStats.fielder       = null;
    }

    innings.fallOfWickets.pop();
  }

  // Reopen innings if the undone ball had completed it
  innings.isCompleted = false;

  // ============================================
  // RESTORE CURRENT BATSMEN (pre-ball state)
  // The ScoreEvent stored who was striker/non-striker BEFORE this delivery
  // ============================================
  innings.currentBatsmen.striker    = lastEvent.striker.player;
  innings.currentBatsmen.nonStriker = lastEvent.nonStriker.player;

  // Restore isOnStrike flags
  innings.battingStats.forEach(b => {
    const id = b.player.toString();
    if (id === lastEvent.striker.player.toString())    b.isOnStrike = true;
    else if (id === lastEvent.nonStriker.player.toString()) b.isOnStrike = false;
  });

  await match.save();

  try {
    const io = getIO();
    io.to(`room:${room._id}`).emit(SOCKET_EVENTS.UNDO_BALL, {
      undoneEvent: lastEvent._id,
      innings: {
        totalRuns:    innings.totalRuns,
        totalWickets: innings.totalWickets,
        overs:        `${innings.totalOvers}.${innings.totalBalls}`,
        extras:       innings.extras
      },
      nextBatsmen: {
        striker:    innings.currentBatsmen.striker,
        nonStriker: innings.currentBatsmen.nonStriker
      }
    });
  } catch (e) { /* Socket not critical */ }

  ApiResponse.success(res, {
    undoneEvent: lastEvent._id,
    innings: {
      totalRuns:    innings.totalRuns,
      totalWickets: innings.totalWickets,
      overs:        `${innings.totalOvers}.${innings.totalBalls}`
    },
    nextBatsmen: {
      striker:    innings.currentBatsmen.striker,
      nonStriker: innings.currentBatsmen.nonStriker
    }
  }, 'Last ball undone successfully');
});

module.exports = { recordBall, undoBall };
