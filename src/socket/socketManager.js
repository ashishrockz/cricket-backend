const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { SOCKET_EVENTS } = require('../config/constants');

let io;

const productionOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
        if (productionOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        // Allow anonymous connections for spectators
        socket.userData = { isAuthenticated: false, isSpectator: true };
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userData = {
        userId: decoded.id,
        role: decoded.role,
        isAuthenticated: true,
        isSpectator: false
      };
      next();
    } catch (error) {
      // Allow connection but mark as spectator
      socket.userData = { isAuthenticated: false, isSpectator: true };
      next();
    }
  });

  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.debug(`Socket connected: ${socket.id} | Authenticated: ${socket.userData.isAuthenticated}`);

    // ============================================
    // SUBSCRIBE TO USER'S PERSONAL NOTIFICATION ROOM
    // Authenticated users join 'user:<userId>' on connect for push-style notifications
    // ============================================
    if (socket.userData.isAuthenticated) {
      socket.join(`user:${socket.userData.userId}`);
      logger.debug(`Socket ${socket.id} auto-joined user:${socket.userData.userId}`);
    }

    // ============================================
    // JOIN ROOM (for room members and players)
    // ============================================
    socket.on(SOCKET_EVENTS.JOIN_ROOM, (data) => {
      const { roomId, matchId } = data;

      if (roomId) {
        socket.join(`room:${roomId}`);
        logger.debug(`Socket ${socket.id} joined room:${roomId}`);
      }
      if (matchId) {
        socket.join(`match:${matchId}`);
        logger.debug(`Socket ${socket.id} joined match:${matchId}`);
      }

      // Notify other members
      if (socket.userData.isAuthenticated && roomId) {
        socket.to(`room:${roomId}`).emit(SOCKET_EVENTS.ROOM_USER_JOINED, {
          userId: socket.userData.userId,
          socketId: socket.id,
          isSpectator: socket.userData.isSpectator,
          timestamp: new Date()
        });
      }
    });

    // ============================================
    // LEAVE ROOM
    // ============================================
    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (data) => {
      const { roomId, matchId } = data;
      if (roomId) socket.leave(`room:${roomId}`);
      if (matchId) socket.leave(`match:${matchId}`);
    });

    // ============================================
    // REQUEST LIVE SCORE (for players & spectators)
    // ============================================
    socket.on(SOCKET_EVENTS.REQUEST_LIVE_SCORE, (data) => {
      const { matchId } = data;
      if (matchId) {
        socket.join(`match:${matchId}`);
        logger.debug(`Socket ${socket.id} subscribed to live score for match:${matchId}`);
      }
    });

    // ============================================
    // RECORD BALL VIA SOCKET
    // Any authenticated room member can emit this event to record a delivery
    // without going through the REST API. The same processBall service is used.
    // Client emits: { matchId, outcome, runs, extraRuns, strikerId, nonStrikerId, bowlerId,
    //                 isWicket, dismissalType, dismissedPlayerId, fielderId, commentary }
    // Server acks:  { success, data } or { success: false, error }
    // ============================================
    socket.on(SOCKET_EVENTS.RECORD_BALL, async (data, ack) => {
      if (!socket.userData.isAuthenticated) {
        const err = { success: false, error: 'Authentication required to record a ball' };
        if (typeof ack === 'function') return ack(err);
        return socket.emit(SOCKET_EVENTS.ERROR, err);
      }

      try {
        // Lazy-require to avoid circular dependency at module load time
        const { processBall } = require('../services/scoringService');
        const result = await processBall(data, socket.userData.userId);
        if (typeof ack === 'function') ack(result);
        // Ball_update broadcast is already done inside processBall
      } catch (err) {
        logger.error(`RECORD_BALL socket error: ${err.message}`);
        const errPayload = { success: false, error: 'Internal error recording ball' };
        if (typeof ack === 'function') ack(errPayload);
        else socket.emit(SOCKET_EVENTS.ERROR, errPayload);
      }
    });

    // ============================================
    // SELECT NEW BATSMAN AFTER WICKET
    // Client emits: { matchId, incomingBatsmanId, position }
    //   position: 'striker' | 'non_striker'
    // Server broadcasts SELECT_BATSMAN to the room so all clients update UI
    // ============================================
    socket.on(SOCKET_EVENTS.SELECT_BATSMAN, async (data, ack) => {
      if (!socket.userData.isAuthenticated) {
        const err = { success: false, error: 'Authentication required' };
        if (typeof ack === 'function') return ack(err);
        return socket.emit(SOCKET_EVENTS.ERROR, err);
      }

      try {
        const { matchId, incomingBatsmanId, position } = data;
        if (!matchId || !incomingBatsmanId || !position) {
          const err = { success: false, error: 'matchId, incomingBatsmanId and position are required' };
          if (typeof ack === 'function') return ack(err);
          return socket.emit(SOCKET_EVENTS.ERROR, err);
        }

        const Match = require('../models/Match');
        const Room  = require('../models/Room');
        const match = await Match.findById(matchId);
        if (!match) {
          const err = { success: false, error: 'Match not found' };
          if (typeof ack === 'function') return ack(err);
          return;
        }

        const room = await Room.findById(match.room);
        if (!room || !room.isMember(socket.userData.userId)) {
          const err = { success: false, error: 'Only room members can select batsman' };
          if (typeof ack === 'function') return ack(err);
          return;
        }

        const innings = match.innings[match.currentInnings - 1];
        if (!innings) {
          const err = { success: false, error: 'No active innings' };
          if (typeof ack === 'function') return ack(err);
          return;
        }

        // Update currentBatsmen in the innings
        if (position === 'striker') {
          innings.currentBatsmen.striker = incomingBatsmanId;
        } else if (position === 'non_striker') {
          innings.currentBatsmen.nonStriker = incomingBatsmanId;
        }

        innings.markModified('currentBatsmen');
        await match.save();

        const payload = { success: true, matchId, incomingBatsmanId, position };
        if (typeof ack === 'function') ack(payload);

        // Broadcast to all room members
        io.to(`room:${room._id}`).emit(SOCKET_EVENTS.SELECT_BATSMAN, {
          matchId,
          incomingBatsmanId,
          position,
          currentBatsmen: innings.currentBatsmen,
          timestamp: new Date()
        });
      } catch (err) {
        logger.error(`SELECT_BATSMAN socket error: ${err.message}`);
        const errPayload = { success: false, error: 'Internal error selecting batsman' };
        if (typeof ack === 'function') ack(errPayload);
        else socket.emit(SOCKET_EVENTS.ERROR, errPayload);
      }
    });

    // ============================================
    // IN-MATCH CHAT
    // ============================================
    socket.on(SOCKET_EVENTS.MATCH_CHAT, (data) => {
      if (!socket.userData.isAuthenticated) {
        return socket.emit(SOCKET_EVENTS.ERROR, { message: 'Authentication required for chat' });
      }

      const { roomId, message } = data;
      if (!roomId || !message) return;

      io.to(`room:${roomId}`).emit(SOCKET_EVENTS.MATCH_CHAT, {
        userId: socket.userData.userId,
        message: message.substring(0, 500), // Limit message length
        timestamp: new Date()
      });
    });

    // ============================================
    // IN-MATCH REACTIONS
    // ============================================
    socket.on(SOCKET_EVENTS.MATCH_REACTION, (data) => {
      if (!socket.userData.isAuthenticated) return;

      const { roomId, reaction } = data;
      const validReactions = ['six', 'four', 'wicket', 'appeal', 'cheer', 'clap'];

      if (!roomId || !reaction || !validReactions.includes(reaction)) return;

      io.to(`room:${roomId}`).emit(SOCKET_EVENTS.MATCH_REACTION, {
        userId: socket.userData.userId,
        reaction,
        timestamp: new Date()
      });
    });

    // ============================================
    // DISCONNECT
    // ============================================
    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} | Reason: ${reason}`);
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}: ${error.message}`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
};

/**
 * Broadcast score update to all connected clients in a room/match
 */
const broadcastScoreUpdate = (roomId, matchId, eventType, data) => {
  try {
    if (!io) return;
    const payload = { type: eventType, data, timestamp: new Date() };
    if (roomId) io.to(`room:${roomId}`).emit(SOCKET_EVENTS.SCORE_UPDATE, payload);
    if (matchId) io.to(`match:${matchId}`).emit(SOCKET_EVENTS.SCORE_UPDATE, payload);
  } catch (error) {
    logger.warn(`Broadcast failed: ${error.message}`);
  }
};

/**
 * Get connected clients count for a room
 */
const getRoomClientsCount = async (roomId) => {
  try {
    if (!io) return 0;
    const sockets = await io.in(`room:${roomId}`).allSockets();
    return sockets.size;
  } catch {
    return 0;
  }
};

module.exports = { initializeSocket, getIO, broadcastScoreUpdate, getRoomClientsCount };
