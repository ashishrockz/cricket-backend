# Cricket Scoring Application — Backend API

Production-grade Node.js backend for a real-time cricket scoring platform with room-based match management, live scoring via Socket.IO, and a full admin module.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js 4 |
| Database | MongoDB (Mongoose 8) |
| Real-time | Socket.IO 4 |
| Auth | JWT (access + refresh tokens) |
| Validation | Joi |
| Docs | Swagger/OpenAPI 3.0 |
| Logging | Winston |
| Security | Helmet, CORS, rate limiting, mongo-sanitize, HPP |

## Quick Start

### Option A: Docker (Recommended)

```bash
docker-compose up --build
```

This starts the API on `http://localhost:5000`, MongoDB on port `27017`, and Mongo Express UI on `http://localhost:8081`.

### Option B: Manual

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your MongoDB URI and secrets

# 3. Start MongoDB (must be running)
mongod

# 4. Run development server
npm run dev

# 5. (Optional) Seed demo data
npm run seed -- --demo
```

## API Documentation

Once running, visit: **http://localhost:5000/api-docs**

Interactive Swagger UI with all endpoints, request/response schemas, and authentication.

## Project Structure

```
cricket-backend/
├── src/
│   ├── server.js              # Entry point
│   ├── app.js                 # Express app setup & middleware
│   ├── config/
│   │   ├── constants.js       # Enums, roles, socket events
│   │   ├── database.js        # MongoDB connection
│   │   └── logger.js          # Winston logger
│   ├── models/
│   │   ├── User.js            # User model (auth, stats, profile)
│   │   ├── Room.js            # Match room (members, codes)
│   │   ├── Match.js           # Full match state (innings, teams)
│   │   ├── ScoreEvent.js      # Ball-by-ball event log
│   │   └── Friendship.js      # Friend request system
│   ├── controllers/
│   │   ├── authController.js   # Register, login, tokens
│   │   ├── userController.js   # Profile, search, stats
│   │   ├── friendController.js # Friend requests
│   │   ├── roomController.js   # Room CRUD, player management
│   │   ├── matchController.js  # Toss, start, innings, live score
│   │   ├── scoringController.js# Ball recording, undo
│   │   └── adminController.js  # Dashboard, user/match mgmt
│   ├── routes/                 # Express routes + Swagger JSDoc
│   ├── middlewares/
│   │   ├── auth.js             # JWT auth, role authorization
│   │   ├── validate.js         # Joi validation middleware
│   │   └── errorHandler.js     # Global error handling
│   ├── validators/
│   │   └── index.js            # All Joi schemas
│   ├── socket/
│   │   └── socketManager.js    # Socket.IO setup & events
│   ├── utils/
│   │   ├── apiHelpers.js       # ApiError, ApiResponse classes
│   │   ├── asyncHandler.js     # Async route wrapper
│   │   ├── pagination.js       # Pagination utilities
│   │   └── seeder.js           # Admin & demo data seeder
│   └── docs/
│       └── swagger.js          # Swagger configuration
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh-token` | Refresh access token |
| PUT | `/api/v1/auth/change-password` | Change password |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/search?q=` | Search users |
| PUT | `/api/v1/users/profile` | Update profile |
| GET | `/api/v1/users/match-history` | Match history |
| GET | `/api/v1/users/:id` | Get user by ID |
| GET | `/api/v1/users/:id/stats` | Career statistics |

### Friends
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/friends` | Friends list |
| POST | `/api/v1/friends/request` | Send friend request |
| PUT | `/api/v1/friends/request/:id` | Accept/reject request |
| GET | `/api/v1/friends/requests/pending` | Pending requests |
| GET | `/api/v1/friends/requests/sent` | Sent requests |
| DELETE | `/api/v1/friends/:id` | Remove friend |

### Rooms
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/rooms` | Create room |
| GET | `/api/v1/rooms/my-rooms` | My rooms |
| POST | `/api/v1/rooms/join/:roomCode` | Join room |
| GET | `/api/v1/rooms/:id` | Room details |
| GET | `/api/v1/rooms/code/:roomCode` | Room by code |
| POST | `/api/v1/rooms/:id/players` | Add player to team |
| DELETE | `/api/v1/rooms/:id/players/:playerId` | Remove player |
| POST | `/api/v1/rooms/:id/leave` | Leave room |

### Matches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/matches/:id` | Match details |
| GET | `/api/v1/matches/:id/live` | Live scorecard (public) |
| GET | `/api/v1/matches/:id/timeline` | Ball-by-ball timeline |
| POST | `/api/v1/matches/:id/toss` | Record toss |
| POST | `/api/v1/matches/:id/start` | Start match |
| POST | `/api/v1/matches/:id/end-innings` | End innings |

### Scoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/scoring/ball` | Record a delivery |
| POST | `/api/v1/scoring/undo` | Undo last ball |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/dashboard` | Dashboard stats |
| GET | `/api/v1/admin/system` | System health |
| GET | `/api/v1/admin/users` | List users (filterable) |
| GET | `/api/v1/admin/users/:id` | User details |
| PUT | `/api/v1/admin/users/:id` | Ban/unban/role change |
| DELETE | `/api/v1/admin/users/:id` | Soft delete user |
| GET | `/api/v1/admin/matches` | List matches |
| GET | `/api/v1/admin/rooms` | List rooms |
| POST | `/api/v1/admin/matches/:id/abandon` | Force abandon match |

## Socket.IO Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `{ roomId, matchId }` | Subscribe to room/match updates |
| `leave_room` | `{ roomId, matchId }` | Unsubscribe |
| `request_live_score` | `{ matchId }` | Subscribe to live score feed |
| `match_chat` | `{ roomId, message }` | Send chat message |
| `match_reaction` | `{ roomId, reaction }` | Send reaction |

### Server → Client
| Event | Description |
|-------|-------------|
| `ball_update` | Ball-by-ball scoring event with full innings state |
| `wicket_fallen` | Wicket details |
| `over_complete` | Over summary |
| `innings_complete` | Innings summary with target |
| `match_complete` | Final result |
| `score_update` | Generic score broadcast |
| `undo_ball` | Ball undo notification |
| `room_updated` | Room state change |
| `room_user_joined` | New member joined |
| `room_user_left` | Member left |
| `match_chat` | Chat message broadcast |
| `match_reaction` | Reaction broadcast |

## Security Features

- **JWT Authentication** with access + refresh token rotation
- **Account Locking** after 5 failed login attempts (30 min)
- **Rate Limiting**: 100 req/15min general, 20 req/15min auth
- **Input Sanitization**: Mongo injection protection, XSS via Helmet
- **Parameter Pollution Protection** (HPP)
- **CORS** with configurable origins
- **Role-Based Access Control** (user → admin → super_admin)
- **Password Hashing** with bcrypt (12 salt rounds)

## Environment Variables

See `.env.example` for all configuration options including:
- Server port and environment
- MongoDB connection string
- JWT secrets and expiry durations
- Rate limit configuration
- CORS origin
- Default admin credentials
- Log level

## Default Admin Credentials

```
Email: admin@cricketscore.com
Password: Admin@123456
```

**Change these immediately in production!**
