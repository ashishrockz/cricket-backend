const Joi = require('joi');
const { PLAYING_ROLES, BATTING_STYLES, BOWLING_STYLES, MATCH_FORMATS, ROOM_ROLES, DELIVERY_OUTCOMES, DISMISSAL_TYPES, PLAYER_TYPES } = require('../config/constants');

// ============================================
// AUTH VALIDATORS
// ============================================
const authValidators = {
  register: {
    body: Joi.object({
      username: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_]+$/)
        .required().messages({
          'string.pattern.base': 'Username can only contain letters, numbers, and underscores'
        }),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .required().messages({
          'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, one number, and one special character'
        }),
      fullName: Joi.string().min(2).max(100).trim().required(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).optional().allow(''),
      playingRole: Joi.string().valid(...Object.values(PLAYING_ROLES)).optional(),
      battingStyle: Joi.string().valid(...Object.values(BATTING_STYLES)).optional(),
      bowlingStyle: Joi.string().valid(...Object.values(BOWLING_STYLES)).optional(),
      city: Joi.string().max(100).optional().allow('')
    })
  },
  login: {
    body: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    })
  },
  refreshToken: {
    body: Joi.object({
      refreshToken: Joi.string().required()
    })
  },
  changePassword: {
    body: Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .required().messages({
          'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, one number, and one special character'
        }),
      confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
        .messages({ 'any.only': 'Passwords do not match' })
    })
  },
  requestOTP: {
    body: Joi.object({
      email: Joi.string().email().required(),
      purpose: Joi.string().valid('login', 'register_verify', 'password_reset', 'email_change').default('login')
    })
  },
  verifyOTP: {
    body: Joi.object({
      email: Joi.string().email().required(),
      otp: Joi.string().length(6).pattern(/^\d+$/).required()
        .messages({ 'string.length': 'OTP must be exactly 6 digits', 'string.pattern.base': 'OTP must contain only digits' }),
      purpose: Joi.string().valid('login', 'register_verify', 'password_reset', 'email_change').default('login')
    })
  },
  resetPassword: {
    body: Joi.object({
      resetToken: Joi.string().required(),
      newPassword: Joi.string().min(8).max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .required().messages({
          'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, one number, and one special character'
        })
    })
  }
};

// ============================================
// USER VALIDATORS
// ============================================
const userValidators = {
  updateProfile: {
    body: Joi.object({
      fullName: Joi.string().min(2).max(100).trim().optional(),
      phone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).optional().allow('', null),
      playingRole: Joi.string().valid(...Object.values(PLAYING_ROLES)).optional(),
      battingStyle: Joi.string().valid(...Object.values(BATTING_STYLES)).optional(),
      bowlingStyle: Joi.string().valid(...Object.values(BOWLING_STYLES)).optional(),
      city: Joi.string().max(100).optional().allow('', null),
      bio: Joi.string().max(500).optional().allow('', null)
    }).min(1).messages({ 'object.min': 'At least one field must be provided for update' })
  },
  getById: {
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
        .messages({ 'string.pattern.base': 'Invalid user ID format' })
    })
  },
  search: {
    query: Joi.object({
      q: Joi.string().min(2).max(50).required(),
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(50).optional()
    })
  }
};

// ============================================
// ROOM VALIDATORS
// ============================================
const roomValidators = {
  create: {
    body: Joi.object({
      name: Joi.string().min(3).max(100).trim().required(),
      matchFormat: Joi.string().valid(...Object.values(MATCH_FORMATS)).required(),
      totalOvers: Joi.number().integer().min(1).max(90).required(),
      teamAName: Joi.string().min(2).max(50).trim().required(),
      teamBName: Joi.string().min(2).max(50).trim().required(),
      venue: Joi.string().max(200).optional().allow(''),
      matchDate: Joi.date().optional(),
      maxPlayersPerTeam: Joi.number().integer().min(2).max(18).optional(),
      isPrivate: Joi.boolean().optional(),
      creatorRole: Joi.string().valid(...Object.values(ROOM_ROLES)).required()
    })
  },
  join: {
    params: Joi.object({
      roomCode: Joi.string().pattern(/^CRK-\d{4}$/).required()
        .messages({ 'string.pattern.base': 'Invalid room code format (expected CRK-XXXX)' })
    }),
    body: Joi.object({
      role: Joi.string().valid(...Object.values(ROOM_ROLES)).required()
    })
  },
  addPlayer: {
    body: Joi.object({
      team: Joi.string().valid('team_a', 'team_b').required(),
      playerType: Joi.string().valid(...Object.values(PLAYER_TYPES)).required(),
      userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).when('playerType', {
        is: PLAYER_TYPES.REGISTERED,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      name: Joi.string().min(2).max(100).trim().when('playerType', {
        is: PLAYER_TYPES.STATIC,
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
      playingRole: Joi.string().valid(...Object.values(PLAYING_ROLES)).optional(),
      battingStyle: Joi.string().valid(...Object.values(BATTING_STYLES)).optional(),
      bowlingStyle: Joi.string().valid(...Object.values(BOWLING_STYLES)).optional(),
      isCaptain: Joi.boolean().optional(),
      isWicketKeeper: Joi.boolean().optional()
    })
  },
  roomId: {
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
        .messages({ 'string.pattern.base': 'Invalid room ID format' })
    })
  }
};

// ============================================
// MATCH VALIDATORS
// ============================================
const matchValidators = {
  toss: {
    body: Joi.object({
      wonBy: Joi.string().valid('team_a', 'team_b').required(),
      decision: Joi.string().valid('bat', 'bowl').required()
    })
  },
  matchId: {
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
        .messages({ 'string.pattern.base': 'Invalid match ID format' })
    })
  }
};

