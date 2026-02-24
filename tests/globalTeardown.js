/**
 * Global Jest teardown — runs ONCE after ALL test suites.
 * Drops the test database and disconnects.
 */
const mongoose = require('mongoose');

module.exports = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  console.log('\n[Test DB] Dropped and disconnected.\n');
};
