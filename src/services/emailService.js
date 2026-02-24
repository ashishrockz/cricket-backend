const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transporter = null;

/**
 * Initialize the nodemailer transporter lazily
 */
const getTransporter = () => {
  if (transporter) return transporter;

  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  transporter = nodemailer.createTransport(smtpConfig);
  return transporter;
};

/**
 * Send a raw email
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('Email service: SMTP credentials not configured, skipping email send');
    return { success: false, reason: 'SMTP not configured' };
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"${process.env.APP_NAME || 'CricketScore'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text
    });

    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Email send failed to ${to}: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

/**
 * Send OTP email for login / verification
 */
const sendOTPEmail = async ({ email, otp, purpose, userName }) => {
  const purposeLabels = {
    login: 'Login',
    register_verify: 'Email Verification',
    password_reset: 'Password Reset',
    email_change: 'Email Change Confirmation'
  };

  const label = purposeLabels[purpose] || 'Verification';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${label} OTP</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #1a472a 0%, #2d6a4f 100%); padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; letter-spacing: 1px; }
    .header p { color: #a8d5b5; margin: 6px 0 0; font-size: 13px; }
    .body { padding: 32px; }
    .body p { color: #444; font-size: 15px; line-height: 1.6; }
    .otp-box { background: #f0f7f2; border: 2px dashed #2d6a4f; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0; }
    .otp-code { font-size: 44px; font-weight: 900; letter-spacing: 12px; color: #1a472a; font-family: 'Courier New', monospace; }
    .otp-note { font-size: 12px; color: #888; margin-top: 8px; }
    .footer { background: #f9f9f9; border-top: 1px solid #eee; padding: 16px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #aaa; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏏 CricketScore</h1>
      <p>${label} Request</p>
    </div>
    <div class="body">
      <p>Hi ${userName || 'there'},</p>
      <p>You requested a <strong>${label}</strong> OTP. Use the code below to proceed:</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <div class="otp-note">Valid for <strong>10 minutes</strong> &bull; Do not share this code</div>
      </div>
      <p>If you didn't request this, please ignore this email or <a href="mailto:support@cricketScore.com">contact support</a> immediately.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} CricketScore. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `Your ${label} OTP is: ${otp}\n\nValid for 10 minutes. Do not share this code.`;

  return sendEmail({
    to: email,
    subject: `[CricketScore] Your ${label} OTP: ${otp}`,
    html,
    text
  });
};

/**
 * Send welcome email after registration
 */
const sendWelcomeEmail = async ({ email, userName }) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a472a, #2d6a4f); padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .body { padding: 32px; }
    .body p { color: #444; font-size: 15px; line-height: 1.6; }
    .feature { display: flex; align-items: flex-start; margin-bottom: 12px; }
    .feature .icon { font-size: 20px; margin-right: 10px; }
    .cta { display: inline-block; background: #2d6a4f; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; margin-top: 16px; font-size: 15px; }
    .footer { background: #f9f9f9; border-top: 1px solid #eee; padding: 16px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #aaa; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏏 Welcome to CricketScore!</h1>
    </div>
    <div class="body">
      <p>Hi <strong>${userName}</strong>,</p>
      <p>Welcome aboard! Your account is ready. Here's what you can do:</p>
      <div class="feature"><span class="icon">🎯</span><span>Score matches ball-by-ball in real time</span></div>
      <div class="feature"><span class="icon">🏆</span><span>Create and manage tournaments</span></div>
      <div class="feature"><span class="icon">📊</span><span>Track your career statistics</span></div>
      <div class="feature"><span class="icon">🤝</span><span>Connect with friends and teams</span></div>
      <div class="feature"><span class="icon">🔧</span><span>Use cricket calculators and tools (upgrade required)</span></div>
      <p>Get started with the app today!</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} CricketScore. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({
    to: email,
    subject: '🏏 Welcome to CricketScore!',
    html,
    text: `Hi ${userName}, welcome to CricketScore! Start scoring matches and tracking your career stats.`
  });
};

/**
 * Send subscription confirmation email
 */
const sendSubscriptionEmail = async ({ email, userName, planName, endDate }) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a472a, #2d6a4f); padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .body { padding: 32px; }
    .body p { color: #444; font-size: 15px; line-height: 1.6; }
    .plan-box { background: #f0f7f2; border-left: 4px solid #2d6a4f; padding: 16px 20px; border-radius: 4px; margin: 16px 0; }
    .plan-name { font-size: 20px; font-weight: bold; color: #1a472a; }
    .footer { background: #f9f9f9; border-top: 1px solid #eee; padding: 16px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #aaa; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Subscription Confirmed</h1>
    </div>
    <div class="body">
      <p>Hi <strong>${userName}</strong>,</p>
      <p>Your subscription has been activated successfully.</p>
      <div class="plan-box">
        <div class="plan-name">${planName} Plan</div>
        ${endDate ? `<p style="margin:4px 0;color:#555;">Valid until: <strong>${new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>` : '<p style="margin:4px 0;color:#555;">Lifetime access</p>'}
      </div>
      <p>Enjoy your enhanced CricketScore experience!</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} CricketScore. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({
    to: email,
    subject: `✅ CricketScore ${planName} Plan Activated`,
    html,
    text: `Hi ${userName}, your ${planName} plan has been activated. ${endDate ? `Valid until ${new Date(endDate).toLocaleDateString()}` : 'Lifetime access.'}`
  });
};

module.exports = { sendEmail, sendOTPEmail, sendWelcomeEmail, sendSubscriptionEmail };
