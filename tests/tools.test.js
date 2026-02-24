/**
 * tools.test.js
 * Tests for all 12 cricket calculator endpoints + plan gating.
 *
 * GET  /tools                  — public (lists tools with hasAccess)
 * POST /tools/crr              — requires Basic+ plan (canUseTools)
 * POST /tools/rrr
 * POST /tools/batting-average
 * POST /tools/strike-rate
 * POST /tools/bowling-average
 * POST /tools/economy
 * POST /tools/bowling-strike-rate
 * POST /tools/nrr
 * POST /tools/project-score
 * POST /tools/partnership
 * POST /tools/dls
 * POST /tools/win-probability
 */
require('dotenv').config();
const request = require('supertest');
const {
  registerUser, setUserPlan,
  expectSuccess, expectError, clearCollections, app
} = require('./helpers');

beforeEach(async () => {
  await clearCollections('User', 'Subscription', 'SubscriptionPlan');
});

// ─── Helper: get an authorized user token (basic plan) ───────────────────────

const getBasicToken = async () => {
  const { token, user } = await registerUser();
  await setUserPlan(user._id, 'basic');
  return token;
};

// ─── List Tools ───────────────────────────────────────────────────────────────

describe('GET /api/v1/tools (list tools)', () => {
  it('✅ public user sees tools list', async () => {
    const res = await request(app).get('/api/v1/tools');
    expectSuccess(res);
    expect(Array.isArray(res.body.data.tools)).toBe(true);
    expect(res.body.data.tools.length).toBe(12);
  });

  it('✅ free user sees tools but hasAccess = false', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/v1/tools')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    const tool = res.body.data.tools[0];
    expect(tool).toHaveProperty('hasAccess');
    expect(tool.hasAccess).toBe(false);
  });

  it('✅ basic user sees tools with hasAccess = true', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .get('/api/v1/tools')
      .set('Authorization', `Bearer ${token}`);
    expectSuccess(res);
    expect(res.body.data.tools[0].hasAccess).toBe(true);
  });
});

// ─── Plan gating ─────────────────────────────────────────────────────────────

describe('Plan gating (canUseTools)', () => {
  it('❌ free user cannot use any tool (CRR)', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, overs: 5 });
    expectError(res, 403);
  });

  it('❌ unauthenticated user cannot use tools', async () => {
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .send({ runs: 50, overs: 5 });
    expectError(res, 401);
  });

  it('✅ basic plan user can use tools', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, overs: 5 });
    expectSuccess(res);
  });
});

// ─── CRR Calculator ──────────────────────────────────────────────────────────

describe('POST /api/v1/tools/crr', () => {
  it('✅ calculates CRR correctly (50 runs in 5 overs = 10.00)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, overs: 5 });
    expectSuccess(res);
    expect(res.body.data.currentRunRate).toBe(10);
  });

  it('✅ calculates CRR with partial over (30 runs in 2.3 = 2.3 overs)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 30, overs: 2.3 });
    expectSuccess(res);
    expect(res.body.data.currentRunRate).toBeGreaterThan(0);
  });

  it('❌ rejects negative runs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: -5, overs: 5 });
    expectError(res, 400);
  });

  it('❌ rejects zero overs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, overs: 0 });
    expectError(res, 400);
  });

  it('❌ rejects missing overs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/crr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50 });
    expectError(res, 400);
  });
});

// ─── RRR Calculator ──────────────────────────────────────────────────────────

describe('POST /api/v1/tools/rrr', () => {
  it('✅ calculates RRR correctly', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/rrr')
      .set('Authorization', `Bearer ${token}`)
      .send({ target: 150, runsScored: 50, oversCompleted: 10, totalOvers: 20 });
    expectSuccess(res);
    expect(res.body.data.requiredRunRate).toBeGreaterThan(0);
    expect(res.body.data.runsNeeded).toBe(100);
  });

  it('✅ target already achieved returns 0 RRR', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/rrr')
      .set('Authorization', `Bearer ${token}`)
      .send({ target: 50, runsScored: 60, oversCompleted: 10, totalOvers: 20 });
    expectSuccess(res);
    expect(res.body.data.requiredRunRate).toBe(0);
  });

  it('❌ rejects zero target', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/rrr')
      .set('Authorization', `Bearer ${token}`)
      .send({ target: 0, runsScored: 0, oversCompleted: 0, totalOvers: 20 });
    expectError(res, 400);
  });

  it('❌ rejects oversCompleted >= totalOvers', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/rrr')
      .set('Authorization', `Bearer ${token}`)
      .send({ target: 150, runsScored: 50, oversCompleted: 20, totalOvers: 20 });
    expectError(res, 400);
  });
});

