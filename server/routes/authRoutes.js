import { Router } from 'express';
import {
  sendOtp,
  verifyOtp,
  login,
  forgotPassword,
  resetPassword,
  setPassword,
  me,
  logout,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  sendOtpIpLimiter,
  sendOtpEmailLimiter,
  verifyOtpLimiter,
  loginIpLimiter,
  loginEmailLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from '../middleware/rateLimiters.js';

// A Router is a mini-app: a group of routes mounted under a common prefix (/api/auth in app.js).
// Middleware listed before the handler runs first, left to right: limiters -> (auth) -> handler.
const router = Router();

// Sign up / sign in with an email code
router.post('/send-otp', sendOtpIpLimiter, sendOtpEmailLimiter, sendOtp);
router.post('/resend-otp', sendOtpIpLimiter, sendOtpEmailLimiter, sendOtp); // same logic as send-otp
router.post('/verify-otp', verifyOtpLimiter, verifyOtp);

// Sign in with a password (only after the account was created via email code)
router.post('/login', loginIpLimiter, loginEmailLimiter, login);

// Forgot password: email a one-time link, then set a new password with it
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

// Protected: requireAuth runs first; the handler only runs if the user is logged in.
router.post('/set-password', requireAuth, setPassword);
router.get('/me', requireAuth, me);

// Not protected: logging out with an expired/missing cookie should still succeed.
router.post('/logout', logout);

export default router;
