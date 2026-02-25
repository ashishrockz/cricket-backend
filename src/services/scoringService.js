const Match = require('../models/Match');
const Room = require('../models/Room');
const ScoreEvent = require('../models/ScoreEvent');
const { MATCH_STATUS, DELIVERY_OUTCOMES, SOCKET_EVENTS } = require('../config/constants');
const logger = require('../config/logger');

/**
 * Process a single ball delivery.
 * Called by both the REST controller and the Socket RECORD_BALL handler.
 *
 * @param {object} payload  - Ball data from request body or socket event
 * @param {string} userId   - Authenticated user's _id (string)
 * @returns {{ success: boolean, data?: object, error?: string, statusCode?: number }}
 */
const processBall = async (payload, userId) => {
  const {
    matchId, outcome, runs = 0, extraRuns = 0,
    strikerId, nonStrikerId, bowlerId,
    isWicket = false, dismissalType, dismissedPlayerId, fielderId, commentary
  } = payload;

  try {
    if (!matchId || !outcome || !strikerId || !nonStrikerId || !bowlerId) {
      return { success: false, statusCode: 400, error: 'matchId, outcome, strikerId, nonStrikerId and bowlerId are required' };
    }

    const match = await Match.findById(matchId);
    if (!match) return { success: false, statusCode: 404, error: 'Match not found' };
    if (match.status !== MATCH_STATUS.IN_PROGRESS) {
      return { success: false, statusCode: 400, error: 'Match is not in progress' };
    }

    const room = await Room.findById(match.room);
    if (!room) return { success: false, statusCode: 404, error: 'Room not found' };

    // Any room member (creator or participant) can score
    const member = room.getMember(userId);
    if (!member) return { success: false, statusCode: 403, error: 'You are not a member of this room' };

    const innings = match.innings[match.currentInnings - 1];
    if (!innings || innings.isCompleted) {
      return { success: false, statusCode: 400, error: 'No active innings' };
    }

    // Is this a legal delivery (counts toward over)?
    const isLegal = outcome !== DELIVERY_OUTCOMES.WIDE &&
                    outcome !== DELIVERY_OUTCOMES.NO_BALL &&
                    outcome !== DELIVERY_OUTCOMES.DEAD_BALL;

    const battingTeamPlayers = innings.battingTeam === 'team_a' ? match.teamA.players : match.teamB.players;
    const bowlingTeamPlayers = innings.bowlingTeam === 'team_a' ? match.teamA.players : match.teamB.players;

    const striker    = battingTeamPlayers.find(p => p._id.toString() === strikerId);
    const nonStriker = battingTeamPlayers.find(p => p._id.toString() === nonStrikerId);
    const bowler     = bowlingTeamPlayers.find(p => p._id.toString() === bowlerId);

    if (!striker)    return { success: false, statusCode: 400, error: 'Striker not found in batting team' };
    if (!nonStriker) return { success: false, statusCode: 400, error: 'Non-striker not found in batting team' };
    if (!bowler)     return { success: false, statusCode: 400, error: 'Bowler not found in bowling team' };

    // ============================================
    // RUNS & EXTRAS
    // ============================================
    const actualExtraRuns = extraRuns || 0;
    let totalRunsThisBall = runs;

    if (outcome === DELIVERY_OUTCOMES.WIDE) {
      innings.extras.wides += 1 + actualExtraRuns;
      innings.extras.total += 1 + actualExtraRuns;
      totalRunsThisBall = 1 + actualExtraRuns;
    } else if (outcome === DELIVERY_OUTCOMES.NO_BALL) {
      innings.extras.noBalls += 1;
      innings.extras.total += 1 + actualExtraRuns;
      totalRunsThisBall = runs + 1 + actualExtraRuns;
    } else if (outcome === DELIVERY_OUTCOMES.BYE) {
      innings.extras.byes += runs;
      innings.extras.total += runs;
    } else if (outcome === DELIVERY_OUTCOMES.LEG_BYE) {
      innings.extras.legByes += runs;
      innings.extras.total += runs;
    }

    innings.totalRuns += totalRunsThisBall;

    // ============================================
    // 6-BALL OVER COUNTING (legal deliveries only)
    // ============================================
    let overJustCompleted = false;
    if (isLegal) {
      innings.totalBalls += 1;
      if (innings.totalBalls >= 6) {
        innings.totalOvers += 1;
        innings.totalBalls = 0;
        overJustCompleted = true;
      }
    }

    // ============================================
    // BATTING STATS
    // ============================================
    let batStats = innings.battingStats.find(b => b.player.toString() === strikerId);
    if (!batStats) {
      innings.battingStats.push({
        player: striker._id, playerName: striker.name,
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0,
        isOut: false, isNotOut: true, isOnStrike: true,
        position: innings.battingStats.length + 1
      });
      batStats = innings.battingStats[innings.battingStats.length - 1];
    }

    if (!innings.battingStats.find(b => b.player.toString() === nonStrikerId)) {
      innings.battingStats.push({
        player: nonStriker._id, playerName: nonStriker.name,
        runs: 0, ballsFaced: 0, fours: 0, sixes: 0,
        isOut: false, isNotOut: true, isOnStrike: false,
        position: innings.battingStats.length + 1
      });
    }

    // Balls faced: widse don't count, dead balls don't count
    if (outcome !== DELIVERY_OUTCOMES.WIDE && outcome !== DELIVERY_OUTCOMES.DEAD_BALL) {
      batStats.ballsFaced += 1;
    }
    // Runs attributed to batsman: normal, wicket (run out may have runs), no-ball
    if (outcome === DELIVERY_OUTCOMES.NORMAL || outcome === DELIVERY_OUTCOMES.WICKET || outcome === DELIVERY_OUTCOMES.NO_BALL) {
      batStats.runs += runs;
      if (runs === 4) batStats.fours += 1;
      if (runs === 6) batStats.sixes += 1;
    }

    // ============================================
    // BOWLING STATS
    // ============================================
    let bowlStats = innings.bowlingStats.find(b => b.player.toString() === bowlerId);
    if (!bowlStats) {
      innings.bowlingStats.push({
        player: bowler._id, playerName: bowler.name,
        overs: 0, balls: 0, maidens: 0, runsConceded: 0,
        wickets: 0, wides: 0, noBalls: 0, dotBalls: 0, fours: 0, sixes: 0
      });
      bowlStats = innings.bowlingStats[innings.bowlingStats.length - 1];
    }

    bowlStats.runsConceded += totalRunsThisBall;

    if (isLegal) {
      bowlStats.balls += 1;
      if (bowlStats.balls >= 6) {
        bowlStats.overs += 1;
        bowlStats.balls = 0;
      }
    }

    if (outcome === DELIVERY_OUTCOMES.WIDE)    bowlStats.wides += 1;
    if (outcome === DELIVERY_OUTCOMES.NO_BALL)  bowlStats.noBalls += 1;
    if (totalRunsThisBall === 0 && isLegal)     bowlStats.dotBalls += 1;
    if (runs === 4 && outcome === DELIVERY_OUTCOMES.NORMAL) bowlStats.fours += 1;
    if (runs === 6 && outcome === DELIVERY_OUTCOMES.NORMAL) bowlStats.sixes += 1;

    // ============================================
    // WICKET HANDLING
    // ============================================
    if (isWicket) {
      innings.totalWickets += 1;
      const dismissedPlayer    = battingTeamPlayers.find(p => p._id.toString() === dismissedPlayerId);
      const dismissedBatStats  = innings.battingStats.find(b => b.player.toString() === dismissedPlayerId);

      if (dismissedBatStats) {
        dismissedBatStats.isOut = true;
        dismissedBatStats.isNotOut = false;
        dismissedBatStats.isOnStrike = false;
        dismissedBatStats.dismissalType = dismissalType;
        dismissedBatStats.dismissedBy = bowler.name;
        if (fielderId) {
          const fielder = bowlingTeamPlayers.find(p => p._id.toString() === fielderId);
          if (fielder) dismissedBatStats.fielder = fielder.name;
        }
      }

      if (isLegal) bowlStats.wickets += 1;

      innings.fallOfWickets.push({
        wicketNumber: innings.totalWickets,
        playerName: dismissedPlayer ? dismissedPlayer.name : 'Unknown',
        score: innings.totalRuns,
        overs: `${innings.totalOvers}.${innings.totalBalls}`,
        dismissalType
      });
    }

    // ============================================
    // STRIKE ROTATION
    //
    // Rule 1 — within a ball: odd runs scored → batsmen cross → strike rotates
    //   • Wide:    only the extra running (actualExtraRuns) counts, not the wide penalty
    //   • Others:  `runs` is the physical running
    //
    // Rule 2 — end of over: batsmen ALWAYS change ends (toggle Rule 1 result)
    //
    // Rule 1 XOR Rule 2 gives the net position:
    //   even runs, no over end  → same striker
    //   odd  runs, no over end  → striker ↔ non-striker
    //   even runs, over end     → striker ↔ non-striker
    //   odd  runs, over end     → same striker (they crossed back)
    //
    // On a wicket: no auto-rotation — front-end sends the correct next batsmen.
    // On a wicket at end of over: non-striker moves to face; new batsman TBD.
    // ============================================
    let strikeRotated = false;

    if (!isWicket && outcome !== DELIVERY_OUTCOMES.DEAD_BALL) {
      const runningRuns = outcome === DELIVERY_OUTCOMES.WIDE ? actualExtraRuns : runs;
      strikeRotated = (runningRuns % 2) === 1;
    }
    if (overJustCompleted) strikeRotated = !strikeRotated; // end-of-over always toggles

    // Update innings.currentBatsmen
    if (!isWicket) {
      innings.currentBatsmen.striker    = strikeRotated ? nonStriker._id : striker._id;
      innings.currentBatsmen.nonStriker = strikeRotated ? striker._id   : nonStriker._id;
    } else if (overJustCompleted) {
      // Dismissed batter is out; non-striker faces next over; new batter TBD by front-end
      innings.currentBatsmen.striker    = nonStriker._id;
      innings.currentBatsmen.nonStriker = null;
    }
    // else: wicket mid-over — front-end sends new striker for next ball

    // Sync isOnStrike flag in battingStats
    innings.battingStats.forEach(b => {
      const id = b.player.toString();
      if (innings.currentBatsmen.striker && id === innings.currentBatsmen.striker.toString()) {
        b.isOnStrike = true;
      } else if (innings.currentBatsmen.nonStriker && id === innings.currentBatsmen.nonStriker.toString()) {
        b.isOnStrike = false;
      }
    });

    // ============================================
    // SCORE EVENT (audit trail)
    // Store the over/ball as they were AT the time of this delivery
    // ============================================
    const eventOverNumber  = overJustCompleted ? innings.totalOvers - 1 : innings.totalOvers;
    const eventBallNumber  = isLegal
      ? (overJustCompleted ? 6 : innings.totalBalls)
      : innings.totalBalls;

    const scoreEvent = await ScoreEvent.create({
      match: match._id,
      room:  room._id,
      inningsNumber: innings.inningsNumber,
      overNumber:    eventOverNumber,
      ballNumber:    eventBallNumber,
      delivery: {
        outcome, runs, extraRuns: actualExtraRuns, isLegalDelivery: isLegal,
        isBoundaryFour: runs === 4 && outcome === DELIVERY_OUTCOMES.NORMAL,
        isBoundarySix:  runs === 6 && outcome === DELIVERY_OUTCOMES.NORMAL
      },
      striker:    { player: striker._id,    playerName: striker.name },
      nonStriker: { player: nonStriker._id, playerName: nonStriker.name },
      bowler:     { player: bowler._id,     playerName: bowler.name },
      wicket: {
        isWicket: isWicket || false,
        dismissalType: isWicket ? dismissalType : null,
        dismissedPlayer: isWicket
          ? { player: dismissedPlayerId, playerName: battingTeamPlayers.find(p => p._id.toString() === dismissedPlayerId)?.name }
          : { player: null, playerName: null },
        fielder: fielderId
          ? { player: fielderId, playerName: bowlingTeamPlayers.find(p => p._id.toString() === fielderId)?.name }
          : { player: null, playerName: null }
      },
      scoreAfterBall: {
        totalRuns: innings.totalRuns, totalWickets: innings.totalWickets,
        totalOvers: innings.totalOvers, totalBalls: innings.totalBalls
      },
      scoredBy:  userId,
      commentary
    });

    // ============================================
    // INNINGS COMPLETION CHECK
    // ============================================
    const maxWickets = battingTeamPlayers.length - 1;
    const maxOvers   = match.totalOvers;
    let inningsCompleted = false;

    if (innings.totalWickets >= maxWickets)                                          { innings.isCompleted = true; inningsCompleted = true; }
    if (innings.totalOvers >= maxOvers && innings.totalBalls === 0)                  { innings.isCompleted = true; inningsCompleted = true; }
    if (match.currentInnings === 2 && innings.target && innings.totalRuns >= innings.target) { innings.isCompleted = true; inningsCompleted = true; }

    await match.save();

    // ============================================
    // SOCKET BROADCASTS
    // ============================================
    const nextBatsmen = {
      striker:    innings.currentBatsmen.striker,
      nonStriker: innings.currentBatsmen.nonStriker
    };

    const inningsSummary = {
      totalRuns:    innings.totalRuns,
      totalWickets: innings.totalWickets,
      overs:        `${innings.totalOvers}.${innings.totalBalls}`,
      runRate:      innings.runRate,
      extras:       innings.extras,
      target:       innings.target
    };

    try {
      // Lazy-require to avoid circular dependency at load time
      const { getIO } = require('../socket/socketManager');
      const io = getIO();

      const scoreData = {
        event:            scoreEvent.toObject(),
        innings:          inningsSummary,
        strikeRotated,
        nextBatsmen,
        overJustCompleted,
        inningsCompleted
      };

      io.to(`room:${room._id}`).emit(SOCKET_EVENTS.BALL_UPDATE, scoreData);
      io.to(`match:${match._id}`).emit(SOCKET_EVENTS.BALL_UPDATE, scoreData);

      if (isWicket) {
        io.to(`room:${room._id}`).emit(SOCKET_EVENTS.WICKET_FALLEN, {
          wicketNumber:    innings.totalWickets,
          dismissedPlayer: scoreEvent.wicket.dismissedPlayer,
          dismissalType,
          score:           innings.totalRuns,
          nextBatsmen
        });
      }

      if (strikeRotated) {
        const rotatePayload = {
          newStriker:    innings.currentBatsmen.striker,
          newNonStriker: innings.currentBatsmen.nonStriker,
          reason:        overJustCompleted ? 'over_end' : 'odd_runs'
        };
        io.to(`room:${room._id}`).emit(SOCKET_EVENTS.STRIKE_ROTATE, rotatePayload);
        io.to(`match:${match._id}`).emit(SOCKET_EVENTS.STRIKE_ROTATE, rotatePayload);
      }

      if (overJustCompleted) {
        io.to(`room:${room._id}`).emit(SOCKET_EVENTS.OVER_COMPLETE, {
          completedOver:  innings.totalOvers,   // 1-indexed: how many overs done
          bowler:         { id: bowler._id, name: bowler.name },
          nextStriker:    innings.currentBatsmen.striker,
          nextNonStriker: innings.currentBatsmen.nonStriker
        });
      }

      if (inningsCompleted) {
        io.to(`room:${room._id}`).emit(SOCKET_EVENTS.INNINGS_COMPLETE, {
          inningsNumber: innings.inningsNumber,
          totalRuns:     innings.totalRuns,
          totalWickets:  innings.totalWickets,
          overs:         `${innings.totalOvers}.${innings.totalBalls}`,
          target:        match.currentInnings === 1 ? innings.totalRuns + 1 : null
        });
      }
    } catch (e) {
      logger.warn(`Socket broadcast failed: ${e.message}`);
    }

    return {
      success: true,
      data: {
        event:   scoreEvent,
        innings: { ...inningsSummary, isCompleted: innings.isCompleted },
        strikeRotated,
        nextBatsmen,
        overJustCompleted
      }
    };

  } catch (err) {
    logger.error(`processBall error: ${err.message}`);
    return { success: false, statusCode: 500, error: err.message };
  }
};

module.exports = { processBall };
