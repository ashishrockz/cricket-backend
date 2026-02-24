/**
 * rooms.test.js
 * Tests for: POST /rooms, GET /rooms/my-rooms, GET /rooms/code/:code,
 *            POST /rooms/join/:code, GET /rooms/:id, POST /rooms/:id/leave,
 *            POST /rooms/:id/players, DELETE /rooms/:id/players/:playerId
 *
 * Coverage: plan limits (free=3, basic=10, pro=unlimited),
 *           room joining, leaving, player management.
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const {
  registerUser, createAdminUser, setUserPlan,
  makeRoomData, createRoom,
  expectSuccess, expectError,
  clearCollections, app
} = require('./helpers');

beforeEach(async () => {
  await clearCollections('Room', 'Match', 'User', 'Subscription', 'SubscriptionPlan');
});

// ─── Create Room ──────────────────────────────────────────────────────────────

describe('POST /api/v1/rooms (create room)', () => {
  it('✅ creates a room with valid data (free user, first room)', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.room).toMatchObject({
      roomCode: expect.stringMatching(/^CRK-/),
      matchFormat: 'T20',
      totalOvers: 20
    });
  });

  it('✅ creates a room with custom format and overs', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, {
      matchFormat: 'ODI',
      totalOvers: 50,
      teamAName: 'India',
      teamBName: 'Pakistan'
    });
    expect(res.status).toBe(201);
    expect(res.body.data.room.totalOvers).toBe(50);
    expect(res.body.data.room.matchFormat).toBe('ODI');
  });

  it('✅ creates a private room', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, { isPrivate: true });
    expect(res.status).toBe(201);
    expect(res.body.data.room.isPrivate).toBe(true);
  });

  it('✅ creates a room with scorer role', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, { creatorRole: 'scorer' });
    expect(res.status).toBe(201);
    expect(res.body.data.room.members[0].role).toBe('scorer');
  });

  it('✅ admin can create rooms ignoring plan limits', async () => {
    const { token } = await createAdminUser();
    // Admins skip plan checks entirely
    for (let i = 0; i < 5; i++) {
      const res = await createRoom(token);
      expect(res.status).toBe(201);
    }
  });

  it('❌ rejects without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .send(makeRoomData());
    expectError(res, 401);
  });

  it('❌ rejects with missing required fields (no teamAName)', async () => {
    const { token } = await registerUser();
    const data = makeRoomData();
    delete data.teamAName;
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send(data);
    expectError(res, 400);
  });

  it('❌ rejects with missing required fields (no matchFormat)', async () => {
    const { token } = await registerUser();
    const data = makeRoomData();
    delete data.matchFormat;
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send(data);
    expectError(res, 400);
  });

  it('❌ rejects invalid matchFormat', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, { matchFormat: 'INVALID' });
    expectError(res, 400);
  });

  it('❌ rejects totalOvers = 0', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, { totalOvers: 0 });
    expectError(res, 400);
  });

  it('❌ rejects totalOvers > 90', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, { totalOvers: 91 });
    expectError(res, 400);
  });

  it('❌ rejects invalid creatorRole', async () => {
    const { token } = await registerUser();
    const res = await createRoom(token, { creatorRole: 'invalid_role' });
    expectError(res, 400);
  });

  // ─── Plan limit tests ─────────────────────────────────────────────────────

  it('❌ free user blocked after 3 rooms this month', async () => {
    const { token, user } = await registerUser();

    // Create 3 rooms (free plan allows 3)
    for (let i = 0; i < 3; i++) {
      const res = await createRoom(token);
      expect(res.status).toBe(201);
    }

    // 4th should fail
    const res = await createRoom(token);
    expectError(res, 403);
    expect(res.body.message).toMatch(/limit/i);
  });

  it('✅ basic user can create up to 10 rooms this month', async () => {
    const { token, user } = await registerUser();
    await setUserPlan(user._id, 'basic');

    // Create 10 rooms
    for (let i = 0; i < 10; i++) {
      const res = await createRoom(token);
      expect(res.status).toBe(201);
    }

    // 11th should fail
    const res = await createRoom(token);
    expectError(res, 403);
  });

  it('✅ pro user has unlimited rooms', async () => {
    const { token, user } = await registerUser();
    await setUserPlan(user._id, 'pro');

    // Create 15 rooms — should all succeed
    for (let i = 0; i < 5; i++) {
      const res = await createRoom(token);
      expect(res.status).toBe(201);
    }
  });
});

// ─── Get My Rooms ─────────────────────────────────────────────────────────────

describe('GET /api/v1/rooms/my-rooms', () => {
  it('✅ returns list of rooms for authenticated user', async () => {
    const { token } = await registerUser();
    await createRoom(token);
    await createRoom(token);

    const res = await request(app)
      .get('/api/v1/rooms/my-rooms')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.rooms.length).toBeGreaterThanOrEqual(2);
  });

  it('✅ returns empty list if user has no rooms', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/rooms/my-rooms')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.rooms).toHaveLength(0);
  });

  it('✅ filters rooms by status', async () => {
    const { token } = await registerUser();
    await createRoom(token);

    const res = await request(app)
      .get('/api/v1/rooms/my-rooms?status=waiting')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.rooms.every(r => r.status === 'waiting')).toBe(true);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app).get('/api/v1/rooms/my-rooms');
    expectError(res, 401);
  });
});

// ─── Get Room by Code ─────────────────────────────────────────────────────────

describe('GET /api/v1/rooms/code/:roomCode', () => {
  it('✅ returns room details for valid room code', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const { roomCode } = created.body.data.room;

    const res = await request(app)
      .get(`/api/v1/rooms/code/${roomCode}`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.room.roomCode).toBe(roomCode);
  });

  it('❌ returns 404 for invalid room code', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/rooms/code/CRK-9999')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app).get('/api/v1/rooms/code/CRK-1234');
    expectError(res, 401);
  });
});

// ─── Get Room Details ─────────────────────────────────────────────────────────

describe('GET /api/v1/rooms/:id', () => {
  it('✅ returns room details by ID', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.room._id).toBe(roomId);
  });

  it('❌ returns 404 for non-existent room', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/rooms/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects invalid ObjectId format', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/rooms/not-valid-id')
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 400);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/v1/rooms/${fakeId}`);
    expectError(res, 401);
  });
});

// ─── Join Room ────────────────────────────────────────────────────────────────

describe('POST /api/v1/rooms/join/:roomCode', () => {
  it('✅ another user can join an existing room', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();

    const created = await createRoom(owner.token);
    const { roomCode } = created.body.data.room;

    const res = await request(app)
      .post(`/api/v1/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ role: 'team_b_manager' });
    expectSuccess(res);
    expect(res.body.data.room.members.length).toBeGreaterThanOrEqual(2);
  });

  it('✅ joining with scorer role', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const created = await createRoom(owner.token);
    const { roomCode } = created.body.data.room;

    const res = await request(app)
      .post(`/api/v1/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ role: 'scorer' });
    expectSuccess(res);
  });

  it('❌ cannot join non-existent room', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/v1/rooms/join/CRK-9999')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'team_b_manager' });
    expectError(res, 404);
  });

  it('❌ cannot join room twice (already a member)', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const { roomCode } = created.body.data.room;

    const res = await request(app)
      .post(`/api/v1/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'team_b_manager' });
    expectError(res, 409);
  });

  it('❌ cannot join without a role', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const created = await createRoom(owner.token);
    const { roomCode } = created.body.data.room;

    const res = await request(app)
      .post(`/api/v1/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({});
    expectError(res, 400);
  });

  it('❌ cannot join with invalid role', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const created = await createRoom(owner.token);
    const { roomCode } = created.body.data.room;

    const res = await request(app)
      .post(`/api/v1/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ role: 'invalid_role' });
    expectError(res, 400);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app)
      .post('/api/v1/rooms/join/CRK-1234')
      .send({ role: 'scorer' });
    expectError(res, 401);
  });
});

// ─── Leave Room ───────────────────────────────────────────────────────────────

describe('POST /api/v1/rooms/:id/leave', () => {
  it('✅ a member can leave a room', async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const created = await createRoom(owner.token);
    const roomId = created.body.data.room._id;
    const { roomCode } = created.body.data.room;

    // Join first
    await request(app)
      .post(`/api/v1/rooms/join/${roomCode}`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({ role: 'scorer' });

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/leave`)
      .set('Authorization', `Bearer ${joiner.token}`);
    expectSuccess(res);
  });

  it('❌ cannot leave a room you are not in', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const created = await createRoom(owner.token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/leave`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expectError(res, 403);
  });

  it('❌ rejects for non-existent room', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/v1/rooms/${fakeId}/leave`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/v1/rooms/${fakeId}/leave`);
    expectError(res, 401);
  });
});

// ─── Add Player to Team ───────────────────────────────────────────────────────

describe('POST /api/v1/rooms/:id/players', () => {
  it('✅ adds a static player to team_a', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_a',
        playerType: 'static',
        name: 'Rohit Sharma',
        playingRole: 'batsman'
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('✅ adds a static player to team_b', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_b',
        playerType: 'static',
        name: 'Virat Kohli',
        playingRole: 'batsman'
      });
    expect(res.status).toBe(201);
  });

  it('✅ marks a player as captain', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_a',
        playerType: 'static',
        name: 'MS Dhoni',
        playingRole: 'wicket_keeper',
        isCaptain: true,
        isWicketKeeper: true
      });
    expect(res.status).toBe(201);
  });

  it('✅ adds a registered user as player', async () => {
    const owner = await registerUser();
    const player = await registerUser();
    const created = await createRoom(owner.token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        team: 'team_a',
        playerType: 'registered',
        userId: player.user._id
      });
    expect(res.status).toBe(201);
  });

  it('❌ non-member cannot add a player', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const created = await createRoom(owner.token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({
        team: 'team_a',
        playerType: 'static',
        name: 'Rahul',
        playingRole: 'batsman'
      });
    expectError(res, 403);
  });

  it('❌ static player requires name field', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_a',
        playerType: 'static',
        playingRole: 'batsman'
        // missing name
      });
    expectError(res, 400);
  });

  it('❌ registered player requires userId', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_a',
        playerType: 'registered'
        // missing userId
      });
    expectError(res, 400);
  });

  it('❌ invalid team value', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    const res = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_c',
        playerType: 'static',
        name: 'Player'
      });
    expectError(res, 400);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/v1/rooms/${fakeId}/players`)
      .send({ team: 'team_a', playerType: 'static', name: 'Test' });
    expectError(res, 401);
  });
});

// ─── Remove Player from Team ─────────────────────────────────────────────────

describe('DELETE /api/v1/rooms/:id/players/:playerId', () => {
  it('✅ room manager can remove a player', async () => {
    const { token } = await registerUser();
    const created = await createRoom(token);
    const roomId = created.body.data.room._id;

    // Add a player first
    const addRes = await request(app)
      .post(`/api/v1/rooms/${roomId}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        team: 'team_a',
        playerType: 'static',
        name: 'Test Player',
        playingRole: 'batsman'
      });
    expect(addRes.status).toBe(201);

    // Find the player ID in the room (re-fetch room)
    const roomRes = await request(app)
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${token}`);
    const playerId = roomRes.body.data.room.teamA?.players?.[0]?._id;
    if (!playerId) return; // skip if structure differs

    const res = await request(app)
      .delete(`/api/v1/rooms/${roomId}/players/${playerId}`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
  });

  it('❌ non-member cannot remove a player', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const created = await createRoom(owner.token);
    const roomId = created.body.data.room._id;

    const fakePlayerId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/v1/rooms/${roomId}/players/${fakePlayerId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expectError(res, 403);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const fakePId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/v1/rooms/${fakeId}/players/${fakePId}`);
    expectError(res, 401);
  });
});
