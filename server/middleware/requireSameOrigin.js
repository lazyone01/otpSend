import { env } from '../config/env.js';

// CSRF protection ("cross-site request forgery").
// The danger: you're logged in, then visit evil.com, which secretly submits a form to OUR API.
// The browser would attach your login cookie automatically, and the request would run as you.
//
// Browsers add an Origin header to every cross-site POST, saying which site the request came from,
// and a web page cannot fake it. So for anything that changes data, we reject other origins.
// Requests with no Origin (curl, server-to-server) are allowed: they don't carry a victim's cookies.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (SAFE_METHODS.has(req.method) || !origin || origin === env.clientUrl) {
    return next();
  }
  res.status(403).json({ message: 'Request blocked: unexpected origin.' });
}
