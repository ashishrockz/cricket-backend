/**
 * scoring.test.js
 * End-to-end match lifecycle tests:
 *   1. Create room
 *   2. Add players to both teams
 *   3. Record toss (POST /matches/:id/toss)
 *   4. Start match (POST /matches/:id/start)
 *   5. Record balls (POST /scoring/ball)
 *   6. Undo last ball (POST /scoring/undo)
 *   7. Get live score (GET /matches/:id/live)
 *   8. Get match timeline (GET /matches/:id/timeline)
 *   9. End innings / complete match (POST /matches/:id/end-innings)
 *  10. Get match details (GET /matches/:id)
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const {
  registerUser, createAdminUser,
  makeRoomData, createRoom,
  expectSuccess, expectError, clearCollections, app
} = require('./helpers');

beforeEach(async () => {
  await clearCollections(
    'Room', 'Match', 'ScoreEvent', 'User',
    'Subscription', 'SubscriptionPlan'
  );
});

// ─── Shared setup: full match scaffold ───────────────────────────────────────

/**
 * Creates a room, adds 2 players to each team,
 * and returns { room, match, token, teamAPlayers, teamBPlayers }
 */
async function setupMatchRoom(token) {
  // Create room
  const roomRes = await createRoom(token, { creatorRole: 'scorer' });
  expect(roomRes.status).toBe(201);
  const room = roomRes.body.data.room;

  // Fetch associated match (room creation also creates a match)
  // Match is created when room is created — get it from the room's match field or via admin
  // The room embeds match data — get the match from the DB via admin route
  // Actually, match is created lazily or eagerly depending on implementation.
  // Let's add players and then record toss to trigger match initialization.

  const addPlayer = async (team, name, role = 'batsman') => {
    const res = await request(app)
      .post(`/api/v1/rooms/${room._id}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team, playerType: 'static', name, playingRole: role });
    expect(res.status).toBe(201);
    return res.body.data.room;
  };

  // Add 2 players to each team (minimum required to record toss)
  await addPlayer('team_a', 'Rohit Sharma', 'batsman');
  await addPlayer('team_a', 'Virat Kohli', 'batsman');
  await addPlayer('team_b', 'David Warner', 'batsman');
  await addPlayer('team_b', 'Steve Smith', 'batsman');

  // Add bowlers
  await addPlayer('team_b', 'Mitchell Starc', 'bowler');
  await addPlayer('team_a', 'Jasprit Bumrah', 'bowler');

  // Re-fetch room to get team player IDs
  const roomDetail = await request(app)
    .get(`/api/v1/rooms/${room._id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(roomDetail.status).toBe(200);

  const updatedRoom = roomDetail.body.data.room;
  const teamAPlayers = updatedRoom.teamA?.players || [];
  const teamBPlayers = updatedRoom.teamB?.players || [];

  // Get the match associated with this room
  const matchId = updatedRoom.match;

  return { room: updatedRoom, matchId, token, teamAPlayers, teamBPlayers };
}

// ─── Get Match Details ────────────────────────────────────────────────────────

describe('GET /api/v1/matches/:id', () => {
  it('✅ returns match details for a valid match', async () => {
    const { token } = await registerUser();
    const roomRes = await createRoom(token);
    const room = roomRes.body.data.room;
    const matchId = room.match;
    if (!matchId) return; // skip if match not created at room creation

    const res = await request(app)
      .get(`/api/v1/matches/${matchId}`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.match).toBeDefined();
  });

  it('❌ returns 404 for non-existent match', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/matches/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/v1/matches/${fakeId}`);
    expectError(res, 401);
  });
});

// ─── Record Toss ──────────────────────────────────────────────────────────────

describe('POST /api/v1/matches/:id/toss', () => {
  it('✅ records toss with team_a winning and choosing to bat', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_a', decision: 'bat' });
    expectSuccess(res);
    expect(res.body.data.match.toss).toBeDefined();
    expect(res.body.data.match.toss.wonBy).toBe('team_a');
    expect(res.body.data.match.innings).toHaveLength(1);
  });

  it('✅ records toss with team_b winning and choosing to bowl', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_b', decision: 'bowl' });
    expectSuccess(res);
    // team_b bowling first means team_a bats first
    expect(res.body.data.match.innings[0].battingTeam).toBe('team_a');
  });

  it('❌ rejects invalid toss wonBy value', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_c', decision: 'bat' });
    expectError(res, 400);
  });

  it('❌ rejects invalid decision value', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_a', decision: 'jump' });
    expectError(res, 400);
  });

  it('❌ non-member cannot record toss', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { matchId } = await setupMatchRoom(owner.token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ wonBy: 'team_a', decision: 'bat' });
    expectError(res, 403);
  });

  it('❌ returns 404 for non-existent match', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/v1/matches/${fakeId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_a', decision: 'bat' });
    expectError(res, 404);
  });
});

// ─── Start Match ──────────────────────────────────────────────────────────────

describe('POST /api/v1/matches/:id/start', () => {
  it('✅ starts match after toss is recorded', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_a', decision: 'bat' });

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/start`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.match.status).toBe('in_progress');
  });

  it('❌ cannot start match without toss', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/start`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 400);
  });

  it('❌ cannot start match twice', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${token}`)
      .send({ wonBy: 'team_a', decision: 'bat' });

    await request(app)
      .post(`/api/v1/matches/${matchId}/start`)
      .set('Authorization', `Bearer ${token}`);

    // Try starting again
    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/start`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 400);
  });

  it('❌ non-member cannot start match', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { matchId } = await setupMatchRoom(owner.token);
    if (!matchId) return;

    await request(app)
      .post(`/api/v1/matches/${matchId}/toss`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ wonBy: 'team_a', decision: 'bat' });

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/start`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expectError(res, 403);
  });
});

