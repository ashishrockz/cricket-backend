const mongoose = require('mongoose');

const roomInvitationSchema = new mongoose.Schema({
  room:        { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  invitedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired'],
    default: 'pending',
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  }
}, { timestamps: true });

// Auto-delete after 24 hours
roomInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Prevent duplicate pending invite to same room
roomInvitationSchema.index({ room: 1, invitedUser: 1, status: 1 });

module.exports = mongoose.model('RoomInvitation', roomInvitationSchema);
