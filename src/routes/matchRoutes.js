const router = require('express').Router();
const { getMatchDetails, recordToss, startMatch, endInnings, getLiveScore, getMatchTimeline } = require('../controllers/matchController');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { matchValidators } = require('../validators');

/**
 * @swagger
 * tags:
 *   name: Matches
 *   description: Match lifecycle management
 */

/**
 * @swagger
 * /api/v1/matches/{id}:
 *   get:
 *     summary: Get match details
 *     tags: [Matches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Match details
 */
router.get('/:id', authenticate, validate(matchValidators.matchId), getMatchDetails);

/**
 * @swagger
 * /api/v1/matches/{id}/live:
 *   get:
 *     summary: Get live scorecard (public with optional auth for personal stats)
 *     tags: [Matches]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Live scorecard data
 */
router.get('/:id/live', optionalAuth, validate(matchValidators.matchId), getLiveScore);

/**
 * @swagger
 * /api/v1/matches/{id}/timeline:
 *   get:
 *     summary: Get ball-by-ball timeline
 *     tags: [Matches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: innings
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ball-by-ball events
 */
router.get('/:id/timeline', authenticate, validate(matchValidators.matchId), getMatchTimeline);

/**
 * @swagger
 * /api/v1/matches/{id}/toss:
 *   post:
 *     summary: Record toss result
 *     tags: [Matches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [wonBy, decision]
 *             properties:
 *               wonBy:
 *                 type: string
 *                 enum: [team_a, team_b]
 *               decision:
 *                 type: string
 *                 enum: [bat, bowl]
 *     responses:
 *       200:
 *         description: Toss recorded
 */
router.post('/:id/toss', authenticate, validate(matchValidators.matchId), validate(matchValidators.toss), recordToss);

/**
 * @swagger
 * /api/v1/matches/{id}/start:
 *   post:
 *     summary: Start match (after toss)
 *     tags: [Matches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Match started
 */
router.post('/:id/start', authenticate, validate(matchValidators.matchId), startMatch);

/**
 * @swagger
 * /api/v1/matches/{id}/end-innings:
 *   post:
 *     summary: End current innings
 *     tags: [Matches]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Innings ended
 */
router.post('/:id/end-innings', authenticate, validate(matchValidators.matchId), endInnings);

module.exports = router;
