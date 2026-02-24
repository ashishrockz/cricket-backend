const router = require('express').Router();
const { sendFriendRequest, respondToRequest, getFriendsList, getPendingRequests, getSentRequests, removeFriend } = require('../controllers/friendController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { friendValidators } = require('../validators');

/**
 * @swagger
 * tags:
 *   name: Friends
 *   description: Friend system management
 */

/**
 * @swagger
 * /api/v1/friends:
 *   get:
 *     summary: Get friends list
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of friends
 */
router.get('/', authenticate, getFriendsList);

/**
 * @swagger
 * /api/v1/friends/requests/pending:
 *   get:
 *     summary: Get pending friend requests (received)
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Pending requests
 */
router.get('/requests/pending', authenticate, getPendingRequests);

/**
 * @swagger
 * /api/v1/friends/requests/sent:
 *   get:
 *     summary: Get sent friend requests
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sent requests
 */
router.get('/requests/sent', authenticate, getSentRequests);

/**
 * @swagger
 * /api/v1/friends/request:
 *   post:
 *     summary: Send a friend request
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId]
 *             properties:
 *               recipientId:
 *                 type: string
 *                 description: User ID to send request to
 *     responses:
 *       201:
 *         description: Request sent
 *       409:
 *         description: Already friends or request exists
 */
router.post('/request', authenticate, validate(friendValidators.sendRequest), sendFriendRequest);

/**
 * @swagger
 * /api/v1/friends/request/{id}:
 *   put:
 *     summary: Accept or reject friend request
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Friendship ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accept, reject]
 *     responses:
 *       200:
 *         description: Request responded
 */
router.put('/request/:id', authenticate, validate(friendValidators.respondRequest), respondToRequest);

/**
 * @swagger
 * /api/v1/friends/{id}:
 *   delete:
 *     summary: Remove a friend
 *     tags: [Friends]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Friendship ID
 *     responses:
 *       200:
 *         description: Friend removed
 */
router.delete('/:id', authenticate, removeFriend);

module.exports = router;