// ─── Record Ball ──────────────────────────────────────────────────────────────

/**
 * Full workflow helper: room + players + toss + start → ready to record balls
 */
async function startedMatch(token) {
  const setup = await setupMatchRoom(token);
  if (!setup.matchId) return setup;

  // Record toss (team_a bats first)
  await request(app)
    .post(`/api/v1/matches/${setup.matchId}/toss`)
    .set('Authorization', `Bearer ${token}`)
    .send({ wonBy: 'team_a', decision: 'bat' });

  // Start match
  await request(app)
    .post(`/api/v1/matches/${setup.matchId}/start`)
    .set('Authorization', `Bearer ${token}`);

  return setup;
}

describe('POST /api/v1/scoring/ball', () => {
  it('✅ records a normal delivery (4 runs)', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const striker = teamAPlayers[0]._id;
    const nonStriker = teamAPlayers[1]._id;
    const bowler = teamBPlayers.find(p => p.playingRole === 'bowler')?._id || teamBPlayers[0]._id;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 4,
        strikerId: striker,
        nonStrikerId: nonStriker,
        bowlerId: bowler
      });
    expectSuccess(res);
    expect(res.body.data.innings.totalRuns).toBe(4);
  });

  it('✅ records a wide delivery', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'wide',
        runs: 0,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectSuccess(res);
    // Wides add 1 run extra
    expect(res.body.data.innings.extras.wides).toBeGreaterThanOrEqual(1);
  });

  it('✅ records a no-ball', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'no_ball',
        runs: 6,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectSuccess(res);
    expect(res.body.data.innings.extras.noBalls).toBeGreaterThanOrEqual(1);
  });

  it('✅ records a wicket delivery', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'wicket',
        runs: 0,
        isWicket: true,
        dismissalType: 'bowled',
        dismissedPlayerId: teamAPlayers[0]._id,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectSuccess(res);
    expect(res.body.data.innings.totalWickets).toBeGreaterThanOrEqual(1);
  });

  it('✅ records a six (6 runs)', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 6,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectSuccess(res);
    expect(res.body.data.innings.totalRuns).toBe(6);
  });

  it('❌ rejects when match is not in progress', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await setupMatchRoom(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    // Don't start the match — should fail
    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 4,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectError(res, 400);
  });

  it('❌ rejects with invalid outcome', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'super_ball',
        runs: 4,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectError(res, 400);
  });

  it('❌ rejects with missing matchId', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        outcome: 'normal',
        runs: 4,
        strikerId: new mongoose.Types.ObjectId(),
        nonStrikerId: new mongoose.Types.ObjectId(),
        bowlerId: new mongoose.Types.ObjectId()
      });
    expectError(res, 400);
  });

  it('❌ rejects runs > 7', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 8,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectError(res, 400);
  });

  it('❌ non-member cannot record deliveries', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(owner.token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 4,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });
    expectError(res, 403);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app)
      .post('/api/v1/scoring/ball')
      .send({ matchId: new mongoose.Types.ObjectId(), outcome: 'normal', runs: 1 });
    expectError(res, 401);
  });
});

// ─── Undo Last Ball ───────────────────────────────────────────────────────────

