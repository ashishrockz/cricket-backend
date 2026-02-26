const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cricket Box API',
      version: '2.0.0',
      description: `
## Cricket Box — REST API Reference

A comprehensive real-time cricket scoring platform with room-based match management,
live ball-by-ball scoring, tournaments, analytics, and a full admin control panel.

---

### 🔐 Authentication
All protected endpoints require a JWT Bearer token in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`
Obtain tokens via **POST /api/v1/auth/login** or **POST /api/v1/auth/otp/verify**.
Refresh expired tokens via **POST /api/v1/auth/refresh-token**.

---

### 👥 Role Levels
| Role | Access |
|---|---|
| **Guest** | Public endpoints only |
| **User** | All user-facing endpoints |
| **Admin** | Admin panel + all user endpoints |
| **Super Admin** | Full access — exports, plan management, delete users |

---

### ⏱ Rate Limits
| Path | Limit |
|---|---|
| \`/api/v1/auth/\` | 10 req / 15 min |
| \`/api/v1/auth/otp/\` | 3 req / 15 min |
| \`/api/v1/admin/\` | 300 req / 15 min |
| All other \`/api/\` | 200 req / 15 min |

---

### 🔌 Real-time Socket.IO
Connect to the same server host with a Socket.IO client. Pass JWT in handshake:
\`\`\`js
const socket = io('https://cricket-backend-orkc.onrender.com', {
  auth: { token: '<access_token>' }
});
\`\`\`

**Match events:** \`join_room\`, \`ball_update\`, \`wicket_fallen\`, \`over_complete\`,
\`innings_complete\`, \`match_complete\`, \`match_chat\`, \`match_reaction\`, \`undo_ball\`

**Admin events (admin_room):** \`admin:stats_update\`, \`admin:new_user\`, \`admin:match_started\`, \`admin:match_completed\`
      `,
      contact: {
        name: 'Cricket Box API Support',
        email: 'support@cricketbox.com'
      },
      license: { name: 'MIT' }
    },
    servers: [
      {
        url: 'https://cricket-backend-orkc.onrender.com',
        description: 'Production'
      },
      {
        url: 'http://localhost:5000',
        description: 'Development'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token (7-day validity). Obtain from login or OTP verify.'
        }
      },
      schemas: {
        // ── Generic response wrappers ─────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource not found' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            currentPage:  { type: 'integer', example: 1 },
            totalPages:   { type: 'integer', example: 5 },
            totalDocs:    { type: 'integer', example: 48 },
            limit:        { type: 'integer', example: 10 },
            hasNextPage:  { type: 'boolean', example: true },
            hasPrevPage:  { type: 'boolean', example: false }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data:    { type: 'object' }
          }
        },

        // ── Auth inputs ───────────────────────────────────────────────────────
        RegisterInput: {
          type: 'object',
          required: ['username', 'email', 'password'],
          properties: {
            username:     { type: 'string', minLength: 3, maxLength: 30, example: 'raju_cricket' },
            email:        { type: 'string', format: 'email', example: 'raju@example.com' },
            password:     { type: 'string', minLength: 8, maxLength: 128, example: 'SecurePass123' },
            fullName:     { type: 'string', example: 'Raju Kumar' },
            phone:        { type: 'string', example: '+919876543210' },
            playingRole:  { type: 'string', enum: ['batsman', 'bowler', 'all_rounder', 'wicket_keeper'] },
            battingStyle: { type: 'string', enum: ['right_hand', 'left_hand'] },
            bowlingStyle: { type: 'string', example: 'Right arm medium' },
            city:         { type: 'string', example: 'Mumbai' }
          }
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'raju@example.com' },
            password: { type: 'string', example: 'SecurePass123' }
          }
        },
        TokenPair: {
          type: 'object',
          properties: {
            accessToken:  { type: 'string', description: 'JWT access token (7 days)' },
            refreshToken: { type: 'string', description: 'JWT refresh token (30 days)' }
          }
        },

        // ── User ─────────────────────────────────────────────────────────────
        UserStats: {
          type: 'object',
          properties: {
            matchesPlayed: { type: 'integer', example: 42 },
            totalRuns:     { type: 'integer', example: 1280 },
            totalWickets:  { type: 'integer', example: 37 },
            highestScore:  { type: 'integer', example: 98 },
            fifties:       { type: 'integer', example: 8 },
            hundreds:      { type: 'integer', example: 1 }
          }
        },
        UserProfile: {
          type: 'object',
          properties: {
            _id:              { type: 'string', example: '6840abc1234567890def1234' },
            username:         { type: 'string', example: 'raju_cricket' },
            email:            { type: 'string', format: 'email' },
            fullName:         { type: 'string', example: 'Raju Kumar' },
            phone:            { type: 'string', example: '+919876543210' },
            city:             { type: 'string', example: 'Mumbai' },
            bio:              { type: 'string' },
            playingRole:      { type: 'string', enum: ['batsman', 'bowler', 'all_rounder', 'wicket_keeper'] },
            battingStyle:     { type: 'string', enum: ['right_hand', 'left_hand'] },
            bowlingStyle:     { type: 'string' },
            role:             { type: 'string', enum: ['user', 'admin', 'super_admin'] },
            isActive:         { type: 'boolean' },
            isBanned:         { type: 'boolean' },
            isEmailVerified:  { type: 'boolean' },
            subscriptionPlan: { type: 'string', example: 'free' },
            stats:            { '$ref': '#/components/schemas/UserStats' },
            createdAt:        { type: 'string', format: 'date-time' }
          }
        },

        // ── Match ─────────────────────────────────────────────────────────────
        MatchSummary: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            format:    { type: 'string', enum: ['T10', 'T20', 'ODI', 'TEST', 'CUSTOM'] },
            status:    { type: 'string', enum: ['not_started', 'toss_done', 'in_progress', 'innings_break', 'completed', 'abandoned'] },
            teamA:     { type: 'object', properties: { name: { type: 'string' }, shortName: { type: 'string' } } },
            teamB:     { type: 'object', properties: { name: { type: 'string' }, shortName: { type: 'string' } } },
            matchDate: { type: 'string', format: 'date-time' },
            venue:     { type: 'string' },
            result:    { type: 'object', properties: { summary: { type: 'string' } } }
          }
        },

        // ── Room ──────────────────────────────────────────────────────────────
        Room: {
          type: 'object',
          properties: {
            _id:        { type: 'string' },
            roomCode:   { type: 'string', example: 'CKT-4821' },
            name:       { type: 'string', example: 'Mumbai vs Delhi' },
            status:     { type: 'string', enum: ['waiting', 'active', 'completed', 'cancelled'] },
            maxPlayers: { type: 'integer', example: 22 },
            format:     { type: 'string', enum: ['T10', 'T20', 'ODI', 'TEST', 'CUSTOM'] },
            creator:    { type: 'string', description: 'User ID' },
            createdAt:  { type: 'string', format: 'date-time' }
          }
        },

        // ── Subscription ──────────────────────────────────────────────────────
        PlanFeatures: {
          type: 'object',
          properties: {
            maxRooms:          { type: 'integer', example: 3 },
            maxPlayersPerRoom: { type: 'integer', example: 22 },
            maxTournaments:    { type: 'integer', example: 0 },
            canUseTools:       { type: 'boolean' },
            canUploadLogo:     { type: 'boolean' },
            adsEnabled:        { type: 'boolean' },
            canManageAcademy:  { type: 'boolean' },
            maxAcademyMembers: { type: 'integer' },
            analyticsAccess:   { type: 'boolean' },
            prioritySupport:   { type: 'boolean' },
            customBranding:    { type: 'boolean' },
            apiAccess:         { type: 'boolean' },
            exportData:        { type: 'boolean' }
          }
        },
        SubscriptionPlan: {
          type: 'object',
          properties: {
            _id:    { type: 'string' },
            name:   { type: 'string', example: 'Pro' },
            slug:   { type: 'string', example: 'pro' },
            type:   { type: 'string', enum: ['individual', 'enterprise'] },
            price: {
              type: 'object',
              properties: {
                monthly:  { type: 'number', example: 299 },
                annual:   { type: 'number', example: 2999 },
                currency: { type: 'string', example: 'INR' }
              }
            },
            features:     { '$ref': '#/components/schemas/PlanFeatures' },
            isActive:     { type: 'boolean' },
            displayOrder: { type: 'integer' },
            badge:        { type: 'string', example: 'Popular' },
            color:        { type: 'string', example: '#3b82f6' }
          }
        },
        UserSubscription: {
          type: 'object',
          properties: {
            _id:          { type: 'string' },
            user:         { type: 'string', description: 'User ID' },
            planSlug:     { type: 'string', example: 'pro' },
            status:       { type: 'string', enum: ['active', 'expired', 'cancelled', 'pending'] },
            billingCycle: { type: 'string', enum: ['monthly', 'annual', 'lifetime'] },
            startDate:    { type: 'string', format: 'date-time' },
            endDate:      { type: 'string', format: 'date-time', nullable: true }
          }
        },

        // ── Enterprise ────────────────────────────────────────────────────────
        Enterprise: {
          type: 'object',
          properties: {
            _id:         { type: 'string' },
            name:        { type: 'string', example: 'Mumbai Cricket Academy' },
            slug:        { type: 'string', example: 'mumbai-cricket-academy' },
            type:        { type: 'string', enum: ['academy', 'club', 'school', 'corporate', 'other'] },
            city:        { type: 'string' },
            isVerified:  { type: 'boolean' },
            isActive:    { type: 'boolean' },
            isSuspended: { type: 'boolean' },
            memberCount: { type: 'integer' }
          }
        },

        // ── Ad ────────────────────────────────────────────────────────────────
        Ad: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            title:     { type: 'string' },
            type:      { type: 'string', enum: ['banner', 'interstitial', 'native', 'video'] },
            placement: { type: 'string', enum: ['home_top', 'home_bottom', 'match_start', 'match_end', 'scoreboard', 'sidebar'] },
            status:    { type: 'string', enum: ['pending', 'approved', 'rejected', 'active', 'paused', 'expired'] },
            imageUrl:  { type: 'string', format: 'uri' },
            targetUrl: { type: 'string', format: 'uri' }
          }
        },

        // ── Notification ──────────────────────────────────────────────────────
        Notification: {
          type: 'object',
          properties: {
            _id:       { type: 'string' },
            title:     { type: 'string' },
            body:      { type: 'string' },
            type:      { type: 'string', enum: ['system', 'match', 'tournament', 'friend', 'announcement', 'promotion', 'warning', 'custom'] },
            isRead:    { type: 'boolean' },
            actionUrl: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },

        // ── Announcement ──────────────────────────────────────────────────────
        Announcement: {
          type: 'object',
          properties: {
            _id:         { type: 'string' },
            title:       { type: 'string' },
            body:        { type: 'string' },
            type:        { type: 'string', enum: ['info', 'warning', 'update', 'maintenance', 'promotion', 'event'] },
            priority:    { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
            status:      { type: 'string', enum: ['draft', 'published', 'archived'] },
            isPinned:    { type: 'boolean' },
            showAsBanner:{ type: 'boolean' },
            audience:    { type: 'string', enum: ['all', 'active_users', 'new_users', 'premium_users', 'specific_city'] },
            scheduledAt: { type: 'string', format: 'date-time', nullable: true },
            expiresAt:   { type: 'string', format: 'date-time', nullable: true },
            createdAt:   { type: 'string', format: 'date-time' }
          }
        },

        // ── Tournament ────────────────────────────────────────────────────────
        Tournament: {
          type: 'object',
          properties: {
            _id:           { type: 'string' },
            name:          { type: 'string', example: 'IPL 2025' },
            format:        { type: 'string', enum: ['league', 'knockout', 'group_knockout', 'round_robin', 'double_elimination'] },
            matchFormat:   { type: 'string', enum: ['T10', 'T20', 'ODI', 'TEST', 'CUSTOM'] },
            totalOvers:    { type: 'integer', example: 20 },
            status:        { type: 'string', enum: ['draft', 'registration_open', 'in_progress', 'completed', 'cancelled'] },
            maxTeams:      { type: 'integer', example: 8 },
            startDate:     { type: 'string', format: 'date-time', nullable: true },
            endDate:       { type: 'string', format: 'date-time', nullable: true },
            entryFee:      { type: 'number', example: 500 },
            prizeMoney:    { type: 'number', example: 5000 },
            isPublic:      { type: 'boolean' }
          }
        },

        // ── Audit ─────────────────────────────────────────────────────────────
        AuditLog: {
          type: 'object',
          properties: {
            _id:        { type: 'string' },
            action:     { type: 'string', example: 'user.ban' },
            category:   { type: 'string', example: 'user_management' },
            severity:   { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            actor:      { type: 'object', properties: { userId: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } },
            target:     { type: 'object' },
            ipAddress:  { type: 'string' },
            createdAt:  { type: 'string', format: 'date-time' }
          }
        },
        Report: {
          type: 'object',
          properties: {
            _id:         { type: 'string' },
            reporter:    { type: 'string', description: 'User ID' },
            targetType:  { type: 'string', enum: ['user', 'match', 'room', 'chat_message'] },
            targetId:    { type: 'string' },
            reason:      { type: 'string', enum: ['abusive_behavior', 'cheating', 'match_fixing', 'fake_scoring', 'harassment', 'spam', 'inappropriate_content', 'impersonation', 'unfair_play', 'other'] },
            description: { type: 'string' },
            status:      { type: 'string', enum: ['pending', 'under_review', 'resolved', 'dismissed', 'escalated'] },
            priority:    { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            createdAt:   { type: 'string', format: 'date-time' }
          }
        }
      },

      // ── Reusable response definitions ───────────────────────────────────────
      responses: {
        UnauthorizedError: {
          description: '401 — Missing or invalid Bearer token',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } }
        },
        ForbiddenError: {
          description: '403 — Insufficient role (requires admin or super_admin)',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } }
        },
        NotFoundError: {
          description: '404 — Resource not found',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } }
        },
        ValidationError: {
          description: '400 — Request validation failed',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } }
        },
        TooManyRequests: {
          description: '429 — Rate limit exceeded',
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } }
        }
      },

      // ── Reusable parameter definitions ──────────────────────────────────────
      parameters: {
        PathId: {
          in: 'path', name: 'id', required: true,
          schema: { type: 'string' },
          description: 'MongoDB ObjectId (24-char hex)'
        },
        PageQuery: {
          in: 'query', name: 'page',
          schema: { type: 'integer', default: 1, minimum: 1 },
          description: 'Page number'
        },
        LimitQuery: {
          in: 'query', name: 'limit',
          schema: { type: 'integer', default: 10, minimum: 1, maximum: 100 },
          description: 'Items per page'
        },
        SearchQuery: {
          in: 'query', name: 'search',
          schema: { type: 'string' },
          description: 'Search term'
        },
        PeriodQuery: {
          in: 'query', name: 'period',
          schema: { type: 'string', enum: ['7d', '30d', '90d', '6m', '1y', 'all_time'], default: '30d' },
          description: 'Time period filter'
        }
      }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // TAG GROUPS — declared in display order.
    // Swagger UI renders tags in the order they appear here.
    // User-facing tags come first; all Admin tags are prefixed "Admin -".
    // ─────────────────────────────────────────────────────────────────────────
    tags: [
      // ── User-facing APIs ──────────────────────────────────────────────────
      {
        name: 'Authentication',
        description: '🔑 Register, login, OTP, password reset, token management'
      },
      {
        name: 'Users',
        description: '👤 User profile, search, career stats'
      },
      {
        name: 'Friends',
        description: '🤝 Friend requests, list, remove'
      },
      {
        name: 'Rooms',
        description: '🏟 Match room creation, joining, team setup, invitations'
      },
      {
        name: 'Matches',
        description: '🏏 Match lifecycle — toss, start, innings, live scorecard, timeline'
      },
      {
        name: 'Scoring',
        description: '⚡ Ball-by-ball live scoring and undo (requires room membership)'
      },
      {
        name: 'Stats',
        description: '📊 Player career statistics and public leaderboard'
      },
      {
        name: 'Cricket Tools',
        description: '🧮 Cricket calculators — CRR, RRR, DLS, NRR, win probability (requires Basic plan)'
      },
      {
        name: 'Subscriptions',
        description: '💳 Subscription plans and user subscription management'
      },
      {
        name: 'Enterprises',
        description: '🏢 Cricket academies and club management'
      },
      {
        name: 'Ads',
        description: '📢 Ad delivery for the mobile application'
      },
      {
        name: 'Notifications',
        description: '🔔 User notification inbox and read status'
      },
      {
        name: 'Announcements',
        description: '📣 Platform announcements (public active feed)'
      },
      {
        name: 'Reports',
        description: '🚩 Submit abuse / cheating reports (authenticated users)'
      },

      // ── Admin APIs ────────────────────────────────────────────────────────
      {
        name: 'Admin - Dashboard',
        description: '🛡 Admin dashboard overview and system health (requires admin role)'
      },
      {
        name: 'Admin - Users',
        description: '👥 Admin user management — ban, unban, activate, deactivate, role change, bulk actions, CSV export'
      },
      {
        name: 'Admin - Matches & Rooms',
        description: '🏏 Admin match and room oversight — list, abandon'
      },
      {
        name: 'Admin - Analytics',
        description: '📈 Platform analytics — user growth, match activity, revenue, leaderboards, demographics'
      },
      {
        name: 'Admin - Subscriptions',
        description: '💳 Admin subscription management — list, assign, cancel, plan CRUD (super_admin for plan mutations)'
      },
      {
        name: 'Admin - Enterprises',
        description: '🏢 Admin enterprise management — verify, suspend, activate'
      },
      {
        name: 'Admin - Advertisements',
        description: '📢 Admin ad management — create, review, approve/reject, analytics'
      },
      {
        name: 'Admin - Tournaments',
        description: '🏆 Admin tournament management — full lifecycle, teams, fixtures, points table'
      },
      {
        name: 'Admin - Notifications',
        description: '🔔 Admin notification center — send targeted, broadcast, stats'
      },
      {
        name: 'Admin - Announcements',
        description: '📣 Admin announcement management — create, publish, archive, delete'
      },
      {
        name: 'Admin - Audit & Reports',
        description: '📋 Audit trail and user-submitted report management (requires admin role)'
      },
      {
        name: 'Admin - System',
        description: '⚙️ System health stats and CSV data exports (super_admin for exports)'
      }
    ]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = { swaggerUi, swaggerSpec };
