import { env } from '../config/env.js';
import { Otp } from '../models/Otp.js';
import { User } from '../models/User.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/emailService.js';
import { generateResetToken, hashResetToken, RESET_TOKEN_EXPIRY_MS, RESET_EMAIL_COOLDOWN_MS } from '../utils/resetToken.js';
import { AppError } from '../utils/AppError.js';
import { normalizeEmailInput } from '../utils/validateEmail.js';
import { AUTH_COOKIE_NAME, clearAuthCookie, setAuthCookie, verifyAuthToken } from '../utils/authToken.js';
import { hashPassword, validateNewPassword, verifyPassword, PASSWORD_MAX_LENGTH } from '../utils/password.js';
import {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  OTP_LENGTH,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_ATTEMPTS,
} from '../utils/otp.js';

// POST /api/auth/send-otp   body: { "email": "user@example.com" }
// POST /api/auth/resend-otp uses this same function: a resend IS a new send -
// new code, old one replaced, same 60s cooldown.
export async function sendOtp(req, res) {
  const email = normalizeEmailInput(req.body?.email);

  const otp = generateOtp();
  const now = Date.now();

  try {
    // Atomic "create or replace, but only if the cooldown has passed":
    // - no OTP for this email yet   -> upsert creates one
    // - OTP older than 60s          -> filter matches, it is replaced (old code stops working)
    // - OTP sent less than 60s ago  -> filter doesn't match, upsert tries to insert a second
    //                                  doc with the same email -> the unique index rejects it
    //                                  (error code 11000) -> cooldown error below
    // Doing this in ONE database operation means two simultaneous clicks can't both get through.
    await Otp.findOneAndUpdate(
      { email, createdAt: { $lte: new Date(now - OTP_RESEND_COOLDOWN_MS) } },
      {
        email,
        otpHash: hashOtp(email, otp),
        expiresAt: new Date(now + OTP_EXPIRY_MS),
        attempts: 0,
        createdAt: new Date(now),
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      const existing = await Otp.findOne({ email }).select('createdAt').lean();
      const waitMs = existing ? existing.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS - now : 0;
      throw new AppError(429, 'Please wait before requesting another OTP.', {
        retryAfter: Math.max(1, Math.ceil(waitMs / 1000)),
      });
    }
    throw err;
  }

  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    // Email failed: remove the code we just stored so the user isn't stuck in a cooldown
    // for an email they never received. Log the SMTP error (never the OTP) for debugging.
    await Otp.deleteOne({ email });
    console.error('Failed to send OTP email:', err.code || '', err.message);
    throw new AppError(503, 'We could not send the verification email. Please try again in a moment.');
  }

  // Note: the OTP is NOT in this response - only the user's inbox ever sees it.
  res.json({
    message: 'OTP sent successfully.',
    resendAvailableIn: OTP_RESEND_COOLDOWN_MS / 1000,
  });
}

