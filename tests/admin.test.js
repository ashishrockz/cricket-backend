/**
 * admin.test.js
 * Tests for the admin panel endpoints:
 *
 * GET  /admin/dashboard
 * GET  /admin/system
 * GET  /admin/users
 * GET  /admin/users/:id
 * PUT  /admin/users/:id
 * DEL  /admin/users/:id
 * GET  /admin/matches
 * GET  /admin/rooms
 * POST /admin/matches/:id/abandon
 * GET  /admin/ads
 * POST /admin/ads
 * GET  /admin/ads/:id
 * PUT  /admin/ads/:id
 * PUT  /admin/ads/:id/review
 * DEL  /admin/ads/:id
 * GET  /admin/ads/analytics
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const {
  registerUser, createAdminUser, createRoom,
  expectSuccess, expectError, clearCollections, app
} = require('./helpers');

beforeEach(async () => {
  await clearCollections(
    'User', 'Room', 'Match', 'Ad',
    'Subscription', 'SubscriptionPlan', 'Enterprise'
  );
});

// ─── Shared ad data factory ───────────────────────────────────────────────────

const makeAdData = (overrides = {}) => ({
  title: `Test Ad ${Date.now()}`,
  description: 'A test advertisement',
  type: 'banner',
  placement: 'home_banner',
  media: {
    imageUrl: 'https://example.com/ad.png',
    altText: 'Test Ad Image'
  },
  ctaUrl: 'https://example.com/sponsor',
  targeting: {
    planTypes: ['free', 'basic']
  },
  ...overrides
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/dashboard', () => {
  it('✅ admin can access dashboard', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data).toHaveProperty('totalUsers');
    expect(res.body.data).toHaveProperty('totalRooms');
  });

  it('✅ dashboard counts are correct types', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(typeof res.body.data.totalUsers).toBe('number');
    expect(typeof res.body.data.totalRooms).toBe('number');
  });

  it('❌ regular user cannot access dashboard', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });

  it('❌ unauthenticated request rejected', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expectError(res, 401);
  });
});

// ─── System Stats ─────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/system', () => {
  it('✅ admin can access system stats', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/system')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data).toBeDefined();
  });

  it('❌ regular user cannot access system stats', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/system')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

// ─── User Management ─────────────────────────────────────────────────────────

describe('GET /api/v1/admin/users', () => {
  it('✅ admin can list all users', async () => {
    const admin = await createAdminUser();
    await registerUser();
    await registerUser();

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(2);
  });

  it('✅ supports search by username', async () => {
    const admin = await createAdminUser();
    await registerUser({ username: 'searchableuser99', email: 'searchable99@test.com' });

    const res = await request(app)
      .get('/api/v1/admin/users?search=searchableuser99')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(res.body.data.users.some(u => u.username === 'searchableuser99')).toBe(true);
  });

  it('✅ supports pagination', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/users?page=1&limit=2')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(res.body.data.users.length).toBeLessThanOrEqual(2);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('❌ regular user cannot list users', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('✅ admin can get user details by ID', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .get(`/api/v1/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(res.body.data.user._id).toBe(user._id.toString());
  });

  it('❌ returns 404 for non-existent user', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/admin/users/${fakeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 404);
  });
});

describe('PUT /api/v1/admin/users/:id (update user)', () => {
  it('✅ admin can update a user role', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .put(`/api/v1/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'admin' });
    expectSuccess(res);
  });

  it('✅ admin can ban a user', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .put(`/api/v1/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isBanned: true });
    expectSuccess(res);
  });

  it('❌ regular user cannot update other users', async () => {
    const { token } = await registerUser();
    const { user: target } = await registerUser();

    const res = await request(app)
      .put(`/api/v1/admin/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expectError(res, 403);
  });

  it('❌ cannot set invalid role', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .put(`/api/v1/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'god_mode' });
    expectError(res, 400);
  });
});

describe('DELETE /api/v1/admin/users/:id', () => {
  it('✅ admin can delete a user', async () => {
    const admin = await createAdminUser();
    const { user } = await registerUser();

    const res = await request(app)
      .delete(`/api/v1/admin/users/${user._id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
  });

  it('❌ cannot delete non-existent user', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/v1/admin/users/${fakeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 404);
  });

  it('❌ regular user cannot delete users', async () => {
    const { token } = await registerUser();
    const { user: target } = await registerUser();
    const res = await request(app)
      .delete(`/api/v1/admin/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

// ─── Room / Match Management ──────────────────────────────────────────────────

describe('GET /api/v1/admin/rooms', () => {
  it('✅ admin can list all rooms', async () => {
    const admin = await createAdminUser();
    const user1 = await registerUser();
    await createRoom(user1.token);

    const res = await request(app)
      .get('/api/v1/admin/rooms')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.rooms)).toBe(true);
  });

  it('❌ regular user cannot list all rooms', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/rooms')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

describe('GET /api/v1/admin/matches', () => {
  it('✅ admin can list all matches', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/matches')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.matches)).toBe(true);
  });

  it('✅ supports filtering by status', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/matches?status=not_started')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
  });
});

// ─── Ad Management ────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/ads (create ad)', () => {
  it('✅ admin can create a banner ad', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${token}`)
      .send(makeAdData());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ad.title).toBeDefined();
  });

  it('✅ admin can create different ad types', async () => {
    const { token } = await createAdminUser();
    const types = ['banner', 'interstitial', 'native'];
    for (const type of types) {
      const res = await request(app)
        .post('/api/v1/admin/ads')
        .set('Authorization', `Bearer ${token}`)
        .send(makeAdData({ type }));
      expect(res.status).toBe(201);
    }
  });

  it('❌ rejects missing title', async () => {
    const { token } = await createAdminUser();
    const data = makeAdData();
    delete data.title;
    const res = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${token}`)
      .send(data);
    expectError(res, 400);
  });

  it('❌ rejects invalid ad type', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${token}`)
      .send(makeAdData({ type: 'invalid_type' }));
    expectError(res, 400);
  });

  it('❌ regular user cannot create ads', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${token}`)
      .send(makeAdData());
    expectError(res, 403);
  });
});

describe('GET /api/v1/admin/ads (list ads)', () => {
  it('✅ admin can list all ads', async () => {
    const admin = await createAdminUser();
    await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());

    const res = await request(app)
      .get('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.ads)).toBe(true);
  });

  it('❌ regular user cannot list ads', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

describe('GET /api/v1/admin/ads/:id', () => {
  it('✅ admin can get a specific ad', async () => {
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());
    const adId = created.body.data.ad._id;

    const res = await request(app)
      .get(`/api/v1/admin/ads/${adId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(res.body.data.ad._id).toBe(adId);
  });

  it('❌ returns 404 for non-existent ad', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/admin/ads/${fakeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 404);
  });
});

describe('PUT /api/v1/admin/ads/:id (update ad)', () => {
  it('✅ admin can update ad details', async () => {
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());
    const adId = created.body.data.ad._id;

    const res = await request(app)
      .put(`/api/v1/admin/ads/${adId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Updated Ad Title' });
    expectSuccess(res);
    expect(res.body.data.ad.title).toBe('Updated Ad Title');
  });
});

describe('PUT /api/v1/admin/ads/:id/review (review ad)', () => {
  it('✅ admin can approve an ad', async () => {
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());
    const adId = created.body.data.ad._id;

    const res = await request(app)
      .put(`/api/v1/admin/ads/${adId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'active' });
    expectSuccess(res);
  });

  it('✅ admin can reject an ad with reason', async () => {
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());
    const adId = created.body.data.ad._id;

    const res = await request(app)
      .put(`/api/v1/admin/ads/${adId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'rejected', rejectionReason: 'Content violates guidelines' });
    expectSuccess(res);
  });

  it('❌ rejects invalid review status', async () => {
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());
    const adId = created.body.data.ad._id;

    const res = await request(app)
      .put(`/api/v1/admin/ads/${adId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'super_approved' });
    expectError(res, 400);
  });
});

describe('DELETE /api/v1/admin/ads/:id', () => {
  it('✅ admin can delete an ad', async () => {
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData());
    const adId = created.body.data.ad._id;

    const res = await request(app)
      .delete(`/api/v1/admin/ads/${adId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
  });

  it('❌ returns 404 when deleting non-existent ad', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/v1/admin/ads/${fakeId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expectError(res, 404);
  });
});

describe('GET /api/v1/admin/ads/analytics', () => {
  it('✅ admin can access ad analytics', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/ads/analytics')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data).toBeDefined();
  });

  it('❌ regular user cannot access ad analytics', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/ads/analytics')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });
});

// ─── Ad Delivery (public + user-facing) ──────────────────────────────────────

describe('GET /api/v1/ads/placement/:placement (ad delivery)', () => {
  it('✅ guest user receives ads for home_banner', async () => {
    // First create and activate an ad
    const admin = await createAdminUser();
    const created = await request(app)
      .post('/api/v1/admin/ads')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(makeAdData({ placement: 'home_banner' }));
    const adId = created.body.data.ad._id;
    await request(app)
      .put(`/api/v1/admin/ads/${adId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'active' });

    const res = await request(app).get('/api/v1/ads/placement/home_banner');
    expectSuccess(res);
    expect(Array.isArray(res.body.data.ads)).toBe(true);
  });

  it('✅ free user gets ads', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/ads/placement/home_banner')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    // free users are eligible for ads
    expect(res.body.data.ads).toBeDefined();
  });

  it('✅ pro user gets empty ads array', async () => {
    const { token, user } = await registerUser();
    const { setUserPlan } = require('./helpers');
    await setUserPlan(user._id, 'pro');

    const res = await request(app)
      .get('/api/v1/ads/placement/home_banner')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.ads).toHaveLength(0);
  });

  it('❌ rejects invalid placement name', async () => {
    const res = await request(app).get('/api/v1/ads/placement/invalid_placement_name');
    expectError(res, 400);
  });
});
