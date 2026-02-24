/**
 * Shared test helpers — factory functions and common assertions.
 */
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');

// ─── User factory data ────────────────────────────────────────────────────────

let _counter = 0;
const uid = () => ++_counter;

const makeUserData = (overrides = {}) => ({
  username: `testuser${uid()}`,
  email: `testuser${uid()}@cricket.test`,
  password: 'Test@1234',
  fullName: `Test User ${uid()}`,
  playingRole: 'batsman',
  battingStyle: 'right_hand',
  bowlingStyle: 'none',
  city: 'Mumbai',
  ...overrides
});

// ─── Register + login helpers ─────────────────────────────────────────────────

/**
 * Register a user and return { user, tokens, token (accessToken shorthand) }
 */
const registerUser = async (overrides = {}) => {
  const data = makeUserData(overrides);
  const res = await request(app).post('/api/v1/auth/register').send(data);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${JSON.stringify(res.body)}`);
  }
  return {
    user: res.body.data.user,
    tokens: res.body.data.tokens,
    token: res.body.data.tokens.accessToken,
    refreshToken: res.body.data.tokens.refreshToken,
    email: data.email,
    password: data.password,
    username: data.username
  };
};

/**
 * Login and return token
 */
const loginUser = async (email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data?.tokens?.accessToken;
};

/**
 * Seed an admin user directly via the User model (bypasses plan check)
 */
const createAdminUser = async () => {
  const User = require('../src/models/User');
  const SubscriptionPlan = require('../src/models/SubscriptionPlan');
  const Subscription = require('../src/models/Subscription');

  const data = makeUserData({ username: `admin${uid()}`, email: `admin${uid()}@cricket.test` });
  const user = await User.create({ ...data, role: 'admin' });

  // Assign free plan
  let freePlan = await SubscriptionPlan.findOne({ slug: 'free' });
  if (!freePlan) {
    freePlan = await SubscriptionPlan.create({
      name: 'Free', slug: 'free', type: 'individual',
      description: 'Free plan',
      price: { monthly: 0, annual: 0, currency: 'INR' },
      features: { maxRooms: 3, maxPlayersPerRoom: 22, maxTournaments: 0, canUseTools: false, canUploadLogo: false, adsEnabled: true, canManageAcademy: false, maxAcademyMembers: 0, analyticsAccess: false, prioritySupport: false, customBranding: false, apiAccess: false, exportData: false },
      displayOrder: 1
    });
  }

  const sub = await Subscription.create({ user: user._id, plan: freePlan._id, planSlug: 'free', status: 'active', billingCycle: 'free' });
  user.subscription = sub._id;
  user.subscriptionPlan = 'free';
  user.refreshToken = user.generateRefreshToken();
  await user.save();

  return {
    user,
    token: user.generateAccessToken(),
    email: data.email,
    password: data.password
  };
};

/**
 * Upgrade a user to a specific plan directly (for plan-gate testing)
 */
const setUserPlan = async (userId, planSlug) => {
  const User = require('../src/models/User');
  const SubscriptionPlan = require('../src/models/SubscriptionPlan');
  const Subscription = require('../src/models/Subscription');

  let plan = await SubscriptionPlan.findOne({ slug: planSlug });
  if (!plan) {
    const planDefaults = {
      basic: { maxRooms: 10, canUseTools: true, canUploadLogo: true, adsEnabled: true, canManageAcademy: false, maxAcademyMembers: 0, maxTournaments: 2, analyticsAccess: false, prioritySupport: false, customBranding: false, apiAccess: false, exportData: false },
      pro: { maxRooms: -1, canUseTools: true, canUploadLogo: true, adsEnabled: false, canManageAcademy: false, maxAcademyMembers: 0, maxTournaments: 10, analyticsAccess: true, prioritySupport: true, customBranding: false, apiAccess: false, exportData: true },
      enterprise: { maxRooms: -1, canUseTools: true, canUploadLogo: true, adsEnabled: false, canManageAcademy: true, maxAcademyMembers: 500, maxTournaments: -1, analyticsAccess: true, prioritySupport: true, customBranding: true, apiAccess: true, exportData: true }
    };
    plan = await SubscriptionPlan.create({
      name: planSlug.charAt(0).toUpperCase() + planSlug.slice(1),
      slug: planSlug, type: planSlug === 'enterprise' ? 'enterprise' : 'individual',
      description: `${planSlug} plan`,
      price: { monthly: 99, annual: 999, currency: 'INR' },
      features: { maxPlayersPerRoom: 22, ...planDefaults[planSlug] },
      displayOrder: 2
    });
  }

  const sub = await Subscription.create({ user: userId, plan: plan._id, planSlug, status: 'active', billingCycle: 'monthly' });
  await User.findByIdAndUpdate(userId, { subscription: sub._id, subscriptionPlan: planSlug });
};

// ─── Room factory ─────────────────────────────────────────────────────────────

const makeRoomData = (overrides = {}) => ({
  name: `Test Match ${uid()}`,
  matchFormat: 'T20',
  totalOvers: 20,
  teamAName: 'Team Alpha',
  teamBName: 'Team Beta',
  venue: 'Test Ground',
  matchDate: new Date(Date.now() + 86400000).toISOString(),
  maxPlayersPerTeam: 11,
  isPrivate: false,
  creatorRole: 'team_a_manager',
  ...overrides
});

const createRoom = async (token, overrides = {}) => {
  const res = await request(app)
    .post('/api/v1/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send(makeRoomData(overrides));
  return res;
};

// ─── Assertion helpers ────────────────────────────────────────────────────────

const expectSuccess = (res, statusCode = 200) => {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(true);
};

const expectError = (res, statusCode) => {
  expect(res.status).toBe(statusCode);
  expect(res.body.success).toBe(false);
};

// ─── DB cleanup ───────────────────────────────────────────────────────────────

const clearCollections = async (...modelNames) => {
  for (const name of modelNames) {
    await mongoose.model(name).deleteMany({});
  }
};

module.exports = {
  makeUserData, registerUser, loginUser,
  createAdminUser, setUserPlan,
  makeRoomData, createRoom,
  expectSuccess, expectError,
  clearCollections,
  app
};
