const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cricket Scoring Application API',
      version: '1.0.0',
      description: `
## Cricket Scoring App — Production API

A comprehensive real-time cricket scoring platform with room-based match management.

### Key Features
- **Authentication**: JWT-based auth with refresh tokens, account locking
- **Room System**: Create/join match rooms with unique codes (1-3 users per room)
- **Team Management**: Static players + registered friend players
- **Live Scoring**: Ball-by-ball scoring with real-time WebSocket broadcasts
- **Live View**: Registered players see live scorecard on their devices
- **Admin Panel**: Dashboard, user management, match oversight, system health

### Socket.IO Events
Connect to the same server URL with Socket.IO client:
- \`join_room\` — Join a room/match for live updates
- \`ball_update\` — Receive ball-by-ball scoring events
- \`wicket_fallen\` — Wicket notification
- \`over_complete\` — Over completion notification
- \`innings_complete\` — Innings end notification
- \`match_complete\` — Match result notification
- \`match_chat\` — In-match messaging (authenticated users)
- \`match_reaction\` — Reactions (six, four, wicket, cheer, clap, appeal)
- \`undo_ball\` — Score correction notification

### Authentication
Pass JWT token in Authorization header: \`Bearer <token>\`

For Socket.IO, pass token in handshake: \`{ auth: { token: '<token>' } }\`
      `,
      contact: {
        name: 'Cricket Scoring API Support',
        email: 'support@cricketscore.com'
      },
      license: {
        name: 'MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development Server'
      },
      {
        url: 'https://api.cricketscore.com',
        description: 'Production Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
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
            currentPage: { type: 'integer' },
            totalPages: { type: 'integer' },
            totalDocs: { type: 'integer' },
            limit: { type: 'integer' },
            hasNextPage: { type: 'boolean' },
            hasPrevPage: { type: 'boolean' }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Error' }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Error' }
            }
          }
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/Error' }
            }
          }
        }
      }
    },
    tags: [
      { name: 'Authentication', description: 'Register, login, token management' },
      { name: 'Users', description: 'User profiles, search, stats' },
      { name: 'Friends', description: 'Friend requests and management' },
      { name: 'Rooms', description: 'Match room creation, joining, team setup' },
      { name: 'Matches', description: 'Match lifecycle: toss, start, innings, completion' },
      { name: 'Scoring', description: 'Ball-by-ball live scoring and undo' },
      { name: 'Admin', description: 'Admin dashboard, user/match management, system health' }
    ]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = { swaggerUi, swaggerSpec };
