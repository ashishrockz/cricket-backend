const User = require('../models/User');
const logger = require('../config/logger');
const { ROLES } = require('../config/constants');

/**
 * Seed default admin user on first startup
 */
const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } });

    if (adminExists) {
      logger.debug('Admin user already exists, skipping seed');
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@cricketscore.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

    await User.create({
      username: 'super_admin',
      email: adminEmail,
      password: adminPassword,
      fullName: 'System Administrator',
      role: ROLES.SUPER_ADMIN,
      playingRole: 'batsman',
      battingStyle: 'right_hand',
      bowlingStyle: 'none',
      isActive: true
    });

    logger.info(`Default admin user created: ${adminEmail}`);
    logger.warn('IMPORTANT: Change the default admin password immediately in production!');
  } catch (error) {
    if (error.code === 11000) {
      logger.debug('Admin seed skipped - user already exists');
    } else {
      logger.error(`Admin seed failed: ${error.message}`);
    }
  }
};

/**
 * Standalone seeder script (run with: npm run seed)
 */
const runSeeder = async () => {
  require('dotenv').config();
  const { connectDB, disconnectDB } = require('../config/database');

  try {
    await connectDB();
    await seedAdmin();

    // Optional: seed demo data in development
    if (process.env.NODE_ENV === 'development' && process.argv.includes('--demo')) {
      await seedDemoData();
    }

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    logger.error(`Seeder failed: ${error.message}`);
    process.exit(1);
  }
};

const seedDemoData = async () => {
  logger.info('Seeding demo data...');

  const demoUsers = [
    { username: 'virat_kohli', email: 'virat@demo.com', password: 'Demo@12345', fullName: 'Virat Kohli', playingRole: 'batsman', battingStyle: 'right_hand', city: 'Delhi' },
    { username: 'rohit_sharma', email: 'rohit@demo.com', password: 'Demo@12345', fullName: 'Rohit Sharma', playingRole: 'batsman', battingStyle: 'right_hand', city: 'Mumbai' },
    { username: 'jasprit_bumrah', email: 'bumrah@demo.com', password: 'Demo@12345', fullName: 'Jasprit Bumrah', playingRole: 'bowler', battingStyle: 'right_hand', bowlingStyle: 'right_arm_fast', city: 'Ahmedabad' },
    { username: 'ravindra_jadeja', email: 'jadeja@demo.com', password: 'Demo@12345', fullName: 'Ravindra Jadeja', playingRole: 'all_rounder', battingStyle: 'left_hand', bowlingStyle: 'left_arm_orthodox', city: 'Rajkot' },
    { username: 'rishabh_pant', email: 'pant@demo.com', password: 'Demo@12345', fullName: 'Rishabh Pant', playingRole: 'wicket_keeper', battingStyle: 'left_hand', city: 'Roorkee' },
  ];

  for (const userData of demoUsers) {
    const exists = await User.findOne({ email: userData.email });
    if (!exists) {
      await User.create(userData);
      logger.info(`Demo user created: ${userData.username}`);
    }
  }

  logger.info('Demo data seeding complete');
};

if (require.main === module) {
  runSeeder();
}

module.exports = { seedAdmin };
