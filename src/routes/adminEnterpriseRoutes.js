const router = require('express').Router();
const {
  adminListEnterprises, adminGetEnterprise,
  verifyEnterprise, suspendEnterprise,
  activateEnterprise, deactivateEnterprise
} = require('../controllers/enterpriseController');

/**
 * @swagger
 * /api/v1/admin/enterprises:
 *   get:
 *     summary: List all enterprises with filters
 *     tags: [Admin - Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [academy, club, school, corporate, other] }
 *       - in: query
 *         name: isVerified
 *         schema: { type: boolean }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: isSuspended
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated enterprise list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Enterprise' }
 *                 pagination: { $ref: '#/components/schemas/PaginationMeta' }
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/', adminListEnterprises);

/**
 * @swagger
 * /api/v1/admin/enterprises/{id}:
 *   get:
 *     summary: Get enterprise details by ID
 *     tags: [Admin - Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Enterprise details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Enterprise' }
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get('/:id', adminGetEnterprise);

/**
 * @swagger
 * /api/v1/admin/enterprises/{id}/verify:
 *   put:
 *     summary: Verify or unverify an enterprise
 *     description: Pass `{ verified: true }` to verify or `{ verified: false }` to remove verification.
 *     tags: [Admin - Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verified: { type: boolean }
 *     responses:
 *       200:
 *         description: Verification status updated
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/:id/verify', verifyEnterprise);

/**
 * @swagger
 * /api/v1/admin/enterprises/{id}/suspend:
 *   put:
 *     summary: Suspend or unsuspend an enterprise
 *     description: Pass `{ suspended: true }` to suspend or `{ suspended: false }` to unsuspend.
 *     tags: [Admin - Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               suspended: { type: boolean }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Suspension status updated
 */
router.put('/:id/suspend', suspendEnterprise);

/**
 * @swagger
 * /api/v1/admin/enterprises/{id}/activate:
 *   post:
 *     summary: Activate an enterprise
 *     tags: [Admin - Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Enterprise activated
 */
router.post('/:id/activate', activateEnterprise);

/**
 * @swagger
 * /api/v1/admin/enterprises/{id}/deactivate:
 *   post:
 *     summary: Deactivate an enterprise
 *     tags: [Admin - Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     responses:
 *       200:
 *         description: Enterprise deactivated
 */
router.post('/:id/deactivate', deactivateEnterprise);

module.exports = router;
