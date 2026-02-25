const router = require('express').Router();
const {
  createRoom, joinRoom, leaveRoom, getRoomDetails, getRoomByCode,
  addPlayerToTeam, removePlayerFromTeam, getMyRooms,
  inviteToRoom, getMyInvitations, acceptInvitation, declineInvitation
} = require('../controllers/roomController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { roomValidators } = require('../validators');

/**
 * @swagger
 * tags:
 *   name: Rooms
 *   description: Match room management
 */

/**
 * @swagger
 * /api/v1/rooms:
 *   post:
 *     summary: Create a new match room
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, matchFormat, totalOvers, teamAName, teamBName, creatorRole]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Sunday League Match 5"
 *               matchFormat:
 *                 type: string
 *                 enum: [T10, T20, ODI, TEST, CUSTOM]
 *               totalOvers:
 *                 type: integer
 *                 min: 1
 *                 max: 90
 *                 example: 20
 *               teamAName:
 *                 type: string
 *                 example: "Mumbai XI"
 *               teamBName:
 *                 type: string
 *                 example: "Delhi XI"
 *               venue:
 *                 type: string
 *                 example: "City Sports Ground"
 *               matchDate:
 *                 type: string
 *                 format: date-time
 *               maxPlayersPerTeam:
 *                 type: integer
 *                 default: 11
 *               isPrivate:
 *                 type: boolean
 *                 default: false
 *               creatorRole:
 *                 type: string
 *                 enum: [team_a_manager, team_b_manager, scorer]
 *     responses:
 *       201:
 *         description: Room created
 */
router.post('/', authenticate, validate(roomValidators.create), createRoom);

/**
 * @swagger
 * /api/v1/rooms/my-rooms:
 *   get:
 *     summary: Get rooms the current user is part of
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [waiting, ready, live, completed, cancelled]
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User's rooms
 */
router.get('/my-rooms', authenticate, getMyRooms);

// ---- Invitations (static paths must be before /:id) ----
router.get('/invitations',                    authenticate, getMyInvitations);
router.post('/invitations/:inviteId/accept',  authenticate, acceptInvitation);
router.post('/invitations/:inviteId/decline', authenticate, declineInvitation);

/**
 * @swagger
 * /api/v1/rooms/code/{roomCode}:
 *   get:
 *     summary: Get room by room code
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomCode
 *         required: true
 *         schema: { type: string }
 *         example: CRK-1234
 *     responses:
 *       200:
 *         description: Room details
 */
router.get('/code/:roomCode', authenticate, getRoomByCode);

/**
 * @swagger
 * /api/v1/rooms/join/{roomCode}:
 *   post:
 *     summary: Join a room by room code
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomCode
 *         required: true
 *         schema: { type: string }
 *         example: CRK-1234
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [team_a_manager, team_b_manager, scorer]
 *     responses:
 *       200:
 *         description: Joined room
 */
router.post('/join/:roomCode', authenticate, validate(roomValidators.join), joinRoom);

/**
 * @swagger
 * /api/v1/rooms/{id}:
 *   get:
 *     summary: Get room details by ID
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Room details
 */
router.get('/:id', authenticate, validate(roomValidators.roomId), getRoomDetails);

/**
 * @swagger
 * /api/v1/rooms/{id}/leave:
 *   post:
 *     summary: Leave a room
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Left room
 */
router.post('/:id/leave', authenticate, validate(roomValidators.roomId), leaveRoom);

/**
 * @swagger
 * /api/v1/rooms/{id}/players:
 *   post:
 *     summary: Add a player to a team in the room
 *     tags: [Rooms]
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
 *             required: [team, playerType]
 *             properties:
 *               team:
 *                 type: string
 *                 enum: [team_a, team_b]
 *               playerType:
 *                 type: string
 *                 enum: [static, registered]
 *               userId:
 *                 type: string
 *                 description: Required if playerType is registered
 *               name:
 *                 type: string
 *                 description: Required if playerType is static
 *               playingRole:
 *                 type: string
 *                 enum: [batsman, bowler, all_rounder, wicket_keeper]
 *               isCaptain:
 *                 type: boolean
 *               isWicketKeeper:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Player added
 */
router.post('/:id/players', authenticate, validate(roomValidators.addPlayer), addPlayerToTeam);

/**
 * @swagger
 * /api/v1/rooms/{id}/players/{playerId}:
 *   delete:
 *     summary: Remove a player from a team
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Player removed
 */
router.delete('/:id/players/:playerId', authenticate, removePlayerFromTeam);

// ---- Invite to specific room (dynamic :id, must be after static /invitations routes) ----
router.post('/:id/invite', authenticate, inviteToRoom);

module.exports = router;
