const logger = require('../config/logger');
const { getIO } = require('../socket/socketManager');
const { SOCKET_EVENTS } = require('../config/constants');
const { sendPush } = require('./fcmService');
const User = require('../models/User');

/**
 * Notification types used across the app
 */
const NOTIFICATION_TYPES = {
  FRIEND_REQUEST: 'friend_request',
  FRIEND_ACCEPTED: 'friend_accepted',
  ADDED_TO_MATCH: 'added_to_match',
  MATCH_STARTING: 'match_starting',
  MATCH_COMPLETED: 'match_completed',
  ROOM_INVITE: 'room_invite',
  INNINGS_COMPLETE: 'innings_complete'
};

/**
 * In-memory notification queue.
 * In production, replace with Redis pub/sub, FCM, or a message broker.
 */
const pendingNotifications = [];

/**
 * Send a real-time notification to a specific user via Socket.IO + FCM push
 *
 * @param {string} userId    - Target user's ObjectId
 * @param {string} type      - Notification type constant
 * @param {object} payload   - Notification data
 * @param {object} [push]    - Optional { title, body } for FCM push; skipped if omitted
 */
const notifyUser = async (userId, type, payload, push = null) => {
  // 1. Socket.IO — real-time (best effort)
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('notification', {
      type,
      payload,
      timestamp: new Date()
    });
    logger.debug(`Notification sent to user:${userId} — ${type}`);
  } catch (error) {
    pendingNotifications.push({ userId, type, payload, createdAt: new Date() });
    logger.debug(`Notification queued for user:${userId} — ${type}`);
  }

  // 2. FCM Push — for background / offline devices
  if (push?.title) {
    try {
      const user = await User.findById(userId).select('+fcmToken').lean();
      if (user?.fcmToken) {
        await sendPush(user.fcmToken, push.title, push.body || '', { type, ...payload });
      }
    } catch (err) {
      logger.warn(`FCM push failed for user:${userId} — ${err.message}`);
    }
  }
};

/**
 * Notify a registered player they've been added to a match
 */
const notifyPlayerAddedToMatch = (userId, matchInfo) => {
  const msg = `You have been added to a match: ${matchInfo.teamAName} vs ${matchInfo.teamBName}`;
  notifyUser(
    userId,
    NOTIFICATION_TYPES.ADDED_TO_MATCH,
    { message: msg, roomCode: matchInfo.roomCode, matchId: matchInfo.matchId, team: matchInfo.team, venue: matchInfo.venue, matchDate: matchInfo.matchDate },
    { title: 'Added to Match', body: msg }
  );
};

/**
 * Notify all registered players in a match that scoring has started
 */
const notifyMatchStarting = (playerUserIds, matchInfo) => {
  const msg = `Match is starting: ${matchInfo.teamAName} vs ${matchInfo.teamBName}`;
  playerUserIds.forEach((userId) => {
    notifyUser(
      userId,
      NOTIFICATION_TYPES.MATCH_STARTING,
      { message: msg, matchId: matchInfo.matchId, roomCode: matchInfo.roomCode },
      { title: 'Match Starting!', body: msg }
    );
  });
};

/**
 * Notify all registered players that the match has ended
 */
const notifyMatchCompleted = (playerUserIds, matchInfo) => {
  playerUserIds.forEach((userId) => {
    notifyUser(
      userId,
      NOTIFICATION_TYPES.MATCH_COMPLETED,
      { message: matchInfo.resultSummary, matchId: matchInfo.matchId },
      { title: 'Match Completed', body: matchInfo.resultSummary }
    );
  });
};

/**
 * Flush any queued notifications for a user when they reconnect
 */
const flushPendingNotifications = (userId) => {
  const userNotifs = pendingNotifications.filter(
    (n) => n.userId.toString() === userId.toString()
  );
  if (userNotifs.length === 0) return;

  try {
    const io = getIO();
    userNotifs.forEach((n) => {
      io.to(`user:${userId}`).emit('notification', {
        type: n.type,
        payload: n.payload,
        timestamp: n.createdAt
      });
    });
    // Remove flushed
    for (let i = pendingNotifications.length - 1; i >= 0; i--) {
      if (pendingNotifications[i].userId.toString() === userId.toString()) {
        pendingNotifications.splice(i, 1);
      }
    }
    logger.debug(`Flushed ${userNotifs.length} notifications for user:${userId}`);
  } catch (error) {
    logger.warn(`Failed to flush notifications for user:${userId}: ${error.message}`);
  }
};

module.exports = {
  NOTIFICATION_TYPES,
  notifyUser,
  notifyPlayerAddedToMatch,
  notifyMatchStarting,
  notifyMatchCompleted,
  flushPendingNotifications
};
