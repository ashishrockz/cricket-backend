module.exports = {
  // User Roles
  ROLES: {
    USER: 'user',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin'
  },

  // Room Roles
  ROOM_ROLES: {
    TEAM_A_MANAGER: 'team_a_manager',
    TEAM_B_MANAGER: 'team_b_manager',
    SCORER: 'scorer'
  },

  // Room Status
  ROOM_STATUS: {
    WAITING: 'waiting',
    READY: 'ready',
    LIVE: 'live',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Match Status
  MATCH_STATUS: {
    NOT_STARTED: 'not_started',
    TOSS: 'toss',
    IN_PROGRESS: 'in_progress',
    INNINGS_BREAK: 'innings_break',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned',
    DRAW: 'draw'
  },

  // Match Formats
  MATCH_FORMATS: {
    T10: 'T10',
    T20: 'T20',
    ODI: 'ODI',
    TEST: 'TEST',
    CUSTOM: 'CUSTOM'
  },

  // Player Types
  PLAYER_TYPES: {
    STATIC: 'static',
    REGISTERED: 'registered'
  },

  // Playing Roles
  PLAYING_ROLES: {
    BATSMAN: 'batsman',
    BOWLER: 'bowler',
    ALL_ROUNDER: 'all_rounder',
    WICKET_KEEPER: 'wicket_keeper'
  },

  // Batting Styles
  BATTING_STYLES: {
    RIGHT_HAND: 'right_hand',
    LEFT_HAND: 'left_hand'
  },

  // Bowling Styles
  BOWLING_STYLES: {
    RIGHT_ARM_FAST: 'right_arm_fast',
    RIGHT_ARM_MEDIUM: 'right_arm_medium',
    LEFT_ARM_FAST: 'left_arm_fast',
    LEFT_ARM_MEDIUM: 'left_arm_medium',
    RIGHT_ARM_SPIN: 'right_arm_spin',
    LEFT_ARM_SPIN: 'left_arm_spin',
    RIGHT_ARM_OFF_BREAK: 'right_arm_off_break',
    LEFT_ARM_ORTHODOX: 'left_arm_orthodox',
    NONE: 'none'
  },

  // Delivery Outcomes
  DELIVERY_OUTCOMES: {
    NORMAL: 'normal',
    WIDE: 'wide',
    NO_BALL: 'no_ball',
    BYE: 'bye',
    LEG_BYE: 'leg_bye',
    WICKET: 'wicket',
    DEAD_BALL: 'dead_ball'
  },

  // Dismissal Types
  DISMISSAL_TYPES: {
    BOWLED: 'bowled',
    CAUGHT: 'caught',
    LBW: 'lbw',
    RUN_OUT: 'run_out',
    STUMPED: 'stumped',
    HIT_WICKET: 'hit_wicket',
    CAUGHT_AND_BOWLED: 'caught_and_bowled',
    RETIRED_HURT: 'retired_hurt',
    RETIRED_OUT: 'retired_out',
    TIMED_OUT: 'timed_out',
    HIT_THE_BALL_TWICE: 'hit_the_ball_twice',
    OBSTRUCTING_THE_FIELD: 'obstructing_the_field'
  },

  // Friend Request Status
  FRIEND_STATUS: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    BLOCKED: 'blocked'
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },

  // Socket Events
  SOCKET_EVENTS: {
    // Connection
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',

    // Room Events
    JOIN_ROOM: 'join_room',
    LEAVE_ROOM: 'leave_room',
    ROOM_UPDATED: 'room_updated',
    ROOM_USER_JOINED: 'room_user_joined',
    ROOM_USER_LEFT: 'room_user_left',

    // Scoring Events
    BALL_UPDATE: 'ball_update',
    OVER_COMPLETE: 'over_complete',
    WICKET_FALLEN: 'wicket_fallen',
    INNINGS_COMPLETE: 'innings_complete',
    MATCH_COMPLETE: 'match_complete',
    SCORE_UPDATE: 'score_update',
    UNDO_BALL: 'undo_ball',
    STRIKE_ROTATE: 'strike_rotate',
    RECORD_BALL: 'record_ball',
    SELECT_BATSMAN: 'select_batsman',

    // Live View Events
    REQUEST_LIVE_SCORE: 'request_live_score',
    LIVE_SCORE_DATA: 'live_score_data',

    // Chat & Reactions
    MATCH_CHAT: 'match_chat',
    MATCH_REACTION: 'match_reaction',

    // Error
    ERROR: 'error',

    // Admin real-time events
    ADMIN_NEW_USER: 'admin:new_user',
    ADMIN_MATCH_STARTED: 'admin:match_started',
    ADMIN_MATCH_COMPLETED: 'admin:match_completed',
    ADMIN_STATS_UPDATE: 'admin:stats_update'
  }
};
