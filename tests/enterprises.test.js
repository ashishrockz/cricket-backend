/**
 * enterprises.test.js
 * Tests for enterprise (academy / club) management:
 *
 * GET  /enterprises              — public list
 * GET  /enterprises/:id          — public/optional-auth detail
 * POST /enterprises              — auth (requires enterprise plan)
 * GET  /enterprises/my/details   — auth
 * PUT  /enterprises/:id          — auth (owner)
 * POST /enterprises/:id/members  — auth (owner/admin)
 * DEL  /enterprises/:id/members/:uid — auth (owner/admin)
 * PUT  /enterprises/:id/members/:uid/role — auth (owner/admin)
 *
 * Admin:
 * GET  /admin/enterprises
 * GET  /admin/enterprises/:id
 * PUT  /admin/enterprises/:id/verify
 * PUT  /admin/enterprises/:id/suspend
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const {
  registerUser, createAdminUser, setUserPlan,
  expectSuccess, expectError, clearCollections, app
} = require('./helpers');

beforeEach(async () => {
  await clearCollections('Enterprise', 'User', 'Subscription', 'SubscriptionPlan');
});

// ─── Helper: create an enterprise user (enterprise plan) ─────────────────────

const makeEnterpriseUser = async () => {
  const result = await registerUser();
  await setUserPlan(result.user._id, 'enterprise');

  // Re-login to get token with updated plan info in DB
  // Use the stored token (it's still valid for the same user)
  return result;
};

const createEnterprise = async (token, overrides = {}) => {
  return request(app)
    .post('/api/v1/enterprises')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Test Academy ${Date.now()}`,
      description: 'A test cricket academy',
      type: 'cricket_academy',
      contact: { email: 'academy@test.com', phone: '9876543210' },
      ...overrides
    });
};

// ─── Public: GET /enterprises ─────────────────────────────────────────────────

describe('GET /api/v1/enterprises (public list)', () => {
  it('✅ returns list of public enterprises', async () => {
    const res = await request(app).get('/api/v1/enterprises');
    expectSuccess(res);
    expect(Array.isArray(res.body.data.enterprises)).toBe(true);
  });

  it('✅ no auth required', async () => {
    const res = await request(app).get('/api/v1/enterprises');
    expect(res.status).toBe(200);
  });
});

// ─── Create Enterprise ────────────────────────────────────────────────────────

describe('POST /api/v1/enterprises', () => {
  it('✅ enterprise-plan user can create an enterprise', async () => {
    const { token } = await makeEnterpriseUser();
    const res = await createEnterprise(token);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enterprise).toHaveProperty('name');
    expect(res.body.data.enterprise).toHaveProperty('slug');
  });

  it('✅ creator is automatically added as owner member', async () => {
    const { token } = await makeEnterpriseUser();
    const res = await createEnterprise(token);
    expect(res.status).toBe(201);
    const enterprise = res.body.data.enterprise;
    const ownerMember = enterprise.members.find(m => m.role === 'owner');
    expect(ownerMember).toBeDefined();
  });

  it('✅ different types can be created (club)', async () => {
    const { token } = await makeEnterpriseUser();
    const res = await createEnterprise(token, { type: 'club' });
    expect(res.status).toBe(201);
    expect(res.body.data.enterprise.type).toBe('club');
  });

  it('❌ free user cannot create an enterprise', async () => {
    const { token } = await registerUser();
    const res = await createEnterprise(token);
    expectError(res, 403);
    expect(res.body.message).toMatch(/enterprise plan/i);
  });

  it('❌ basic user cannot create an enterprise', async () => {
    const { token, user } = await registerUser();
    await setUserPlan(user._id, 'basic');
    const res = await createEnterprise(token);
    expectError(res, 403);
  });

  it('❌ pro user cannot create an enterprise', async () => {
    const { token, user } = await registerUser();
    await setUserPlan(user._id, 'pro');
    const res = await createEnterprise(token);
    expectError(res, 403);
  });

  it('❌ cannot create two enterprises (one per owner)', async () => {
    const { token } = await makeEnterpriseUser();
    await createEnterprise(token);
    const res = await createEnterprise(token, { name: 'Second Academy' });
    expectError(res, 409);
  });

  it('❌ rejects missing name', async () => {
    const { token } = await makeEnterpriseUser();
    const res = await request(app)
      .post('/api/v1/enterprises')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'No name enterprise' });
    expectError(res, 400);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app)
      .post('/api/v1/enterprises')
      .send({ name: 'Test Academy', type: 'cricket_academy' });
    expectError(res, 401);
  });
});

// ─── Get My Enterprise ────────────────────────────────────────────────────────

describe('GET /api/v1/enterprises/my/details', () => {
  it('✅ owner can retrieve their enterprise details', async () => {
    const { token } = await makeEnterpriseUser();
    await createEnterprise(token);

    const res = await request(app)
      .get('/api/v1/enterprises/my/details')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.enterprise).toHaveProperty('owner');
  });

  it('❌ returns 404 if user has no enterprise', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/enterprises/my/details')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app).get('/api/v1/enterprises/my/details');
    expectError(res, 401);
  });
});

// ─── Update Enterprise ────────────────────────────────────────────────────────

describe('PUT /api/v1/enterprises/:id', () => {
  it('✅ owner can update enterprise name and description', async () => {
    const { token } = await makeEnterpriseUser();
    const created = await createEnterprise(token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .put(`/api/v1/enterprises/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Academy Name', description: 'Updated desc' });
    expectSuccess(res);
    expect(res.body.data.enterprise.name).toBe('Updated Academy Name');
  });

  it('❌ non-owner cannot update enterprise', async () => {
    const owner = await makeEnterpriseUser();
    const stranger = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .put(`/api/v1/enterprises/${id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ name: 'Hacked Name' });
    expectError(res, 403);
  });

  it('❌ rejects for non-existent enterprise', async () => {
    const { token } = await makeEnterpriseUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/v1/enterprises/${fakeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test' });
    expectError(res, 404);
  });
});

// ─── Add Member ───────────────────────────────────────────────────────────────

describe('POST /api/v1/enterprises/:id/members', () => {
  it('✅ owner can add a member to the enterprise', async () => {
    const owner = await makeEnterpriseUser();
    const newMember = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: newMember.user._id, role: 'player' });
    expectSuccess(res);
  });

  it('✅ owner can add a coach', async () => {
    const owner = await makeEnterpriseUser();
    const coach = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: coach.user._id, role: 'coach' });
    expectSuccess(res);
  });

  it('❌ non-member cannot add members', async () => {
    const owner = await makeEnterpriseUser();
    const stranger = await registerUser();
    const another = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ userId: another.user._id, role: 'player' });
    expectError(res, 403);
  });

  it('❌ cannot add non-existent user', async () => {
    const owner = await makeEnterpriseUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;
    const fakeUserId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: fakeUserId, role: 'player' });
    expectError(res, 404);
  });

  it('❌ rejects invalid role', async () => {
    const owner = await makeEnterpriseUser();
    const newMember = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: newMember.user._id, role: 'invalid_role' });
    expectError(res, 400);
  });
});

// ─── Remove Member ────────────────────────────────────────────────────────────

describe('DELETE /api/v1/enterprises/:id/members/:userId', () => {
  it('✅ owner can remove a member', async () => {
    const owner = await makeEnterpriseUser();
    const member = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    // Add member first
    await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: member.user._id, role: 'player' });

    const res = await request(app)
      .delete(`/api/v1/enterprises/${id}/members/${member.user._id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expectSuccess(res);
  });

  it('❌ non-owner cannot remove members', async () => {
    const owner = await makeEnterpriseUser();
    const member = await registerUser();
    const stranger = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: member.user._id, role: 'player' });

    const res = await request(app)
      .delete(`/api/v1/enterprises/${id}/members/${member.user._id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expectError(res, 403);
  });
});

// ─── Update Member Role ───────────────────────────────────────────────────────

describe('PUT /api/v1/enterprises/:id/members/:userId/role', () => {
  it('✅ owner can change a member role', async () => {
    const owner = await makeEnterpriseUser();
    const member = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: member.user._id, role: 'player' });

    const res = await request(app)
      .put(`/api/v1/enterprises/${id}/members/${member.user._id}/role`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ role: 'coach' });
    expectSuccess(res);
  });

  it('❌ non-owner cannot change roles', async () => {
    const owner = await makeEnterpriseUser();
    const member = await registerUser();
    const stranger = await registerUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    await request(app)
      .post(`/api/v1/enterprises/${id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: member.user._id, role: 'player' });

    const res = await request(app)
      .put(`/api/v1/enterprises/${id}/members/${member.user._id}/role`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ role: 'admin' });
    expectError(res, 403);
  });
});

// ─── Admin: Enterprise Management ────────────────────────────────────────────

describe('Admin Enterprise Management', () => {
  it('✅ admin can list all enterprises', async () => {
    const admin = await createAdminUser();
    const res = await request(app)
      .get('/api/v1/admin/enterprises')
      .set('Authorization', `Bearer ${admin.token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data.enterprises)).toBe(true);
  });

  it('❌ regular user cannot access admin enterprise list', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/admin/enterprises')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 403);
  });

  it('✅ admin can verify an enterprise', async () => {
    const admin = await createAdminUser();
    const owner = await makeEnterpriseUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .put(`/api/v1/admin/enterprises/${id}/verify`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isVerified: true });
    expectSuccess(res);
  });

  it('✅ admin can suspend an enterprise', async () => {
    const admin = await createAdminUser();
    const owner = await makeEnterpriseUser();
    const created = await createEnterprise(owner.token);
    const id = created.body.data.enterprise._id;

    const res = await request(app)
      .put(`/api/v1/admin/enterprises/${id}/suspend`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isSuspended: true, suspensionReason: 'Policy violation' });
    expectSuccess(res);
  });

  it('❌ admin verify fails for non-existent enterprise', async () => {
    const admin = await createAdminUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/v1/admin/enterprises/${fakeId}/verify`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ isVerified: true });
    expectError(res, 404);
  });
});
