const router = require('express').Router();
const { getUserById, updateProfile, searchUsers, getMatchHistory, getUserStats, updateFcmToken } = require('../controllers/userController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { userValidators } = require('../validators');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile and search
 */

/**
 * @swagger
 * /api/v1/users/search:
 *   get:
 *     summary: Search users by username or name
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of matching users
 */
router.get('/search', authenticate, validate(userValidators.search), searchUsers);

/**
 * @swagger
 * /api/v1/users/match-history:
 *   get:
 *     summary: Get current user's match history
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Match history with pagination
 */
router.get('/match-history', authenticate, getMatchHistory);

/**
 * @swagger
 * /api/v1/users/profile:
 *   put:
 *     summary: Update current user's profile
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               playingRole:
 *                 type: string
 *                 enum: [batsman, bowler, all_rounder, wicket_keeper]
 *               battingStyle:
 *                 type: string
 *                 enum: [right_hand, left_hand]
 *               bowlingStyle:
 *                 type: string
 *               city:
 *                 type: string
 *               bio:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', authenticate, validate(userValidators.updateProfile), updateProfile);
router.patch('/fcm-token', authenticate, updateFcmToken);

/**
 * @swagger
 * /api/v1/users/{id}/stats:
 *   get:
 *     summary: Get user's career statistics
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Career stats
 */
router.get('/:id/stats', authenticate, validate(userValidators.getById), getUserStats);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user profile by ID
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/:id', authenticate, validate(userValidators.getById), getUserById);

module.exports = router;
