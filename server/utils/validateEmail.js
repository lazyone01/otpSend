import validator from 'validator';
import { AppError } from './AppError.js';

// Returns a clean, lowercase email or throws a 400 error.
export function normalizeEmailInput(value) {
  // Must be a plain string. This also blocks NoSQL injection like { "email": { "$ne": null } },
  // which would otherwise be passed straight into a MongoDB query.
  if (typeof value !== 'string') {
    throw new AppError(400, 'Please enter a valid email address.');
  }

  const email = value.trim().toLowerCase();

  if (email.length > 254 || !validator.isEmail(email)) {
    throw new AppError(400, 'Please enter a valid email address.');
  }

  return email;
}
