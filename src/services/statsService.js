const User = require('../models/User');
const Match = require('../models/Match');
const { PLAYER_TYPES } = require('../config/constants');
const logger = require('../config/logger');

/**
 * Sync a completed match's stats to all registered player profiles.
 * Called after match completion.
 *
 * @param {string} matchId
 */
const syncMatchStatsToProfiles = async (matchId) => {
  try {
    const match = await Match.findById(matchId);
    if (!match || match.status !== 'completed') return;

    const allPlayers = [...match.teamA.players, ...match.teamB.players];
    const registeredPlayers = allPlayers.filter(
      (p) => p.playerType === PLAYER_TYPES.REGISTERED && p.user
    );

    for (const player of registeredPlayers) {
      const userId = player.user;
      const update = { $inc: { 'stats.matchesPlayed': 1 } };

      // Aggregate batting stats across all innings for this player
      let totalRuns = 0;
      let totalBallsFaced = 0;
      let totalCatches = 0;

      for (const innings of match.innings) {
        const batStat = innings.battingStats.find(
          (b) => b.player && b.player.toString() === userId.toString()
        );
        if (batStat) {
          totalRuns += batStat.runs;
          totalBallsFaced += batStat.ballsFaced;

          update.$inc['stats.totalRuns'] =
            (update.$inc['stats.totalRuns'] || 0) + batStat.runs;
          update.$inc['stats.totalBallsFaced'] =
            (update.$inc['stats.totalBallsFaced'] || 0) + batStat.ballsFaced;

          // Milestones
          if (batStat.runs >= 100) {
            update.$inc['stats.hundreds'] = (update.$inc['stats.hundreds'] || 0) + 1;
          } else if (batStat.runs >= 50) {
            update.$inc['stats.fifties'] = (update.$inc['stats.fifties'] || 0) + 1;
          }
        }

        const bowlStat = innings.bowlingStats.find(
          (b) => b.player && b.player.toString() === userId.toString()
        );
        if (bowlStat) {
          update.$inc['stats.totalWickets'] =
            (update.$inc['stats.totalWickets'] || 0) + bowlStat.wickets;
          update.$inc['stats.totalBallsBowled'] =
            (update.$inc['stats.totalBallsBowled'] || 0) +
            bowlStat.overs * 6 +
            bowlStat.balls;
          update.$inc['stats.totalRunsConceded'] =
            (update.$inc['stats.totalRunsConceded'] || 0) + bowlStat.runsConceded;
        }

        // Count catches where this player is the fielder in a wicket
        for (const fow of innings.fallOfWickets) {
          // Simple approach — we'd need ScoreEvent for precise fielder data
          // Placeholder increment handled elsewhere if needed
        }
      }

      await User.findByIdAndUpdate(userId, update);

      // Update highest score separately (needs comparison)
      const user = await User.findById(userId);
      if (user) {
        let maxRuns = 0;
        for (const innings of match.innings) {
          const batStat = innings.battingStats.find(
            (b) => b.player && b.player.toString() === userId.toString()
          );
          if (batStat && batStat.runs > maxRuns) maxRuns = batStat.runs;
        }
        if (maxRuns > user.stats.highestScore) {
          user.stats.highestScore = maxRuns;
          await user.save();
        }

        // Update best bowling
        for (const innings of match.innings) {
          const bowlStat = innings.bowlingStats.find(
            (b) => b.player && b.player.toString() === userId.toString()
          );
          if (bowlStat) {
            const currentBest = user.stats.bestBowling;
            if (
              bowlStat.wickets > currentBest.wickets ||
              (bowlStat.wickets === currentBest.wickets &&
                bowlStat.runsConceded < currentBest.runs)
            ) {
              user.stats.bestBowling = {
                wickets: bowlStat.wickets,
                runs: bowlStat.runsConceded
              };
              await user.save();
            }
          }
        }
      }

      logger.debug(`Stats synced for user ${userId}`);
    }

    logger.info(`Match ${matchId} stats synced to ${registeredPlayers.length} player profiles`);
  } catch (error) {
    logger.error(`Stats sync failed for match ${matchId}: ${error.message}`);
  }
};

module.exports = { syncMatchStatsToProfiles };
