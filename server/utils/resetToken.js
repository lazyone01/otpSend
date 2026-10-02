import crypto from 'node:crypto';

export const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const RESET_EMAIL_COOLDOWN_MS = 60 * 1000; // 60 seconds between reset emails

// 32 random bytes = 256 bits -> 64 hex characters. There are more possible tokens than atoms
// in the universe, so unlike a 6-digit OTP it can't be guessed - no attempt counter needed.
export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Stored as a hash, for the same reason as the OTP: a leaked database must not contain usable links.
// Plain SHA-256 is enough here (no secret, no bcrypt): hashing is only slow-to-crack when the input
// is guessable (a 6-digit code, a human password). A 256-bit random token isn't.
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
