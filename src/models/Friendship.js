const mongoose = require('mongoose');
const { FRIEND_STATUS } = require('../config/constants');

const friendshipSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: Object.values(FRIEND_STATUS),
    default: FRIEND_STATUS.PENDING,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for uniqueness and lookups
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

// Static: check friendship
friendshipSchema.statics.areFriends = async function (userId1, userId2) {
  const friendship = await this.findOne({
    $or: [
      { requester: userId1, recipient: userId2, status: FRIEND_STATUS.ACCEPTED },
      { requester: userId2, recipient: userId1, status: FRIEND_STATUS.ACCEPTED }
    ]
  });
  return !!friendship;
};

// Static: get friendship between two users
friendshipSchema.statics.getFriendship = async function (userId1, userId2) {
  return this.findOne({
    $or: [
      { requester: userId1, recipient: userId2 },
      { requester: userId2, recipient: userId1 }
    ]
  });
};

module.exports = mongoose.model('Friendship', friendshipSchema);
