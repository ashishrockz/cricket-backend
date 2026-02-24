const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: { type: String, trim: true },
  transactionId: { type: String, trim: true },
  gateway: { type: String, trim: true },   // razorpay, stripe, manual
  status: {
    type: String,
    enum: ['success', 'failed', 'refunded', 'pending'],
    default: 'pending'
  },
  notes: { type: String, trim: true, maxlength: 300 }
}, { _id: false });

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enterprise: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enterprise',
    default: null
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  planSlug: {
    type: String,
    required: true,
    enum: ['free', 'basic', 'pro', 'enterprise']
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'trial', 'past_due', 'paused'],
    default: 'active'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'annual', 'lifetime', 'free'],
    default: 'free'
  },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },        // null = lifetime/free
  trialEndDate: { type: Date, default: null },
  isTrialActive: { type: Boolean, default: false },
  autoRenew: { type: Boolean, default: false },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, trim: true, maxlength: 300 },
  paymentHistory: [paymentRecordSchema],
  discountCode: { type: String, trim: true },
  discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
  grantedByAdmin: { type: Boolean, default: false },  // admin manually granted
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, trim: true, maxlength: 500 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ enterprise: 1 });
subscriptionSchema.index({ planSlug: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ status: 1 });

// Virtual: check if subscription is valid
subscriptionSchema.virtual('isValid').get(function () {
  if (this.status !== 'active' && this.status !== 'trial') return false;
  if (this.endDate && this.endDate < new Date()) return false;
  return true;
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
