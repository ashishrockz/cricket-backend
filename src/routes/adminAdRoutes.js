const router = require('express').Router();
const {
  listAds, getAd, createAd, updateAd,
  reviewAd, deleteAd, getAdAnalytics, toggleAdActive
} = require('../controllers/adController');

/**
 * @swagger
 * /api/v1/admin/ads/analytics:
 *   get:
 *     summary: Ad performance analytics — impressions, clicks, CTR, revenue
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ad analytics summary
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/analytics', getAdAnalytics);

/**
 * @swagger
 * /api/v1/admin/ads:
 *   get:
 *     summary: List all ads with filters
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, active, paused, expired]
 *       - in: query
 *         name: placement
 *         schema:
 *           type: string
 *           enum: [home_top, home_bottom, match_start, match_end, scoreboard, sidebar]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [banner, interstitial, native, video]
 *     responses:
 *       200:
 *         description: Paginated ad list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Ad' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 */
router.get('/', listAds);

/**
 * @swagger
 * /api/v1/admin/ads:
 *   post:
 *     summary: Create a new advertisement
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, type, placement, imageUrl, targetUrl]
 *             properties:
 *               title:       { type: string, example: Summer Sale }
 *               type:        { type: string, enum: [banner, interstitial, native, video] }
 *               placement:   { type: string, enum: [home_top, home_bottom, match_start, match_end, scoreboard, sidebar] }
 *               imageUrl:    { type: string, format: uri }
 *               targetUrl:   { type: string, format: uri }
 *               startDate:   { type: string, format: date-time }
 *               endDate:     { type: string, format: date-time }
 *               budget:      { type: number }
 *     responses:
 *       201:
 *         description: Ad created (status = pending, awaiting review)
 */
router.post('/', createAd);

/**
 * @swagger
 * /api/v1/admin/ads/{id}:
 *   get:
 *     summary: Get ad details
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Ad details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Ad' }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', getAd);

/**
 * @swagger
 * /api/v1/admin/ads/{id}:
 *   put:
 *     summary: Update an ad
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Ad'
 *     responses:
 *       200:
 *         description: Ad updated
 */
router.put('/:id', updateAd);

/**
 * @swagger
 * /api/v1/admin/ads/{id}/review:
 *   put:
 *     summary: Approve or reject an ad
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               reviewNote:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review decision applied
 */
router.put('/:id/review', reviewAd);

/**
 * @swagger
 * /api/v1/admin/ads/{id}/toggle:
 *   patch:
 *     summary: Toggle ad active/paused status
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Ad status toggled
 */
router.patch('/:id/toggle', toggleAdActive);

/**
 * @swagger
 * /api/v1/admin/ads/{id}:
 *   delete:
 *     summary: Delete an ad (only non-active ads)
 *     tags: [Admin - Advertisements]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Ad deleted
 *       400:
 *         description: Cannot delete an active ad
 */
router.delete('/:id', deleteAd);

module.exports = router;
