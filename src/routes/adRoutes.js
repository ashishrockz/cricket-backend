const router = require('express').Router();
const {
  getAdsForPlacement, recordClick
} = require('../controllers/adController');
const { optionalAuthenticate } = require('../middlewares/auth');

/**
 * @swagger
 * /api/v1/ads/placement/{placement}:
 *   get:
 *     summary: Get active ads for a placement slot
 *     description: Returns ads targeted for the given placement. Pass auth token for user-targeted ad personalisation. No auth required.
 *     tags: [Ads]
 *     parameters:
 *       - in: path
 *         name: placement
 *         required: true
 *         schema:
 *           type: string
 *           enum: [home_top, home_bottom, match_start, match_end, scoreboard, sidebar]
 *         description: The UI slot where the ad will be displayed
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 3 }
 *     responses:
 *       200:
 *         description: List of active ads for the placement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Ad' }
 */
router.get('/placement/:placement', optionalAuthenticate, getAdsForPlacement);

/**
 * @swagger
 * /api/v1/ads/{id}/click:
 *   post:
 *     summary: Record an ad click
 *     description: Increments the click counter for the ad. No auth required; pass token for user attribution.
 *     tags: [Ads]
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Click recorded
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/:id/click', optionalAuthenticate, recordClick);

module.exports = router;
