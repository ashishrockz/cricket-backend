/**
 * FCM Push Notification Service (Firebase Cloud Messaging)
 *
 * Setup in .env:
 *   FIREBASE_SERVICE_ACCOUNT=<JSON string of your Firebase service account key>
 *
 * Download service account: Firebase Console → Project Settings → Service Accounts → Generate new private key
 * Then: FIREBASE_SERVICE_ACCOUNT=$(cat firebase-service-account.json | tr -d '\n')
 */
const logger = require('../config/logger');

let messaging = null;

const init = () => {
  if (messaging) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    logger.info('FCM: FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
    return;
  }
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    logger.info('FCM: Firebase Admin initialized');
  } catch (e) {
    logger.warn(`FCM: Init failed — ${e.message}`);
  }
};

/**
 * Send a push notification to a single device token.
 *
 * @param {string} fcmToken   Device FCM token
 * @param {string} title      Notification title
 * @param {string} body       Notification body
 * @param {object} data       Key-value pairs (all strings) for deep-linking
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
const sendPush = async (fcmToken, title, body, data = {}) => {
  if (!messaging || !fcmToken) return false;

  // FCM data values must be strings
  const safeData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: safeData,
      android: { priority: 'high', notification: { sound: 'default', channelId: 'cricket_default' } },
      apns:    { payload: { aps: { sound: 'default', badge: 1 } } }
    });
    logger.debug(`FCM push sent to token ${fcmToken.slice(0, 10)}…`);
    return true;
  } catch (e) {
    logger.warn(`FCM push failed: ${e.message}`);
    return false;
  }
};

/**
 * Send push to multiple device tokens (up to 500 at once via FCM multicast).
 *
 * @param {string[]} tokens
 * @param {string}   title
 * @param {string}   body
 * @param {object}   data
 */
const sendMulticastPush = async (tokens, title, body, data = {}) => {
  if (!messaging || !tokens?.length) return;

  const safeData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  // FCM allows max 500 tokens per request
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  for (const chunk of chunks) {
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: safeData,
        android: { priority: 'high' },
        apns:    { payload: { aps: { sound: 'default' } } }
      });
      logger.debug(`FCM multicast: ${response.successCount}/${chunk.length} delivered`);
    } catch (e) {
      logger.warn(`FCM multicast failed: ${e.message}`);
    }
  }
};

// Initialize on module load
init();

module.exports = { sendPush, sendMulticastPush };
