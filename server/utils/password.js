import bcrypt from 'bcryptjs';
import { AppError } from './AppError.js';

// Cost factor: bcrypt runs 2^12 internal rounds. ~250ms per hash - unnoticeable for one login,
// but it makes guessing billions of passwords from a stolen database impractically slow.
const BCRYPT_COST = 12;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

// Used when the email doesn't exist, so "unknown email" takes as long as "wrong password".
// Otherwise an attacker could time responses to find out which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

// Throws a 400 with a user-friendly message if the password is not acceptable.
export function validateNewPassword(password, email) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  // bcrypt only looks at the first 72 BYTES - anything after would be silently ignored.
  if (password.length > PASSWORD_MAX_LENGTH || Buffer.byteLength(password, 'utf8') > 72) {
    throw new AppError(400, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (password.trim().toLowerCase() === email) {
    throw new AppError(400, 'Password cannot be the same as your email address.');
  }
}

// bcrypt generates a random "salt" for every hash and stores it inside the result,
// so two users with the same password still get completely different hashes.
export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

// Always does the full (slow) comparison, even when there's no stored hash.
export async function verifyPassword(password, storedHash) {
  const matches = await bcrypt.compare(password, storedHash || DUMMY_HASH);
  return Boolean(storedHash) && matches;
}