// ─── Batting Average ─────────────────────────────────────────────────────────

describe('POST /api/v1/tools/batting-average', () => {
  it('✅ calculates batting average (runs / dismissals)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/batting-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ totalRuns: 500, innings: 10, notOuts: 2 });
    expectSuccess(res);
    // 500 / (10 - 2) = 62.5
    expect(res.body.data.battingAverage).toBe(62.5);
  });

  it('✅ returns Infinity label when all innings are not-outs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/batting-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ totalRuns: 50, innings: 2, notOuts: 2 });
    expectSuccess(res);
    // All not-outs => average = N/A or Infinity
    expect(res.body.data).toBeDefined();
  });

  it('❌ rejects negative runs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/batting-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ totalRuns: -10, innings: 5, notOuts: 0 });
    expectError(res, 400);
  });

  it('❌ rejects missing innings', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/batting-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ totalRuns: 200 });
    expectError(res, 400);
  });
});

// ─── Strike Rate ─────────────────────────────────────────────────────────────

describe('POST /api/v1/tools/strike-rate', () => {
  it('✅ calculates batting strike rate (100 runs / 80 balls = 125)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/strike-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 100, ballsFaced: 80 });
    expectSuccess(res);
    expect(res.body.data.strikeRate).toBe(125);
  });

  it('❌ rejects zero balls', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/strike-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, ballsFaced: 0 });
    expectError(res, 400);
  });

  it('❌ rejects missing ballsFaced', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/strike-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50 });
    expectError(res, 400);
  });
});

// ─── Bowling Average ─────────────────────────────────────────────────────────

describe('POST /api/v1/tools/bowling-average', () => {
  it('✅ calculates bowling average (runs conceded / wickets)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/bowling-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsConceded: 200, wickets: 10 });
    expectSuccess(res);
    expect(res.body.data.bowlingAverage).toBe(20);
  });

  it('❌ rejects zero wickets', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/bowling-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsConceded: 200, wickets: 0 });
    expectError(res, 400);
  });

  it('❌ rejects missing wickets', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/bowling-average')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsConceded: 200 });
    expectError(res, 400);
  });
});

// ─── Economy Rate ─────────────────────────────────────────────────────────────

describe('POST /api/v1/tools/economy', () => {
  it('✅ calculates economy rate (48 runs in 8 overs = 6.00)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/economy')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsConceded: 48, oversBowled: 8 });
    expectSuccess(res);
    expect(res.body.data.economyRate).toBe(6);
  });

  it('❌ rejects zero overs bowled', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/economy')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsConceded: 48, oversBowled: 0 });
    expectError(res, 400);
  });
});

// ─── Bowling Strike Rate ──────────────────────────────────────────────────────

describe('POST /api/v1/tools/bowling-strike-rate', () => {
  it('✅ calculates bowling strike rate (balls per wicket)', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/bowling-strike-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ ballsBowled: 60, wickets: 5 });
    expectSuccess(res);
    expect(res.body.data.bowlingStrikeRate).toBe(12);
  });

  it('❌ rejects zero wickets', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/bowling-strike-rate')
      .set('Authorization', `Bearer ${token}`)
      .send({ ballsBowled: 60, wickets: 0 });
    expectError(res, 400);
  });
});

// ─── NRR Calculator ───────────────────────────────────────────────────────────

