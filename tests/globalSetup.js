/**
 * Global Jest setup — runs ONCE before ALL test suites.
 * Connects to the test MongoDB database.
 */
require('dotenv').config();
const mongoose = require('mongoose');

module.exports = async () => {
  const uri = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/cricket_scoring_test';
  await mongoose.connect(uri);
  console.log(`\n[Test DB] Connected: ${uri}\n`);
};
