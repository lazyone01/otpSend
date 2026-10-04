import 'dotenv/config';

// Values pasted into hosting dashboards often pick up an invisible trailing space or line break.
// Those break things in confusing ways (e.g. an invalid HTTP header), so strip them everywhere.
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string' && value !== value.trim()) {
    process.env[key] = value.trim();
  }
}

// Fail fast: if a required variable is missing, crash at startup with a clear message
// instead of failing mysteriously later in the middle of a request.
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// CLIENT_URL must be exactly an origin: scheme + host (+ port), nothing else.
// Browsers compare it character by character with the Origin header (CORS, CSRF check).
function readClientUrl() {
  // Trailing slash removed: browsers send "https://app.com" as the Origin, never "https://app.com/".
  const value = (process.env.CLIENT_URL || 'http://localhost:5174').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CLIENT_URL is not a valid URL: ${JSON.stringify(value)}`);
  }
  if (url.origin !== value) {
    throw new Error(
      `CLIENT_URL must be only the site address, like https://your-app.vercel.app (got ${JSON.stringify(value)})`
    );
  }
  return value;
}

function oneOf(name, allowed, fallback) {
  const value = (process.env[name] || fallback).toLowerCase();
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')} (got "${value}")`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

// How emails leave the server:
// - "smtp":  Nodemailer -> any SMTP server (Gmail, Brevo SMTP, ...). Simple, great for development.
// - "brevo": Brevo's HTTPS API. Works on hosts that block outgoing SMTP ports (e.g. some free tiers).
const emailProvider = oneOf('EMAIL_PROVIDER', ['smtp', 'brevo'], 'smtp');

// Central place to read environment variables.
// Every other file imports from here instead of touching process.env directly.
export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  clientUrl: readClientUrl(),
  // Number of proxies in front of the app (Render/Railway: 1). 0 locally - nothing in front of us.
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : isProduction ? 1 : 0,
  // "lax" when the browser sees frontend and API as the SAME site (local dev, or the Vercel /api proxy).
  // "none" only when the frontend calls the API on a different site directly (needs HTTPS;
  // Safari blocks such third-party cookies, which is why the proxy setup is recommended).
  cookieSameSite: oneOf('COOKIE_SAMESITE', ['lax', 'none', 'strict'], 'lax'),
  mongodbUri: required('MONGODB_URI'),
  otpSecret: required('OTP_SECRET'),
  emailProvider,
  smtp:
    emailProvider === 'smtp'
      ? {
          host: required('SMTP_HOST'),
          port: Number(required('SMTP_PORT')),
          user: required('SMTP_USER'),
          password: required('SMTP_PASSWORD'),
        }
      : null,
  brevoApiKey: emailProvider === 'brevo' ? required('BREVO_API_KEY') : null,
  emailFrom: required('EMAIL_FROM'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

// A short secret can be brute-forced: anyone who guesses it can forge login tokens for any user.
for (const [name, value] of [['OTP_SECRET', env.otpSecret], ['JWT_SECRET', env.jwtSecret]]) {
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters long`);
  }
}

// Browsers reject SameSite=None cookies that aren't Secure, and Secure needs HTTPS (production).
if (env.cookieSameSite === 'none' && !env.isProduction) {
  throw new Error('COOKIE_SAMESITE=none only works in production over HTTPS');
}

// Production must use the real public frontend URL - it's used for CORS and in reset-email links.
if (env.isProduction && !env.clientUrl.startsWith('https://')) {
  throw new Error('In production, CLIENT_URL must be your https:// frontend URL');
}