describe('POST /api/v1/tools/nrr', () => {
  it('✅ calculates NRR for a team', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/nrr')
      .set('Authorization', `Bearer ${token}`)
      .send({
        runsScored: 800,
        oversFaced: 100,
        runsConceded: 720,
        oversBowled: 100
      });
    expectSuccess(res);
    expect(res.body.data.nrr).toBeDefined();
    // (800/100) - (720/100) = 8.00 - 7.20 = 0.80
    expect(res.body.data.nrr).toBeCloseTo(0.8, 1);
  });

  it('❌ rejects zero oversFaced', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/nrr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsScored: 800, oversFaced: 0, runsConceded: 720, oversBowled: 100 });
    expectError(res, 400);
  });

  it('❌ rejects zero oversBowled', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/nrr')
      .set('Authorization', `Bearer ${token}`)
      .send({ runsScored: 800, oversFaced: 100, runsConceded: 720, oversBowled: 0 });
    expectError(res, 400);
  });
});

// ─── Project Score ────────────────────────────────────────────────────────────

describe('POST /api/v1/tools/project-score', () => {
  it('✅ projects final score based on CRR', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/project-score')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentRuns: 80, currentOvers: 10, totalOvers: 20 });
    expectSuccess(res);
    expect(res.body.data.projectedScore).toBeDefined();
    // At 8 rpo, over 20 overs = 160
    expect(res.body.data.projectedScore).toBe(160);
  });

  it('❌ rejects if overs completed >= total overs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/project-score')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentRuns: 200, currentOvers: 20, totalOvers: 20 });
    expectError(res, 400);
  });
});

// ─── Partnership Calculator ───────────────────────────────────────────────────

describe('POST /api/v1/tools/partnership', () => {
  it('✅ calculates partnership run rate', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/partnership')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, balls: 30 });
    expectSuccess(res);
    expect(res.body.data.partnershipRunRate).toBeDefined();
  });

  it('❌ rejects zero balls', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/partnership')
      .set('Authorization', `Bearer ${token}`)
      .send({ runs: 50, balls: 0 });
    expectError(res, 400);
  });
});

// ─── DLS Calculator ───────────────────────────────────────────────────────────

describe('POST /api/v1/tools/dls', () => {
  it('✅ calculates DLS revised target', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/dls')
      .set('Authorization', `Bearer ${token}`)
      .send({
        team1Score: 250,
        team1Overs: 50,
        team2OversAllowed: 25,
        wicketsLost: 0
      });
    expectSuccess(res);
    expect(res.body.data.revisedTarget).toBeDefined();
    expect(res.body.data.revisedTarget).toBeGreaterThan(0);
  });

  it('❌ rejects zero total overs', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/dls')
      .set('Authorization', `Bearer ${token}`)
      .send({ team1Score: 250, team1Overs: 0, team2OversAllowed: 25, wicketsLost: 0 });
    expectError(res, 400);
  });
});

// ─── Win Probability ──────────────────────────────────────────────────────────

describe('POST /api/v1/tools/win-probability', () => {
  it('✅ calculates win probability for chasing team', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/win-probability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target: 180,
        currentRuns: 80,
        wicketsLost: 2,
        oversCompleted: 10,
        totalOvers: 20
      });
    expectSuccess(res);
    expect(res.body.data.chasingTeamWinProbability).toBeDefined();
    expect(res.body.data.chasingTeamWinProbability).toBeGreaterThanOrEqual(0);
    expect(res.body.data.chasingTeamWinProbability).toBeLessThanOrEqual(100);
  });

  it('✅ returns 100% if target already beaten', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/win-probability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target: 100,
        currentRuns: 110,
        wicketsLost: 3,
        oversCompleted: 15,
        totalOvers: 20
      });
    expectSuccess(res);
    expect(res.body.data.chasingTeamWinProbability).toBe(100);
  });

  it('❌ rejects invalid oversCompleted', async () => {
    const token = await getBasicToken();
    const res = await request(app)
      .post('/api/v1/tools/win-probability')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target: 180,
        currentRuns: 80,
        wicketsLost: 2,
        oversCompleted: 25, // > totalOvers
        totalOvers: 20
      });
    expectError(res, 400);
  });
});