// ============================================
// SCORING VALIDATORS
// ============================================
const scoringValidators = {
  recordBall: {
    body: Joi.object({
      matchId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      outcome: Joi.string().valid(...Object.values(DELIVERY_OUTCOMES)).required(),
      runs: Joi.number().integer().min(0).max(7).required(),
      extraRuns: Joi.number().integer().min(0).max(7).optional().default(0),
      strikerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      nonStrikerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      bowlerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      isWicket: Joi.boolean().optional().default(false),
      dismissalType: Joi.string().valid(...Object.values(DISMISSAL_TYPES)).when('isWicket', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional().allow(null)
      }),
      dismissedPlayerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).when('isWicket', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional().allow(null)
      }),
      fielderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null),
      commentary: Joi.string().max(500).optional().allow('', null)
    })
  },
  undoBall: {
    body: Joi.object({
      matchId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    })
  }
};

// ============================================
// FRIEND VALIDATORS
// ============================================
const friendValidators = {
  sendRequest: {
    body: Joi.object({
      recipientId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
        .messages({ 'string.pattern.base': 'Invalid user ID format' })
    })
  },
  respondRequest: {
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    }),
    body: Joi.object({
      action: Joi.string().valid('accept', 'reject').required()
    })
  }
};

// ============================================
// ADMIN VALIDATORS
// ============================================
const adminValidators = {
  updateUser: {
    params: Joi.object({
      id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    }),
    body: Joi.object({
      isActive: Joi.boolean().optional(),
      isBanned: Joi.boolean().optional(),
      role: Joi.string().valid('user', 'admin').optional()
    }).min(1)
  },
  listUsers: {
    query: Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
      search: Joi.string().max(50).optional().allow(''),
      role: Joi.string().valid('user', 'admin', 'super_admin').optional(),
      isActive: Joi.boolean().optional(),
      isBanned: Joi.boolean().optional(),
      sortBy: Joi.string().valid('createdAt', 'username', 'lastLogin').optional(),
      sortOrder: Joi.string().valid('asc', 'desc').optional()
    })
  },
  listMatches: {
    query: Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
      status: Joi.string().valid('not_started', 'in_progress', 'completed', 'abandoned').optional(),
      format: Joi.string().valid(...Object.values(MATCH_FORMATS)).optional(),
      sortBy: Joi.string().valid('createdAt', 'matchDate').optional(),
      sortOrder: Joi.string().valid('asc', 'desc').optional()
    })
  }
};

// ============================================
// SUBSCRIPTION VALIDATORS
// ============================================
const subscriptionValidators = {
  assignPlan: {
    body: Joi.object({
      userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      planSlug: Joi.string().valid('free', 'basic', 'pro', 'enterprise').required(),
      billingCycle: Joi.string().valid('monthly', 'annual', 'lifetime', 'free').default('monthly'),
      durationMonths: Joi.number().integer().min(1).max(24).default(1),
      notes: Joi.string().max(500).optional().allow(''),
      paymentRecord: Joi.object({
        amount: Joi.number().min(0).required(),
        currency: Joi.string().default('INR'),
        paymentMethod: Joi.string().optional(),
        transactionId: Joi.string().optional(),
        gateway: Joi.string().optional(),
        status: Joi.string().valid('success', 'failed', 'refunded', 'pending').default('success')
      }).optional()
    })
  }
};

