const router = require('express').Router();
const {
  register, login,
  requestOTP, verifyOTP, resetPassword,
  refreshAccessToken, changePassword, logout, getMe
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { authValidators } = require('../validators');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication — password-based and OTP-based
 */

// ─── Password-based auth ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterInput'
 *     responses:
 *       201:
 *         description: Registration successful
 *       409:
 *         description: Email or username already exists
 */
router.post('/register', validate(authValidators.register), register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with email + password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(authValidators.login), login);

// ─── OTP-based auth ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/otp/request:
 *   post:
 *     summary: Request an email OTP (login, register_verify, password_reset)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               purpose:
 *                 type: string
 *                 enum: [login, register_verify, password_reset, email_change]
 *                 default: login
 *     responses:
 *       200:
 *         description: OTP sent if account exists
 *       429:
 *         description: Rate limited — wait 60 seconds
 */
router.post('/otp/request', validate(authValidators.requestOTP), requestOTP);

/**
 * @swagger
 * /api/v1/auth/otp/verify:
 *   post:
 *     summary: Verify email OTP to login or complete action
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *               purpose:
 *                 type: string
 *                 enum: [login, register_verify, password_reset, email_change]
 *                 default: login
 *     responses:
 *       200:
 *         description: OTP verified — returns tokens (login) or resetToken (password_reset)
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/otp/verify', validate(authValidators.verifyOTP), verifyOTP);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password using OTP-issued reset token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *       401:
 *         description: Invalid or expired reset token
 */
router.post('/reset-password', validate(authValidators.resetPassword), resetPassword);

// ─── Token management ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh access token using refresh token
 *     tags: [Authentication]
 */
router.post('/refresh-token', validate(authValidators.refreshToken), refreshAccessToken);

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   put:
 *     summary: Change password (requires authentication)
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 */
router.put('/change-password', authenticate, validate(authValidators.changePassword), changePassword);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user (invalidates refresh token)
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 */
router.post('/logout', authenticate, logout);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current authenticated user with subscription and enterprise info
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 */
router.get('/me', authenticate, getMe);

module.exports = router;
