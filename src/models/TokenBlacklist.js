const mongoose = require('mongoose');

// Stores revoked JWT access tokens until they naturally expire.
// MongoDB TTL index deletes entries automatically when expiresAt is reached.
const tokenBlacklistSchema = new mongoose.Schema({
  token:     { type: String, required: true, unique: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// Auto-delete documents after expiresAt
tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
