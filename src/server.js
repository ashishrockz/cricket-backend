require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/database');
const { initializeSocket } = require('./socket/socketManager');
const logger = require('./config/logger');
const { seedAdmin } = require('./utils/seeder');
const { seedSubscriptionPlans } = require('./services/subscriptionService');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);

// Connect to Database and Start Server
const startServer = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected successfully');

    // Seed default admin user and subscription plans
    await seedAdmin();
    await seedSubscriptionPlans();

    server.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`API Docs available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
