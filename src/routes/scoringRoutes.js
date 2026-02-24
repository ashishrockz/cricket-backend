const router = require('express').Router();
const { recordBall, undoBall } = require('../controllers/scoringController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { scoringValidators } = require('../validators');

/**
 * @swagger
 * tags:
 *   name: Scoring
 *   description: Live ball-by-ball scoring
 */

/**
 * @swagger
 * /api/v1/scoring/ball:
 *   post:
 *     summary: Record a ball/delivery
 *     tags: [Scoring]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [matchId, outcome, runs, strikerId, nonStrikerId, bowlerId]
 *             properties:
 *               matchId:
 *                 type: string
 *               outcome:
 *                 type: string
 *                 enum: [normal, wide, no_ball, bye, leg_bye, wicket, dead_ball]
 *               runs:
 *                 type: integer
 *                 min: 0
 *                 max: 7
 *               extraRuns:
 *                 type: integer
 *                 min: 0
 *                 default: 0
 *               strikerId:
 *                 type: string
 *                 description: Player subdocument _id from team roster
 *               nonStrikerId:
 *                 type: string
 *               bowlerId:
 *                 type: string
 *               isWicket:
 *                 type: boolean
 *                 default: false
 *               dismissalType:
 *                 type: string
 *                 enum: [bowled, caught, lbw, run_out, stumped, hit_wicket, caught_and_bowled, retired_hurt, retired_out, timed_out, hit_the_ball_twice, obstructing_the_field]
 *               dismissedPlayerId:
 *                 type: string
 *               fielderId:
 *                 type: string
 *               commentary:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Ball recorded
 */
router.post('/ball', authenticate, validate(scoringValidators.recordBall), recordBall);

/**
 * @swagger
 * /api/v1/scoring/undo:
 *   post:
 *     summary: Undo the last recorded ball
 *     tags: [Scoring]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [matchId]
 *             properties:
 *               matchId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Last ball undone
 */
router.post('/undo', authenticate, validate(scoringValidators.undoBall), undoBall);

module.exports = router;
