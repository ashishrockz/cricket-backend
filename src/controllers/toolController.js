const { ApiError, ApiResponse } = require('../utils/apiHelpers');
const asyncHandler = require('../utils/asyncHandler');

// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation helpers (no DB required)
// ─────────────────────────────────────────────────────────────────────────────

const toFixed2 = (n) => Math.round(n * 100) / 100;

/**
 * Convert overs.balls notation (e.g. 12.4) to total balls
 */
const oversToTotalBalls = (overs) => {
  const wholeOvers = Math.floor(overs);
  const balls = Math.round((overs - wholeOvers) * 10);
  return wholeOvers * 6 + balls;
};

/**
 * Convert total balls to overs.balls notation
 */
const totalBallsToOvers = (balls) => {
  const overs = Math.floor(balls / 6);
  const rem = balls % 6;
  return parseFloat(`${overs}.${rem}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Tools — each corresponds to one API endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Current Run Rate (CRR) calculator
 * @route   POST /api/v1/tools/crr
 * @body    { runs, overs }
 */
const calcCRR = asyncHandler(async (req, res, next) => {
  const { runs, overs } = req.body;
  if (runs < 0 || overs <= 0) return next(ApiError.badRequest('Runs must be >= 0 and overs > 0'));

  const balls = oversToTotalBalls(overs);
  const crr = balls > 0 ? toFixed2((runs / balls) * 6) : 0;

  ApiResponse.success(res, {
    runs,
    overs,
    currentRunRate: crr,
    runsPerBall: toFixed2(runs / balls)
  }, 'Current Run Rate calculated');
});

/**
 * @desc    Required Run Rate (RRR) calculator
 * @route   POST /api/v1/tools/rrr
 * @body    { target, runsScored, oversCompleted, totalOvers }
 */
const calcRRR = asyncHandler(async (req, res, next) => {
  const { target, runsScored, oversCompleted, totalOvers } = req.body;

  if (target <= 0) return next(ApiError.badRequest('Target must be positive'));
  if (oversCompleted < 0 || oversCompleted >= totalOvers) {
    return next(ApiError.badRequest('Invalid overs values'));
  }

  const runsNeeded = target - runsScored;
  const ballsCompleted = oversToTotalBalls(oversCompleted);
  const totalBalls = totalOvers * 6;
  const ballsRemaining = totalBalls - ballsCompleted;
  const oversRemaining = totalBallsToOvers(ballsRemaining);

  if (runsNeeded <= 0) {
    return ApiResponse.success(res, {
      result: 'Target already achieved',
      runsNeeded: 0,
      ballsRemaining,
      oversRemaining,
      requiredRunRate: 0
    });
  }

  if (ballsRemaining <= 0) {
    return ApiResponse.success(res, {
      result: 'Match over — target not achieved',
      runsNeeded,
      ballsRemaining: 0,
      oversRemaining: 0,
      requiredRunRate: null
    });
  }

  const rrr = toFixed2((runsNeeded / ballsRemaining) * 6);

  ApiResponse.success(res, {
    target,
    runsScored,
    runsNeeded,
    oversCompleted,
    oversRemaining,
    ballsRemaining,
    requiredRunRate: rrr,
    runsPerBall: toFixed2(runsNeeded / ballsRemaining)
  }, 'Required Run Rate calculated');
});

/**
 * @desc    Batting average calculator
 * @route   POST /api/v1/tools/batting-average
 * @body    { totalRuns, innings, notOuts }
 */
const calcBattingAverage = asyncHandler(async (req, res, next) => {
  const { totalRuns, innings, notOuts = 0 } = req.body;
  const dismissals = innings - notOuts;

  if (innings <= 0) return next(ApiError.badRequest('Innings must be > 0'));
  if (notOuts < 0 || notOuts > innings) return next(ApiError.badRequest('Invalid not-outs value'));

  const average = dismissals === 0 ? null : toFixed2(totalRuns / dismissals);

  ApiResponse.success(res, {
    totalRuns,
    innings,
    notOuts,
    dismissals,
    battingAverage: average,
    note: average === null ? 'Average is undefined — player was not out in all innings' : undefined
  }, 'Batting average calculated');
});

/**
 * @desc    Strike rate calculator (batting)
 * @route   POST /api/v1/tools/strike-rate
 * @body    { runs, balls }
 */
const calcStrikeRate = asyncHandler(async (req, res, next) => {
  const { runs, balls } = req.body;
  if (balls <= 0) return next(ApiError.badRequest('Balls faced must be > 0'));

  const strikeRate = toFixed2((runs / balls) * 100);

  ApiResponse.success(res, {
    runs,
    balls,
    strikeRate,
    interpretation: strikeRate >= 150 ? 'Explosive' : strikeRate >= 120 ? 'Aggressive' : strikeRate >= 80 ? 'Steady' : 'Slow'
  }, 'Strike rate calculated');
});

/**
 * @desc    Bowling average calculator
 * @route   POST /api/v1/tools/bowling-average
 * @body    { runsConceded, wickets }
 */
const calcBowlingAverage = asyncHandler(async (req, res, next) => {
  const { runsConceded, wickets } = req.body;
  if (runsConceded < 0) return next(ApiError.badRequest('Runs conceded cannot be negative'));

  const average = wickets === 0 ? null : toFixed2(runsConceded / wickets);

  ApiResponse.success(res, {
    runsConceded,
    wickets,
    bowlingAverage: average,
    note: average === null ? 'Average undefined — no wickets taken' : undefined
  }, 'Bowling average calculated');
});

/**
 * @desc    Economy rate calculator
 * @route   POST /api/v1/tools/economy
 * @body    { runsConceded, overs }
 */
const calcEconomy = asyncHandler(async (req, res, next) => {
  const { runsConceded, overs } = req.body;
  if (runsConceded < 0) return next(ApiError.badRequest('Runs conceded cannot be negative'));
  if (overs <= 0) return next(ApiError.badRequest('Overs bowled must be > 0'));

  const balls = oversToTotalBalls(overs);
  const economy = toFixed2((runsConceded / balls) * 6);

  ApiResponse.success(res, {
    runsConceded,
    overs,
    economy,
    interpretation: economy <= 4 ? 'Excellent' : economy <= 6 ? 'Good' : economy <= 8 ? 'Average' : 'Expensive'
  }, 'Economy rate calculated');
});

/**
 * @desc    Bowling strike rate calculator
 * @route   POST /api/v1/tools/bowling-strike-rate
 * @body    { ballsBowled, wickets }
 */
const calcBowlingStrikeRate = asyncHandler(async (req, res, next) => {
  const { ballsBowled, wickets } = req.body;
  if (ballsBowled <= 0) return next(ApiError.badRequest('Balls bowled must be > 0'));

  const strikeRate = wickets === 0 ? null : toFixed2(ballsBowled / wickets);

  ApiResponse.success(res, {
    ballsBowled,
    overs: totalBallsToOvers(ballsBowled),
    wickets,
    bowlingStrikeRate: strikeRate,
    note: strikeRate === null ? 'Strike rate undefined — no wickets taken' : undefined,
    interpretation: strikeRate !== null
      ? (strikeRate <= 20 ? 'Elite' : strikeRate <= 30 ? 'Very Good' : strikeRate <= 40 ? 'Good' : 'Average')
      : undefined
  }, 'Bowling strike rate calculated');
});

/**
 * @desc    Net Run Rate (NRR) calculator for tournament standings
 * @route   POST /api/v1/tools/nrr
 * @body    { totalRunsScored, totalOversFaced, totalRunsConceded, totalOversBowled }
 */
const calcNRR = asyncHandler(async (req, res, next) => {
  const { totalRunsScored, totalOversFaced, totalRunsConceded, totalOversBowled } = req.body;

  if (totalOversFaced <= 0 || totalOversBowled <= 0) {
    return next(ApiError.badRequest('Overs values must be positive'));
  }

  const ballsFaced = oversToTotalBalls(totalOversFaced);
  const ballsBowled = oversToTotalBalls(totalOversBowled);

  const runRateFor = toFixed2((totalRunsScored / ballsFaced) * 6);
  const runRateAgainst = toFixed2((totalRunsConceded / ballsBowled) * 6);
  const nrr = toFixed2(runRateFor - runRateAgainst);

  ApiResponse.success(res, {
    totalRunsScored,
    totalOversFaced,
    totalRunsConceded,
    totalOversBowled,
    runRateFor,
    runRateAgainst,
    netRunRate: nrr
  }, 'Net Run Rate calculated');
});

/**
 * @desc    DLS target calculator (simplified method for rain interruptions)
 * @route   POST /api/v1/tools/dls
 * @body    { team1Score, team1Overs, team2OversAllowed }
 *
 * Uses the simplified Professional Edition resource table approximation.
 * For production accuracy, integrate a licensed DLS library.
 */
const calcDLS = asyncHandler(async (req, res, next) => {
  const { team1Score, team1Overs, team2OversAllowed, team1Wickets = 0 } = req.body;

  if (team1Score < 0) return next(ApiError.badRequest('Score cannot be negative'));
  if (team1Overs <= 0 || team2OversAllowed <= 0) {
    return next(ApiError.badRequest('Overs values must be positive'));
  }

  // Simplified DLS resource table (50-over match approximation)
  // R(u, w) = percentage of resources remaining for u overs, w wickets lost
  // Full table approximation using polynomial
  const getResource = (overs, wicketsLost) => {
    const maxResource = 100;
    const decayFactors = [1.0, 0.9231, 0.8462, 0.7692, 0.6923, 0.6154, 0.5385, 0.4615, 0.3077, 0.1538, 0.0769];
    const factor = decayFactors[Math.min(wicketsLost, 10)];
    // Resource for u overs with w wickets lost: simplified exponential
    return maxResource * factor * (1 - Math.exp(-overs * 0.1128));
  };

  const r1 = getResource(team1Overs, 0);            // resources team1 used
  const r2Full = getResource(team2OversAllowed, 0); // resources available to team 2

  // Adjusted target = team1Score * (R2 / R1) + 1
  const adjustedTarget = Math.round((team1Score * (r2Full / r1)) + 1);

  ApiResponse.success(res, {
    team1Score,
    team1Overs,
    team1Wickets,
    team2OversAllowed,
    dlsTarget: adjustedTarget,
    resourcePercentUsed: toFixed2(r1),
    resourcePercentAvailable: toFixed2(r2Full),
    disclaimer: 'This is a simplified DLS calculation for guidance only. For official matches, use the ICC-licensed DLS calculator.'
  }, 'DLS target calculated (simplified)');
});

/**
 * @desc    Score projector — project final score based on current run rate
 * @route   POST /api/v1/tools/project-score
 * @body    { currentRuns, oversCompleted, totalOvers, wicketsDown }
 */
const projectScore = asyncHandler(async (req, res, next) => {
  const { currentRuns, oversCompleted, totalOvers, wicketsDown = 0 } = req.body;

  if (oversCompleted <= 0) return next(ApiError.badRequest('Overs completed must be > 0'));
  if (oversCompleted >= totalOvers) return next(ApiError.badRequest('Match has already ended'));

  const ballsCompleted = oversToTotalBalls(oversCompleted);
  const totalBalls = totalOvers * 6;
  const ballsRemaining = totalBalls - ballsCompleted;
  const crr = (currentRuns / ballsCompleted) * 6;

  // Apply wicket-loss penalty factor (rough heuristic)
  const wicketFactor = Math.max(0.6, 1 - wicketsDown * 0.04);

  const projectedAdditional = toFixed2((crr / 6) * ballsRemaining * wicketFactor);
  const projectedTotal = Math.round(currentRuns + projectedAdditional);

  // Provide pessimistic / optimistic range
  const pessimistic = Math.round(currentRuns + projectedAdditional * 0.85);
  const optimistic = Math.round(currentRuns + projectedAdditional * 1.15);

  ApiResponse.success(res, {
    currentRuns,
    oversCompleted,
    totalOvers,
    wicketsDown,
    currentRunRate: toFixed2(crr),
    projectedScore: projectedTotal,
    range: { pessimistic, optimistic },
    ballsRemaining,
    oversRemaining: totalBallsToOvers(ballsRemaining)
  }, 'Score projected');
});

/**
 * @desc    Partnership run rate calculator
 * @route   POST /api/v1/tools/partnership
 * @body    { partnershipRuns, partnershipBalls }
 */
const calcPartnership = asyncHandler(async (req, res, next) => {
  const { partnershipRuns, partnershipBalls } = req.body;
  if (partnershipBalls <= 0) return next(ApiError.badRequest('Partnership balls must be > 0'));

  const runRate = toFixed2((partnershipRuns / partnershipBalls) * 6);
  const strikeRate = toFixed2((partnershipRuns / partnershipBalls) * 100);

  ApiResponse.success(res, {
    partnershipRuns,
    partnershipBalls,
    partnershipOvers: totalBallsToOvers(partnershipBalls),
    runRate,
    strikeRate,
    runsPerBall: toFixed2(partnershipRuns / partnershipBalls)
  }, 'Partnership calculated');
});

/**
 * @desc    Win probability estimator (simplified)
 * @route   POST /api/v1/tools/win-probability
 * @body    { target, runsScored, wicketsDown, ballsRemaining }
 */
const estimateWinProbability = asyncHandler(async (req, res, next) => {
  const { target, runsScored, wicketsDown, ballsRemaining } = req.body;

  if (target <= 0) return next(ApiError.badRequest('Target must be positive'));
  if (ballsRemaining < 0) return next(ApiError.badRequest('Balls remaining cannot be negative'));

  const runsNeeded = target - runsScored;
  const wicketsLeft = 10 - wicketsDown;

  if (runsNeeded <= 0) {
    return ApiResponse.success(res, { battingTeamWinProbability: 100, bowlingTeamWinProbability: 0, result: 'Batting team has won!' });
  }

  if (ballsRemaining === 0 || wicketsLeft === 0) {
    return ApiResponse.success(res, { battingTeamWinProbability: 0, bowlingTeamWinProbability: 100, result: 'Bowling team has won!' });
  }

  // Simplified logistic probability model
  const rrr = (runsNeeded / ballsRemaining) * 6;
  const resourceFactor = (wicketsLeft / 10) * (ballsRemaining / (ballsRemaining + runsNeeded));
  const rawProb = resourceFactor * Math.exp(-0.12 * rrr);
  const battingProb = Math.min(95, Math.max(5, Math.round(rawProb * 100)));

  ApiResponse.success(res, {
    target, runsScored, runsNeeded,
    wicketsDown, wicketsLeft,
    ballsRemaining, requiredRunRate: toFixed2(rrr),
    battingTeamWinProbability: battingProb,
    bowlingTeamWinProbability: 100 - battingProb,
    disclaimer: 'Win probability is a rough statistical estimate, not a prediction.'
  }, 'Win probability estimated');
});

/**
 * @desc    List all available tools
 * @route   GET /api/v1/tools
 * @access  Private (Basic/Pro/Enterprise plan required for some)
 */
const listTools = asyncHandler(async (req, res) => {
  const tools = [
    {
      id: 'crr',
      name: 'Current Run Rate',
      description: 'Calculate the current run rate based on runs scored and overs faced.',
      endpoint: 'POST /api/v1/tools/crr',
      requiredPlan: 'basic',
      fields: [
        { name: 'runs', type: 'number', label: 'Runs Scored', required: true },
        { name: 'overs', type: 'number', label: 'Overs Faced (e.g. 12.4)', required: true }
      ]
    },
    {
      id: 'rrr',
      name: 'Required Run Rate',
      description: 'Calculate the runs needed per over to win the match.',
      endpoint: 'POST /api/v1/tools/rrr',
      requiredPlan: 'basic',
      fields: [
        { name: 'target', type: 'number', label: 'Target Runs', required: true },
        { name: 'runsScored', type: 'number', label: 'Runs Scored So Far', required: true },
        { name: 'oversCompleted', type: 'number', label: 'Overs Completed (e.g. 10.3)', required: true },
        { name: 'totalOvers', type: 'number', label: 'Total Match Overs', required: true }
      ]
    },
    {
      id: 'batting-average',
      name: 'Batting Average',
      description: 'Calculate a batsman\'s career or series batting average.',
      endpoint: 'POST /api/v1/tools/batting-average',
      requiredPlan: 'basic',
      fields: [
        { name: 'totalRuns', type: 'number', label: 'Total Runs', required: true },
        { name: 'innings', type: 'number', label: 'Total Innings', required: true },
        { name: 'notOuts', type: 'number', label: 'Not Outs', required: false }
      ]
    },
    {
      id: 'strike-rate',
      name: 'Batting Strike Rate',
      description: 'Calculate runs scored per 100 balls.',
      endpoint: 'POST /api/v1/tools/strike-rate',
      requiredPlan: 'basic',
      fields: [
        { name: 'runs', type: 'number', label: 'Runs Scored', required: true },
        { name: 'balls', type: 'number', label: 'Balls Faced', required: true }
      ]
    },
    {
      id: 'bowling-average',
      name: 'Bowling Average',
      description: 'Calculate runs conceded per wicket taken.',
      endpoint: 'POST /api/v1/tools/bowling-average',
      requiredPlan: 'basic',
      fields: [
        { name: 'runsConceded', type: 'number', label: 'Runs Conceded', required: true },
        { name: 'wickets', type: 'number', label: 'Wickets Taken', required: true }
      ]
    },
    {
      id: 'economy',
      name: 'Economy Rate',
      description: 'Calculate runs conceded per over for a bowler.',
      endpoint: 'POST /api/v1/tools/economy',
      requiredPlan: 'basic',
      fields: [
        { name: 'runsConceded', type: 'number', label: 'Runs Conceded', required: true },
        { name: 'overs', type: 'number', label: 'Overs Bowled (e.g. 8.3)', required: true }
      ]
    },
    {
      id: 'bowling-strike-rate',
      name: 'Bowling Strike Rate',
      description: 'Calculate balls bowled per wicket taken.',
      endpoint: 'POST /api/v1/tools/bowling-strike-rate',
      requiredPlan: 'basic',
      fields: [
        { name: 'ballsBowled', type: 'number', label: 'Balls Bowled', required: true },
        { name: 'wickets', type: 'number', label: 'Wickets Taken', required: true }
      ]
    },
    {
      id: 'nrr',
      name: 'Net Run Rate (NRR)',
      description: 'Calculate Net Run Rate for tournament points table.',
      endpoint: 'POST /api/v1/tools/nrr',
      requiredPlan: 'basic',
      fields: [
        { name: 'totalRunsScored', type: 'number', label: 'Total Runs Scored', required: true },
        { name: 'totalOversFaced', type: 'number', label: 'Total Overs Faced', required: true },
        { name: 'totalRunsConceded', type: 'number', label: 'Total Runs Conceded', required: true },
        { name: 'totalOversBowled', type: 'number', label: 'Total Overs Bowled', required: true }
      ]
    },
    {
      id: 'dls',
      name: 'DLS Target Calculator',
      description: 'Calculate revised target using simplified DLS method (for rain interruptions).',
      endpoint: 'POST /api/v1/tools/dls',
      requiredPlan: 'pro',
      fields: [
        { name: 'team1Score', type: 'number', label: 'Team 1 Score', required: true },
        { name: 'team1Overs', type: 'number', label: 'Team 1 Overs Played', required: true },
        { name: 'team2OversAllowed', type: 'number', label: 'Team 2 Overs Allowed (after interruption)', required: true },
        { name: 'team1Wickets', type: 'number', label: 'Team 1 Wickets Lost', required: false }
      ]
    },
    {
      id: 'project-score',
      name: 'Score Projector',
      description: 'Project the final score based on current run rate and wickets in hand.',
      endpoint: 'POST /api/v1/tools/project-score',
      requiredPlan: 'basic',
      fields: [
        { name: 'currentRuns', type: 'number', label: 'Current Runs', required: true },
        { name: 'oversCompleted', type: 'number', label: 'Overs Completed', required: true },
        { name: 'totalOvers', type: 'number', label: 'Total Match Overs', required: true },
        { name: 'wicketsDown', type: 'number', label: 'Wickets Down', required: false }
      ]
    },
    {
      id: 'partnership',
      name: 'Partnership Analyzer',
      description: 'Calculate run rate and strike rate for a batting partnership.',
      endpoint: 'POST /api/v1/tools/partnership',
      requiredPlan: 'basic',
      fields: [
        { name: 'partnershipRuns', type: 'number', label: 'Partnership Runs', required: true },
        { name: 'partnershipBalls', type: 'number', label: 'Partnership Balls', required: true }
      ]
    },
    {
      id: 'win-probability',
      name: 'Win Probability Estimator',
      description: 'Estimate win probability for the batting team chasing a target.',
      endpoint: 'POST /api/v1/tools/win-probability',
      requiredPlan: 'pro',
      fields: [
        { name: 'target', type: 'number', label: 'Target Runs', required: true },
        { name: 'runsScored', type: 'number', label: 'Runs Scored', required: true },
        { name: 'wicketsDown', type: 'number', label: 'Wickets Down', required: true },
        { name: 'ballsRemaining', type: 'number', label: 'Balls Remaining', required: true }
      ]
    }
  ];

  const userPlan = req.user?.subscriptionPlan || 'free';
  const planOrder = ['free', 'basic', 'pro', 'enterprise'];
  const userPlanIndex = planOrder.indexOf(userPlan);

  const toolsWithAccess = tools.map(tool => ({
    ...tool,
    hasAccess: userPlanIndex >= planOrder.indexOf(tool.requiredPlan)
  }));

  ApiResponse.success(res, { tools: toolsWithAccess, userPlan });
});

module.exports = {
  listTools,
  calcCRR, calcRRR,
  calcBattingAverage, calcStrikeRate,
  calcBowlingAverage, calcEconomy, calcBowlingStrikeRate,
  calcNRR, calcDLS, projectScore,
  calcPartnership, estimateWinProbability
};
