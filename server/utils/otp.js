import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const OTP_MAX_ATTEMPTS = 5;

// Step 6: generate a cryptographically secure 6-digit code.
// crypto.randomInt uses the operating system's secure random source,
// so codes cannot be predicted from previous codes (unlike Math.random()).
export function generateOtp() {
  // 0..999999, padded so 42 becomes "000042" - every code is exactly 6 digits.
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

// Step 7: hash the code before storing it.
// HMAC-SHA256 = a hash that also mixes in a secret key (OTP_SECRET) only the server knows.
// We include the email so a hash for one user can't be reused for another.
export function hashOtp(email, otp) {
  return crypto.createHmac('sha256', env.otpSecret).update(`${email}:${otp}`).digest('hex');
}

// Compare a submitted code with the stored hash.
// timingSafeEqual takes the same time whether the first or last character differs,
// so an attacker can't learn anything by measuring response times.
export function verifyOtpHash(email, otp, storedHash) {
  const submitted = Buffer.from(hashOtp(email, otp), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return submitted.length === stored.length && crypto.timingSafeEqual(submitted, stored);
}
