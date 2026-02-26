const router = require('express').Router();
const {
  createEnterprise, listEnterprises, getEnterprise, getMyEnterprise,
  updateEnterprise, addMember, removeMember, updateMemberRole
} = require('../controllers/enterpriseController');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/enterprises:
 *   get:
 *     summary: List all verified enterprises / academies (public)
 *     tags: [Enterprises]
 *     parameters:
 *       - $ref: '#/components/parameters/PageQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [academy, club, school, corporate, other] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
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
 */
router.get('/', listEnterprises);

/**
 * @swagger
 * /api/v1/enterprises/{identifier}:
 *   get:
 *     summary: Get enterprise by ID or slug
 *     description: Public endpoint. Pass auth token for member-specific data.
 *     tags: [Enterprises]
 *     parameters:
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema: { type: string }
 *         description: Enterprise ID (ObjectId) or URL slug
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
router.get('/:identifier', optionalAuthenticate, getEnterprise);

// ─── Authenticated ────────────────────────────────────────────────────────────
router.use(authenticate);

/**
 * @swagger
 * /api/v1/enterprises/my/details:
 *   get:
 *     summary: Get the current user's enterprise
 *     tags: [Enterprises]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User's enterprise details
 *       404:
 *         description: User does not belong to an enterprise
 */
router.get('/my/details', getMyEnterprise);

/**
 * @swagger
 * /api/v1/enterprises:
 *   post:
 *     summary: Create a new enterprise / academy
 *     description: Requires a Pro or Enterprise subscription plan.
 *     tags: [Enterprises]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name:        { type: string, example: Mumbai Cricket Academy }
 *               type:        { type: string, enum: [academy, club, school, corporate, other] }
 *               description: { type: string }
 *               city:        { type: string, example: Mumbai }
 *               website:     { type: string, format: uri }
 *               contactEmail:{ type: string, format: email }
 *               contactPhone:{ type: string }
 *     responses:
 *       201:
 *         description: Enterprise created
 *       403:
 *         description: Subscription plan does not allow enterprise management
 */
router.post('/', createEnterprise);

/**
 * @swagger
 * /api/v1/enterprises/{id}:
 *   put:
 *     summary: Update enterprise details (owner/admin only)
 *     tags: [Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Enterprise'
 *     responses:
 *       200:
 *         description: Enterprise updated
 *       403:
 *         description: Not an enterprise admin
 */
router.put('/:id', updateEnterprise);

/**
 * @swagger
 * /api/v1/enterprises/{id}/members:
 *   post:
 *     summary: Add a member to the enterprise
 *     tags: [Enterprises]
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
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: User ID to add }
 *               role:   { type: string, enum: [member, coach, manager, admin], default: member }
 *     responses:
 *       200:
 *         description: Member added
 *       404:
 *         description: User not found
 */
router.post('/:id/members', addMember);

/**
 * @swagger
 * /api/v1/enterprises/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member from the enterprise
 *     tags: [Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Member removed
 */
router.delete('/:id/members/:userId', removeMember);

/**
 * @swagger
 * /api/v1/enterprises/{id}/members/{userId}/role:
 *   put:
 *     summary: Update a member's role in the enterprise
 *     tags: [Enterprises]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PathId'
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [member, coach, manager, admin] }
 *     responses:
 *       200:
 *         description: Member role updated
 */
router.put('/:id/members/:userId/role', updateMemberRole);

module.exports = router;
