import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'token';

// Cookie settings - used for BOTH setting and clearing the cookie (they must match to clear it).
function cookieOptions() {
  return {
    httpOnly: true, // JavaScript in the page cannot read it -> XSS can't steal the token
    secure: env.isProduction, // only sent over HTTPS (localhost is plain HTTP, so off in dev)
    // "lax": sent on same-site requests (localhost:5174 -> localhost:5000 counts as same-site,
    // and so does the Vercel /api proxy in production). See COOKIE_SAMESITE in config/env.js.
    sameSite: env.cookieSameSite,
    path: '/',
  };
}

// Sign a JWT for this user and hand it to the browser as an HTTP-only cookie.
// method: how they proved who they are - 'otp' (email code) or 'password'.
export function setAuthCookie(res, user, method) {
  // The payload is readable by anyone (it's only base64) - so put IDs in it, never secrets.
  // sub = "subject" = who this token is about. ver = the user's tokenVersion (see User model).
  const token = jwt.sign({ sub: user._id.toString(), ver: user.tokenVersion, method }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });

  // Cookie expires at the same moment as the token inside it.
  const { exp } = jwt.decode(token);
  res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions(), expires: new Date(exp * 1000) });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions());
}

// Returns the payload if the signature is valid and the token hasn't expired; throws otherwise.
// Pinning the algorithm stops attacks that swap it (e.g. to "none") in a forged token's header.
export function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}
