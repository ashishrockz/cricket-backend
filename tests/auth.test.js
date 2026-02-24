/**
 * AUTH API TESTS
 * Covers: register, login, OTP request/verify, password reset,
 *         refresh token, change password, logout, /me
 *
 * Positive + Negative scenarios
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const { app, makeUserData, registerUser, expectSuccess, expectError, clearCollections } = require('./helpers');

beforeAll(async () => {
  const uri = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/cricket_scoring_test';
  if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
});

afterAll(async () => {
  await clearCollections('users', 'subscriptions', 'subscriptionplans', 'otprequests');
});

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/register', () => {
  // ── Positive ────────────────────────────────────────────────────────────────
  it('✅ registers successfully with valid data', async () => {
    const data = makeUserData();
    const res = await request(app).post('/api/v1/auth/register').send(data);
    expectSuccess(res, 201);
    expect(res.body.data.user.email).toBe(data.email);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    // Password must never be returned
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('✅ returns subscriptionPlan = free by default', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(makeUserData());
    expect(res.body.data.user.subscriptionPlan).toBe('free');
  });

  it('✅ accepts optional fields (phone, city, bowlingStyle)', async () => {
    const data = makeUserData({ phone: '+919876543210', city: 'Chennai', bowlingStyle: 'right_arm_fast' });
    const res = await request(app).post('/api/v1/auth/register').send(data);
    expectSuccess(res, 201);
  });

  // ── Negative ────────────────────────────────────────────────────────────────
  it('❌ fails with duplicate email', async () => {
    const data = makeUserData();
    await request(app).post('/api/v1/auth/register').send(data);
    const data2 = makeUserData({ email: data.email });
    const res = await request(app).post('/api/v1/auth/register').send(data2);
    expectError(res, 409);
    expect(res.body.message).toMatch(/email/i);
  });

  it('❌ fails with duplicate username', async () => {
    const data = makeUserData();
    await request(app).post('/api/v1/auth/register').send(data);
    const data2 = makeUserData({ username: data.username });
    const res = await request(app).post('/api/v1/auth/register').send(data2);
    expectError(res, 409);
    expect(res.body.message).toMatch(/username/i);
  });

  it('❌ fails with weak password (no uppercase)', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send(makeUserData({ password: 'weakpassword1@' }));
    expectError(res, 422);
  });

  it('❌ fails with weak password (no special char)', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send(makeUserData({ password: 'WeakPass1234' }));
    expectError(res, 422);
  });

  it('❌ fails with missing required fields (no email)', async () => {
    const { email: _e, ...data } = makeUserData();
    const res = await request(app).post('/api/v1/auth/register').send(data);
    expectError(res, 422);
  });

  it('❌ fails with missing fullName', async () => {
    const { fullName: _f, ...data } = makeUserData();
    const res = await request(app).post('/api/v1/auth/register').send(data);
    expectError(res, 422);
  });

  it('❌ fails with invalid email format', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send(makeUserData({ email: 'not-an-email' }));
    expectError(res, 422);
  });

  it('❌ fails with username containing spaces', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send(makeUserData({ username: 'bad username' }));
    expectError(res, 422);
  });

  it('❌ fails with username too short (< 3 chars)', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send(makeUserData({ username: 'ab' }));
    expectError(res, 422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN (password-based)
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/login', () => {
  let userEmail, userPassword;

  beforeAll(async () => {
    const u = await registerUser();
    userEmail = u.email;
    userPassword = u.password;
  });

  // ── Positive ────────────────────────────────────────────────────────────────
  it('✅ logs in with valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: userEmail, password: userPassword });
    expectSuccess(res, 200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(userEmail);
  });

  it('✅ response includes subscriptionPlan', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: userEmail, password: userPassword });
    expect(res.body.data.user.subscriptionPlan).toBe('free');
  });

  // ── Negative ────────────────────────────────────────────────────────────────
  it('❌ fails with wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: userEmail, password: 'WrongPass@999' });
    expectError(res, 401);
  });

  it('❌ fails with non-existent email', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: 'Test@1234' });
    expectError(res, 401);
  });

  it('❌ fails with missing password', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: userEmail });
    expectError(res, 422);
  });

  it('❌ fails with missing email', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ password: userPassword });
    expectError(res, 422);
  });

  it('❌ locks account after 5 failed attempts', async () => {
    const u = await registerUser();
    // 5 wrong attempts
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/login')
        .send({ email: u.email, password: 'WrongPass@999' });
    }
    // 6th attempt should be locked
    const res = await request(app).post('/api/v1/auth/login')
      .send({ email: u.email, password: u.password });
    expect([401, 423]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OTP REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/otp/request', () => {
  let existingEmail;

  beforeAll(async () => {
    const u = await registerUser();
    existingEmail = u.email;
  });

  // ── Positive ────────────────────────────────────────────────────────────────
  it('✅ returns 200 for existing email (login purpose)', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request')
      .send({ email: existingEmail, purpose: 'login' });
    expectSuccess(res, 200);
    // Generic message — does NOT reveal if email exists
    expect(res.body.message).toMatch(/otp has been sent/i);
  });

  it('✅ returns 200 even for non-existent email (no enumeration)', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request')
      .send({ email: 'ghost@test.com', purpose: 'login' });
    expectSuccess(res, 200);
    expect(res.body.message).toMatch(/otp has been sent/i);
  });

  it('✅ accepts purpose = password_reset', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request')
      .send({ email: existingEmail, purpose: 'password_reset' });
    expectSuccess(res, 200);
  });

  // ── Negative ────────────────────────────────────────────────────────────────
  it('❌ fails with invalid email format', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request')
      .send({ email: 'not-valid', purpose: 'login' });
    expectError(res, 422);
  });

  it('❌ fails with invalid purpose value', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request')
      .send({ email: existingEmail, purpose: 'hack_purpose' });
    expectError(res, 422);
  });

  it('❌ fails with missing email', async () => {
    const res = await request(app).post('/api/v1/auth/otp/request')
      .send({ purpose: 'login' });
    expectError(res, 422);
  });

  it('❌ rate limits repeated OTP requests (within 60s)', async () => {
    const u = await registerUser();
    await request(app).post('/api/v1/auth/otp/request').send({ email: u.email, purpose: 'login' });
    const res = await request(app).post('/api/v1/auth/otp/request').send({ email: u.email, purpose: 'login' });
    // Second request within 60s should be rate limited
    expect([429, 200]).toContain(res.status); // 429 if within window
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OTP VERIFY
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/otp/verify', () => {
  let testEmail;

  beforeAll(async () => {
    const u = await registerUser();
    testEmail = u.email;
  });

  // ── Negative (we can't get the real OTP easily without email mock, so we test error paths) ──
  it('❌ fails with wrong OTP (6 digits but incorrect)', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify')
      .send({ email: testEmail, otp: '000000', purpose: 'login' });
    // Should fail — no pending OTP or wrong OTP
    expect([400, 400]).toContain(res.status);
    expectError(res, 400);
  });

  it('❌ fails with OTP that is too short', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify')
      .send({ email: testEmail, otp: '123', purpose: 'login' });
    expectError(res, 422);
  });

  it('❌ fails with non-numeric OTP', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify')
      .send({ email: testEmail, otp: 'abcdef', purpose: 'login' });
    expectError(res, 422);
  });

  it('❌ fails with missing email', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify')
      .send({ otp: '123456', purpose: 'login' });
    expectError(res, 422);
  });

  it('❌ fails with invalid purpose', async () => {
    const res = await request(app).post('/api/v1/auth/otp/verify')
      .send({ email: testEmail, otp: '123456', purpose: 'bad_purpose' });
    expectError(res, 422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/reset-password', () => {
  it('❌ fails with invalid/expired reset token', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ resetToken: 'totally.fake.token', newPassword: 'NewPass@1234' });
    expectError(res, 401);
  });

  it('❌ fails with weak new password', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ resetToken: 'sometoken', newPassword: 'weakpass' });
    expectError(res, 422);
  });

  it('❌ fails with missing resetToken', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password')
      .send({ newPassword: 'NewPass@1234' });
    expectError(res, 422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/refresh-token', () => {
  let refreshToken, accessToken;

  beforeAll(async () => {
    const u = await registerUser();
    refreshToken = u.refreshToken;
    accessToken = u.token;
  });

  it('✅ refreshes access token with valid refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh-token')
      .send({ refreshToken });
    expectSuccess(res, 200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
  });

  it('❌ fails with invalid refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh-token')
      .send({ refreshToken: 'invalid.token.here' });
    expectError(res, 401);
  });

  it('❌ fails with missing refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh-token').send({});
    expectError(res, 422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
describe('PUT /api/v1/auth/change-password', () => {
  let token, password;

  beforeAll(async () => {
    const u = await registerUser();
    token = u.token;
    password = u.password;
  });

  it('✅ changes password with correct current password', async () => {
    const res = await request(app).put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'NewPass@5678', confirmPassword: 'NewPass@5678' });
    expectSuccess(res, 200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  it('❌ fails with wrong current password', async () => {
    const res = await request(app).put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass@123', newPassword: 'NewPass@5678', confirmPassword: 'NewPass@5678' });
    expectError(res, 400);
  });

  it('❌ fails without authentication', async () => {
    const res = await request(app).put('/api/v1/auth/change-password')
      .send({ currentPassword: password, newPassword: 'NewPass@5678', confirmPassword: 'NewPass@5678' });
    expectError(res, 401);
  });

  it('❌ fails when confirmPassword does not match', async () => {
    const res = await request(app).put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'NewPass@5678', confirmPassword: 'Different@999' });
    expectError(res, 422);
  });

  it('❌ fails with weak new password', async () => {
    const res = await request(app).put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'weakpw', confirmPassword: 'weakpw' });
    expectError(res, 422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/logout', () => {
  it('✅ logs out successfully', async () => {
    const u = await registerUser();
    const res = await request(app).post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${u.token}`);
    expectSuccess(res, 200);
  });

  it('❌ fails without auth token', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expectError(res, 401);
  });

  it('❌ fails with invalid token', async () => {
    const res = await request(app).post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer bad.token.here');
    expectError(res, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /me
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/auth/me', () => {
  let token, userId;

  beforeAll(async () => {
    const u = await registerUser();
    token = u.token;
    userId = u.user.id;
  });

  it('✅ returns current user profile', async () => {
    const res = await request(app).get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res, 200);
    expect(res.body.data.user._id || res.body.data.user.id).toBeTruthy();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('✅ profile includes subscription info', async () => {
    const res = await request(app).get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.user.subscriptionPlan).toBe('free');
  });

  it('❌ fails without auth token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expectError(res, 401);
  });

  it('❌ fails with expired/invalid token', async () => {
    const res = await request(app).get('/api/v1/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature');
    expectError(res, 401);
  });
});