// POST /api/auth/verify-otp   body: { "email": "user@example.com", "otp": "123456" }
export async function verifyOtp(req, res) {
  const email = normalizeEmailInput(req.body?.email);
  const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';

  // Exactly 6 digits, nothing else. Rejects garbage before it touches the database.
  if (otp.length !== OTP_LENGTH || !/^\d+$/.test(otp)) {
    throw new AppError(400, `Please enter the ${OTP_LENGTH}-digit code.`);
  }

  // Use up one attempt FIRST, atomically, and only if the code is still usable.
  // If we instead read "attempts", compared, then wrote "attempts + 1", an attacker could fire
  // 100 guesses at the same moment: all would read attempts = 0 and all would be checked.
  const record = await Otp.findOneAndUpdate(
    { email, attempts: { $lt: OTP_MAX_ATTEMPTS }, expiresAt: { $gt: new Date() } },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  );

  if (!record) {
    // The update matched nothing - look up the record to tell the user WHY.
    const existing = await Otp.findOne({ email }).lean();
    if (!existing) {
      // Never requested, already used, or expired and removed by the TTL index.
      throw new AppError(400, 'OTP expired or not found. Please request a new code.');
    }
    if (existing.expiresAt <= new Date()) {
      await Otp.deleteOne({ _id: existing._id });
      throw new AppError(400, 'OTP expired. Please request a new code.');
    }
    throw new AppError(429, 'Too many attempts. Please request a new code.');
  }

  if (!verifyOtpHash(email, otp, record.otpHash)) {
    const attemptsRemaining = OTP_MAX_ATTEMPTS - record.attempts;
    if (attemptsRemaining <= 0) {
      throw new AppError(429, 'Too many attempts. Please request a new code.');
    }
    throw new AppError(400, 'Invalid verification code.', { attemptsRemaining });
  }

  // Correct code. Delete it so it can never be used again (one-time password).
  // Checking deletedCount guards against two simultaneous requests with the same correct code:
  // only the one that actually deleted it wins.
  const { deletedCount } = await Otp.deleteOne({ _id: record._id, otpHash: record.otpHash });
  if (deletedCount !== 1) {
    throw new AppError(400, 'OTP expired or not found. Please request a new code.');
  }

  // First login creates the user; later logins update it. ("upsert" = update or insert)
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { emailVerified: true, lastLoginAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );

  // Log them in: signed JWT in an HTTP-only cookie. The token is NOT in the JSON body,
  // so frontend JavaScript never touches it.
  setAuthCookie(res, user, 'otp');

  res.json({
    message: 'Email verified successfully.',
    user: publicUser(user),
  });
}

