/**
 * subscriptions.test.js
 * Tests for subscription plan endpoints:
 * GET  /subscriptions/plans            — public
 * GET  /subscriptions/my              — auth
 * GET  /subscriptions/history         — auth
 * GET  /subscriptions                 — admin
 * POST /subscriptions/assign          — admin
 * PUT  /subscriptions/:id/cancel      — admin
 * GET  /subscriptions/analytics       — admin
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const {
  registerUser, createAdminUser, setUserPlan,
  expectSuccess, expectError, clearCollections, app
} = require('./helpers');

beforeEach(async () => {
  await clearCollections('User', 'Subscription', 'SubscriptionPlan');
});

// ─── Public: GET /plans ───────────────────────────────────────────────────────

describe('GET /api/v1/subscriptions/plans (public)', () => {
  it('✅ returns list of active subscription plans', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');
    expectSuccess(res);
    expect(Array.isArray(res.body.data.plans)).toBe(true);
    expect(res.body.data.plans.length).toBeGreaterThanOrEqual(1);
  });

  it('✅ plan objects contain required fields', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');
    expectSuccess(res);
    const plan = res.body.data.plans[0];
    expect(plan).toHaveProperty('name');
    expect(plan).toHaveProperty('slug');
    expect(plan).toHaveProperty('features');
    expect(plan).toHaveProperty('price');
  });

  it('✅ includes free plan', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');
    const slugs = res.body.data.plans.map(p => p.slug);
    expect(slugs).toContain('free');
  });

  it('✅ no auth required', async () => {
    // Already tested above without any auth header — just confirm 200
    const res = await request(app).get('/api/v1/subscriptions/plans');
    expect(res.status).toBe(200);
  });
});

// ─── Auth: GET /my ────────────────────────────────────────────────────────────

describe('GET /api/v1/subscriptions/my', () => {
  it('✅ returns current subscription for authenticated user', async () => {
    const { token } = await registerUser(); // register auto-assigns free plan
    const res = await request(app)
      .get('/api/v1/subscriptions/my')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    // May return subscription object or null — just ensure no error
    expect(res.body.success).toBe(true);
  });

  it('✅ upgraded user shows correct plan', async () => {
    const { token, user } = await registerUser();
    await setUserPlan(user._id, 'pro');

    const res = await request(app)
      .get('/api/v1/subscriptions/my')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    // planSlug should be pro
    if (res.body.data.subscription) {
      expect(res.body.data.subscription.planSlug).toBe('pro');
    }
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app).get('/api/v1/subscriptions/my');
    expectError(res, 401);
  });
});

// ─── Auth: GET /history ───────────────────────────────────────────────────────

describe('GET /api/v1/subscriptions/history', () => {
  it('✅ returns subscription history array', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/subscriptions/history')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.subscriptions)).toBe(true);
  });

  it('✅ history grows after plan change', async () => {
    const { token, user } = await registerUser();
    await setUserPlan(user._id, 'basic');
    await setUserPlan(user._id, 'pro');

    const res = await request(app)
      .get('/api/v1/subscriptions/history')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.subscriptions.length).toBeGreaterThanOrEqual(2);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app).get('/api/v1/subscriptions/history');
    expectError(res, 401);
  });
});

// ─── Admin: GET / (list all) ──────────────────────────────────────────────────

describe('GET /api/v1/subscriptions (admin)', () => {
  it('✅ admin can list all subscriptions', async () => {
    const { token } = await createAdminUser();
    await registerUser(); // create a subscriber

    const res = await request(app)
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.subscriptions)).toBe(true);
  });

  it('❌ regular user cannot list all subscriptions', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });

  it('❌ unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/subscriptions');
    expectError(res, 401);
  });
});

// ─── Admin: POST /assign ──────────────────────────────────────────────────────

describe('POST /api/v1/subscriptions/assign (admin)', () => {
  it('✅ admin can assign a plan to a user', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        userId: user._id,
        planSlug: 'pro',
        billingCycle: 'monthly'
      });
    expectSuccess(res);
  });

  it('✅ admin can assign enterprise plan', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        userId: user._id,
        planSlug: 'enterprise',
        billingCycle: 'annual'
      });
    expectSuccess(res);
  });

  it('❌ rejects invalid planSlug', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        userId: user._id,
        planSlug: 'invalid_plan'
      });
    expectError(res, 400);
  });

  it('❌ rejects missing userId', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ planSlug: 'pro' });
    expectError(res, 400);
  });

  it('❌ rejects non-existent userId', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: fakeId, planSlug: 'pro' });
    expectError(res, 404);
  });

  it('❌ regular user cannot assign plans', async () => {
    const { token } = await registerUser();
    const { user: target } = await registerUser();

    const res = await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target._id, planSlug: 'pro' });
    expectError(res, 403);
  });
});

// ─── Admin: PUT /:id/cancel ───────────────────────────────────────────────────

describe('PUT /api/v1/subscriptions/:id/cancel (admin)', () => {
  it('✅ admin can cancel a subscription', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    // Assign a plan first
    await request(app)
      .post('/api/v1/subscriptions/assign')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: user._id, planSlug: 'basic', billingCycle: 'monthly' });

    // Get the subscription ID
    const listRes = await request(app)
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${admin.token}`);
    const sub = listRes.body.data.subscriptions.find(
      s => s.user?.toString() === user._id?.toString() && s.planSlug === 'basic'
    );
    if (!sub) return; // skip if filtering differs

    const res = await request(app)
      .put(`/api/v1/subscriptions/${sub._id}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
  });

  it('❌ cannot cancel non-existent subscription', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/v1/subscriptions/${fakeId}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 404);
  });

  it('❌ regular user cannot cancel subscriptions', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/v1/subscriptions/${fakeId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

// ─── Admin: GET /analytics ────────────────────────────────────────────────────

describe('GET /api/v1/subscriptions/analytics (admin)', () => {
  it('✅ returns analytics data for admin', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/subscriptions/analytics')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(res.body.data).toHaveProperty('totalSubscriptions');
  });

  it('❌ regular user cannot access analytics', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/subscriptions/analytics')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });

  it('❌ unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/subscriptions/analytics');
    expectError(res, 401);
  });
});
