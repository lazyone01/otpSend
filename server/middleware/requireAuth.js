import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { AUTH_COOKIE_NAME, clearAuthCookie, verifyAuthToken } from '../utils/authToken.js';

// Put this in front of any route that needs a logged-in user:
//   router.get('/me', requireAuth, me)
// It either calls next() with req.user set, or stops the request with 401.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME]; // cookie-parser turned the Cookie header into req.cookies

  if (!token) {
    throw new AppError(401, 'Not authenticated.');
  }

  let payload;
  try {
    // Checks the signature (was it made with OUR secret, unmodified?) and the expiry.
    payload = verifyAuthToken(token);
  } catch {
    clearAuthCookie(res); // tell the browser to drop the bad cookie
    throw new AppError(401, 'Session expired. Please sign in again.');
  }

  // Signature is valid - but does the user still exist, and has this token been revoked by logout?
  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.ver) {
    clearAuthCookie(res);
    throw new AppError(401, 'Session expired. Please sign in again.');
  }

  req.user = user; // available to the route handler that runs next
  req.auth = payload; // token details (e.g. method, iat) for routes that need them
  next();
}
