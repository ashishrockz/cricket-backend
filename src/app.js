const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const { swaggerUi, swaggerSpec } = require('./docs/swagger');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const logger = require('./config/logger');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const roomRoutes = require('./routes/roomRoutes');
const matchRoutes = require('./routes/matchRoutes');
const scoringRoutes = require('./routes/scoringRoutes');
const adminRoutes = require('./routes/adminRoutes');
const auditReportRoutes = require('./routes/auditReportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const tournamentRoutes = require('./routes/tournamentRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const enterpriseRoutes = require('./routes/enterpriseRoutes');
const adRoutes = require('./routes/adRoutes');
const toolRoutes = require('./routes/toolRoutes');
const statsRoutes = require('./routes/statsRoutes');

const app = express();

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(helmet());

const productionOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (Postman, mobile apps, curl)
    if (!origin) return callback(null, true);
    // Allow any localhost port automatically
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    // Allow production origins from env
    if (productionOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(mongoSanitize());
app.use(hpp());

// Rate limiting — only active in production
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: {
      success: false,
      message: 'Too many authentication attempts, please try again after 15 minutes.'
    }
  });
  app.use('/api/v1/auth/', authLimiter);

  const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
      success: false,
      message: 'Too many OTP requests, please try again after 15 minutes.'
    }
  });
  app.use('/api/v1/auth/otp/', otpLimiter);
}

// ============================================
// BODY PARSING & UTILITY MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging
app.use(
  process.env.NODE_ENV === 'production'
    ? morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } })
    : morgan('dev')
);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Cricket Scoring API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// ============================================
// API DOCUMENTATION
// ============================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CricketScore API Documentation'
}));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ============================================
// API ROUTES
// ============================================

// Auth & User
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/friends', friendRoutes);

// Match & Scoring
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/matches', matchRoutes);
app.use('/api/v1/scoring', scoringRoutes);

// Subscriptions
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Enterprises (cricket academies)
app.use('/api/v1/enterprises', enterpriseRoutes);

// Ads
app.use('/api/v1/ads', adRoutes);

// Cricket tools
app.use('/api/v1/tools', toolRoutes);

// Stats & Leaderboard
app.use('/api/v1/stats', statsRoutes);

// Social & Notifications
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Admin panel
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/analytics', analyticsRoutes);
app.use('/api/v1/admin/audit', auditReportRoutes);
app.use('/api/v1/admin/tournaments', tournamentRoutes);

// Reports (user-facing)
app.use('/api/v1/reports', auditReportRoutes);

// ============================================
// ERROR HANDLING
// ============================================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