// ============================================
// ENTERPRISE VALIDATORS
// ============================================
const enterpriseValidators = {
  create: {
    body: Joi.object({
      name: Joi.string().min(2).max(100).trim().required(),
      description: Joi.string().max(1000).optional().allow(''),
      type: Joi.string().valid('cricket_academy', 'club', 'school', 'college', 'corporate', 'state_association', 'district_association', 'other').default('cricket_academy'),
      contact: Joi.object({
        email: Joi.string().email().optional().allow(''),
        phone: Joi.string().optional().allow(''),
        website: Joi.string().uri().optional().allow('')
      }).optional(),
      address: Joi.object({
        street: Joi.string().optional().allow(''),
        city: Joi.string().optional().allow(''),
        state: Joi.string().optional().allow(''),
        country: Joi.string().optional().allow(''),
        pincode: Joi.string().optional().allow('')
      }).optional(),
      settings: Joi.object({
        isPublic: Joi.boolean().optional(),
        allowMemberInvites: Joi.boolean().optional(),
        joinRequiresApproval: Joi.boolean().optional()
      }).optional()
    })
  },
  addMember: {
    body: Joi.object({
      userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      role: Joi.string().valid('admin', 'coach', 'player', 'support_staff', 'viewer').default('player')
    })
  },
  updateMemberRole: {
    body: Joi.object({
      role: Joi.string().valid('admin', 'coach', 'player', 'support_staff', 'viewer').required()
    })
  }
};

// ============================================
// AD VALIDATORS
// ============================================
const adValidators = {
  create: {
    body: Joi.object({
      title: Joi.string().max(100).trim().required(),
      description: Joi.string().max(500).optional().allow(''),
      type: Joi.string().valid('banner', 'interstitial', 'native', 'video', 'popup').required(),
      placement: Joi.string().valid(
        'home_top', 'home_bottom', 'home_mid',
        'match_pre', 'match_between_overs', 'match_scorecard',
        'tools_page', 'profile_page', 'search_page',
        'leaderboard_page', 'tournament_page', 'room_list'
      ).required(),
      mediaUrl: Joi.string().uri().required(),
      thumbnailUrl: Joi.string().uri().optional().allow('', null),
      targetUrl: Joi.string().uri().required(),
      advertiser: Joi.object({
        name: Joi.string().max(100).required(),
        logo: Joi.string().uri().optional().allow('', null),
        contactEmail: Joi.string().email().optional().allow('', null)
      }).required(),
      targeting: Joi.object({
        cities: Joi.array().items(Joi.string()).optional(),
        planTypes: Joi.array().items(Joi.string().valid('free', 'basic')).optional(),
        playingRoles: Joi.array().items(Joi.string()).optional()
      }).optional(),
      schedule: Joi.object({
        startDate: Joi.date().required(),
        endDate: Joi.date().min(Joi.ref('startDate')).required(),
        startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
        endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
        daysOfWeek: Joi.array().items(Joi.number().min(0).max(6)).optional()
      }).required(),
      frequency: Joi.object({
        maxShowsPerUserPerDay: Joi.number().integer().min(1).optional(),
        minIntervalMinutes: Joi.number().integer().min(0).optional()
      }).optional(),
      priority: Joi.number().integer().min(1).max(10).optional(),
      budget: Joi.object({
        total: Joi.number().min(0).optional(),
        currency: Joi.string().optional()
      }).optional()
    })
  },
  review: {
    body: Joi.object({
      approve: Joi.boolean().required(),
      reason: Joi.string().max(300).optional().allow('')
    })
  }
};

// ============================================
// TOOL VALIDATORS (body validators for each tool)
// ============================================
const toolValidators = {
  crr: {
    body: Joi.object({
      runs: Joi.number().integer().min(0).required(),
      overs: Joi.number().min(0.1).required()
    })
  },
  rrr: {
    body: Joi.object({
      target: Joi.number().integer().min(1).required(),
      runsScored: Joi.number().integer().min(0).required(),
      oversCompleted: Joi.number().min(0).required(),
      totalOvers: Joi.number().integer().min(1).max(90).required()
    })
  }
};

module.exports = {
  authValidators,
  userValidators,
  roomValidators,
  matchValidators,
  scoringValidators,
  friendValidators,
  adminValidators,
  subscriptionValidators,
  enterpriseValidators,
  adValidators,
  toolValidators
};
