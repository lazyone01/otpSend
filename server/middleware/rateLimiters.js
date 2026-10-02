import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Rate limiting = "at most N requests per time window". Each limiter counts requests per KEY:
// - per IP address: stops one machine from hammering us
// - per email: stops many machines from targeting ONE account or inbox
//
// Counts are kept in this server's memory: fine for one server instance, reset on restart.
// If you ever run several instances, switch to a shared store (Redis / MongoDB) so they agree.
function limiter({ windowMs, limit, message, key = 'ip', skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests, // true = only failed requests (status >= 400) count
    standardHeaders: 'draft-8', // send RateLimit + Retry-After headers so clients know when to retry
    legacyHeaders: false,
    keyGenerator: key === 'email' ? emailKey : (req) => ipKeyGenerator(req.ip),
    // 429 Too Many Requests, in the same { message } shape as all our other errors.
    message: { message },
  });
}

// Key by the email in the request body (express.json() already parsed it).
// Falls back to the IP when there's no usable email, so junk requests still get limited.
function emailKey(req) {
  const email = req.body?.email;
  return typeof email === 'string' && email.trim()
    ? `email:${email.trim().toLowerCase()}`
    : `ip:${ipKeyGenerator(req.ip)}`;
}

// Safety net for every /api request: generous enough that normal use never hits it.
export const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: 'Too many requests. Please slow down and try again in a few minutes.',
});

// Sending OTP emails costs money/reputation and can be used to spam someone's inbox.
export const sendOtpIpLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Too many verification codes requested. Please try again later.',
});
export const sendOtpEmailLimiter = limiter({
  windowMs: HOUR,
  limit: 5,
  key: 'email',
  message: 'Too many verification codes requested for this email. Please try again later.',
});

// Each OTP already allows only 5 guesses; this stops guessing across many fresh codes/emails.
export const verifyOtpLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  message: 'Too many verification attempts. Please try again later.',
});

// Password guessing. Only FAILED logins count, so a user who signs in normally is never blocked.
export const loginIpLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts. Please try again in 15 minutes.',
});
export const loginEmailLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  key: 'email',
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts for this account. Try again in 15 minutes, or reset your password.',
});

// Reset emails are already limited to 1/minute per account (silently); this caps one IP
// spraying requests at many different addresses.
export const forgotPasswordLimiter = limiter({
  windowMs: HOUR,
  limit: 5,
  message: 'Too many password reset requests. Please try again later.',
});

export const resetPasswordLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Too many attempts. Please try again later.',
});