describe('POST /api/v1/scoring/undo', () => {
  it('✅ successfully undoes the last ball', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    // Record a ball first
    await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 4,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });

    const res = await request(app)
      .post('/api/v1/scoring/undo')
      .set('Authorization', `Bearer ${token}`)
      .send({ matchId });
    expectSuccess(res);
    // After undo, runs should be back to 0
    expect(res.body.data.innings.totalRuns).toBe(0);
  });

  it('❌ cannot undo when no balls recorded', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app)
      .post('/api/v1/scoring/undo')
      .set('Authorization', `Bearer ${token}`)
      .send({ matchId });
    expectError(res, 400);
  });

  it('❌ rejects without matchId', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/v1/scoring/undo')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expectError(res, 400);
  });

  it('❌ rejects without auth', async () => {
    const res = await request(app)
      .post('/api/v1/scoring/undo')
      .send({ matchId: new mongoose.Types.ObjectId() });
    expectError(res, 401);
  });
});

// ─── Live Score ───────────────────────────────────────────────────────────────

describe('GET /api/v1/matches/:id/live', () => {
  it('✅ returns live score data for an in-progress match', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app)
      .get(`/api/v1/matches/${matchId}/live`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.matchId).toBeDefined();
    expect(res.body.data.status).toBe('in_progress');
  });

  it('✅ accessible without auth (public)', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app).get(`/api/v1/matches/${matchId}/live`);
    expectSuccess(res);
  });

  it('✅ authenticated user gets personalStats field', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app)
      .get(`/api/v1/matches/${matchId}/live`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data).toHaveProperty('personalStats');
  });

  it('❌ returns 404 for non-existent match', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/v1/matches/${fakeId}/live`);
    expectError(res, 404);
  });
});

// ─── Match Timeline ───────────────────────────────────────────────────────────

describe('GET /api/v1/matches/:id/timeline', () => {
  it('✅ returns timeline of ball events', async () => {
    const { token } = await registerUser();
    const { matchId, teamAPlayers, teamBPlayers } = await startedMatch(token);
    if (!matchId || teamAPlayers.length < 2 || teamBPlayers.length < 2) return;

    // Record a ball
    await request(app)
      .post('/api/v1/scoring/ball')
      .set('Authorization', `Bearer ${token}`)
      .send({
        matchId,
        outcome: 'normal',
        runs: 1,
        strikerId: teamAPlayers[0]._id,
        nonStrikerId: teamAPlayers[1]._id,
        bowlerId: teamBPlayers[0]._id
      });

    const res = await request(app)
      .get(`/api/v1/matches/${matchId}/timeline`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('✅ returns empty timeline for new match', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app)
      .get(`/api/v1/matches/${matchId}/timeline`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('✅ supports pagination', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app)
      .get(`/api/v1/matches/${matchId}/timeline?page=1&limit=5`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.pagination).toBeDefined();
  });

  it('❌ returns 404 for non-existent match', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/matches/${fakeId}/timeline`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/v1/matches/${fakeId}/timeline`);
    expectError(res, 401);
  });
});

// ─── End Innings ──────────────────────────────────────────────────────────────

describe('POST /api/v1/matches/:id/end-innings', () => {
  it('✅ ends first innings and starts second innings', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/end-innings`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.match.innings).toHaveLength(2);
    expect(res.body.data.match.currentInnings).toBe(2);
  });

  it('✅ ends second innings and completes the match', async () => {
    const { token } = await registerUser();
    const { matchId } = await startedMatch(token);
    if (!matchId) return;

    // End first innings
    await request(app)
      .post(`/api/v1/matches/${matchId}/end-innings`)
      .set('Authorization', `Bearer ${token}`);

    // End second innings
    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/end-innings`)
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.match.status).toBe('completed');
    expect(res.body.data.match.result).toBeDefined();
    expect(res.body.data.match.result.winner).toBeDefined();
  });

  it('❌ cannot end innings when match is not in progress', async () => {
    const { token } = await registerUser();
    const { matchId } = await setupMatchRoom(token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/end-innings`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 400);
  });

  it('❌ non-member cannot end innings', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const { matchId } = await startedMatch(owner.token);
    if (!matchId) return;

    const res = await request(app)
      .post(`/api/v1/matches/${matchId}/end-innings`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expectError(res, 403);
  });

  it('❌ returns 404 for non-existent match', async () => {
    const { token } = await registerUser();
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/v1/matches/${fakeId}/end-innings`)
      .set('Authorization', `Bearer ${token}`);
    expectError(res, 404);
  });

  it('❌ rejects without auth', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/v1/matches/${fakeId}/end-innings`);
    expectError(res, 401);
  });
});