// POST /api/auth/login   body: { "email": "user@example.com", "password": "..." }
export async function login(req, res) {
  const email = normalizeEmailInput(req.body?.email);
  const password = req.body?.password;

  if (typeof password !== 'string' || password.length === 0 || password.length > PASSWORD_MAX_LENGTH) {
    throw new AppError(400, 'Please enter your password.');
  }

  // passwordHash has select: false in the model, so we must ask for it explicitly here.
  const user = await User.findOne({ email }).select('+passwordHash');

  // Runs the slow bcrypt comparison even if the user doesn't exist (see utils/password.js).
  const passwordOk = await verifyPassword(password, user?.passwordHash);

  // ONE message for "no such account", "no password set yet" and "wrong password".
  // Different messages would tell an attacker which emails are registered here.
  if (!user || !user.emailVerified || !passwordOk) {
    throw new AppError(401, 'Invalid email or password.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  setAuthCookie(res, user, 'password');
  res.json({ message: 'Signed in successfully.', user: publicUser(user) });
}

// How long after signing in with an email code the user may replace an existing password.
const PASSWORD_RESET_WINDOW_SECONDS = 10 * 60;

// POST /api/auth/set-password   body: { "password": "..." }   (requireAuth runs first)
// - First time (just signed up): creates the password.
// - Already has one: only allowed right after signing in with an email code ("forgot password").
//   Otherwise someone with a stolen cookie could lock the real owner out by changing it.
export async function setPassword(req, res) {
  const user = req.user;
  const signedInWithCodeRecently =
    req.auth.method === 'otp' && Date.now() / 1000 - req.auth.iat < PASSWORD_RESET_WINDOW_SECONDS;

  if (user.passwordSetAt && !signedInWithCodeRecently) {
    throw new AppError(403, 'To change your password, sign in with an email code first.');
  }

  const password = req.body?.password;
  validateNewPassword(password, user.email);

  user.passwordHash = await hashPassword(password);
  user.passwordSetAt = new Date();
  // Sign out every other device/session: if the password was reset because of a breach,
  // old sessions shouldn't survive it.
  user.tokenVersion += 1;
  await user.save();

  // ...but keep THIS browser signed in with a fresh token.
  setAuthCookie(res, user, 'password');
  res.json({ message: 'Password saved.', user: publicUser(user) });
}

const FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password. Check your inbox.";

// POST /api/auth/forgot-password   body: { "email": "user@example.com" }
export async function forgotPassword(req, res) {
  const email = normalizeEmailInput(req.body?.email);

  // Answer IMMEDIATELY with the same message whether or not the account exists.
  // If we waited for the email to send (2-3 seconds) only for real accounts, an attacker could
  // tell registered emails apart just by timing the response.
  res.json({ message: FORGOT_PASSWORD_MESSAGE });

  // The work continues after the response has gone out. Errors can no longer reach the user,
  // so they are caught and logged here.
  try {
    await sendResetLinkIfAccountExists(email);
  } catch (err) {
    console.error('Password reset email failed:', err.code || '', err.message);
  }
}

async function sendResetLinkIfAccountExists(email) {
  const user = await User.findOne({ email, emailVerified: true });
  if (!user) return; // no account: silently do nothing

  // Cooldown: at most one reset email per minute per account (stops someone flooding an inbox).
  // Silent too - telling the requester "please wait" would reveal that the account exists.
  const existing = await PasswordReset.findOne({ userId: user._id }).lean();
  if (existing && Date.now() - existing.createdAt.getTime() < RESET_EMAIL_COOLDOWN_MS) return;

  const token = generateResetToken();
  // Replace any previous link for this user: only the newest link works.
  await PasswordReset.findOneAndReplace(
    { userId: user._id },
    {
      userId: user._id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
      createdAt: new Date(),
    },
    { upsert: true }
  );

  // The token goes after "#" (the URL "fragment"). Browsers never send the fragment to any
  // server - so it won't appear in hosting logs or analytics when the reset page loads.
  const resetUrl = `${env.clientUrl}/reset-password#token=${token}`;
  await sendPasswordResetEmail(user.email, resetUrl, RESET_TOKEN_EXPIRY_MS / 60000);
}

// POST /api/auth/reset-password   body: { "token": "<from the email link>", "password": "..." }
export async function resetPassword(req, res) {
  const token = req.body?.token;
  // Must look like our tokens (64 hex chars) before we touch the database.
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new AppError(400, 'This reset link is invalid. Please request a new one.');
  }

  const tokenHash = hashResetToken(token);
  const reset = await PasswordReset.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean();
  if (!reset) {
    throw new AppError(400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  const user = await User.findById(reset.userId);
  if (!user) {
    throw new AppError(400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  // Check the new password BEFORE using up the link, so a typo doesn't waste it.
  const password = req.body?.password;
  validateNewPassword(password, user.email);

  // Use up the link: delete it. If two requests race with the same link, only one deletes it.
  const { deletedCount } = await PasswordReset.deleteOne({ _id: reset._id, tokenHash });
  if (deletedCount !== 1) {
    throw new AppError(400, 'This reset link has already been used. Please request a new one.');
  }

  user.passwordHash = await hashPassword(password);
  user.passwordSetAt = new Date();
  user.lastLoginAt = new Date();
  // Sign out everywhere else - if someone else had access to the account, they lose it now.
  user.tokenVersion += 1;
  await user.save();

  // Clicking the emailed link proved they own the inbox, so sign them in right away.
  setAuthCookie(res, user, 'password');
  res.json({ message: 'Your password has been reset.', user: publicUser(user) });
}

// GET /api/auth/me   (requireAuth runs first and puts the logged-in user on req.user)
export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

// POST /api/auth/logout
export async function logout(req, res) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (token) {
    try {
      const payload = verifyAuthToken(token);
      // Bump tokenVersion: this token - and any copy of it - is now rejected by requireAuth.
      await User.updateOne({ _id: payload.sub, tokenVersion: payload.ver }, { $inc: { tokenVersion: 1 } });
    } catch {
      // Invalid or expired token: nothing to revoke. Still clear the cookie below.
    }
  }

  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully.' });
}

// Only the fields the frontend needs - never internal ones like tokenVersion or passwordHash.
function publicUser(user) {
  return { email: user.email, emailVerified: user.emailVerified, hasPassword: Boolean(user.passwordSetAt) };
}
