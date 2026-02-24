const router = require('express').Router();
const {
  listTools,
  calcCRR, calcRRR,
  calcBattingAverage, calcStrikeRate,
  calcBowlingAverage, calcEconomy, calcBowlingStrikeRate,
  calcNRR, calcDLS, projectScore,
  calcPartnership, estimateWinProbability
} = require('../controllers/toolController');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');
const { requireFeature } = require('../middlewares/subscription');

/**
 * @swagger
 * tags:
 *   name: Cricket Tools
 *   description: Cricket calculators and statistical tools (requires Basic plan or above)
 */

// List tools is accessible to everyone (shows which tools require which plan)
router.get('/', optionalAuthenticate, listTools);

// All calculation tools require authentication + plan check
router.use(authenticate);
router.use(requireFeature('canUseTools'));   // Requires Basic plan or above

/**
 * @swagger
 * /api/v1/tools/crr:
 *   post:
 *     summary: Current Run Rate calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/crr', calcCRR);

/**
 * @swagger
 * /api/v1/tools/rrr:
 *   post:
 *     summary: Required Run Rate calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/rrr', calcRRR);

/**
 * @swagger
 * /api/v1/tools/batting-average:
 *   post:
 *     summary: Batting average calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/batting-average', calcBattingAverage);

/**
 * @swagger
 * /api/v1/tools/strike-rate:
 *   post:
 *     summary: Batting strike rate calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/strike-rate', calcStrikeRate);

/**
 * @swagger
 * /api/v1/tools/bowling-average:
 *   post:
 *     summary: Bowling average calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/bowling-average', calcBowlingAverage);

/**
 * @swagger
 * /api/v1/tools/economy:
 *   post:
 *     summary: Economy rate calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/economy', calcEconomy);

/**
 * @swagger
 * /api/v1/tools/bowling-strike-rate:
 *   post:
 *     summary: Bowling strike rate calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/bowling-strike-rate', calcBowlingStrikeRate);

/**
 * @swagger
 * /api/v1/tools/nrr:
 *   post:
 *     summary: Net Run Rate (NRR) calculator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/nrr', calcNRR);

/**
 * @swagger
 * /api/v1/tools/project-score:
 *   post:
 *     summary: Project final score based on current rate
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/project-score', projectScore);

/**
 * @swagger
 * /api/v1/tools/partnership:
 *   post:
 *     summary: Partnership run rate analyzer
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/partnership', calcPartnership);

/**
 * @swagger
 * /api/v1/tools/dls:
 *   post:
 *     summary: DLS target calculator (simplified)
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/dls', calcDLS);

/**
 * @swagger
 * /api/v1/tools/win-probability:
 *   post:
 *     summary: Win probability estimator
 *     tags: [Cricket Tools]
 *     security:
 *       - BearerAuth: []
 */
router.post('/win-probability', estimateWinProbability);

module.exports = router;
