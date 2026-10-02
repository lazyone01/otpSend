// Automated API test - run with:  npm run test:api
//
// Starts its own copy of the app on a random free port (fresh rate-limit counters every run,
// and your dev server is left alone), using the MongoDB database from .env.
//
// It cannot read your inbox, so where a real code/link is needed it stores a KNOWN one directly
// in the database (hashed exactly like the real thing) and then calls the real HTTP endpoints.
// Only throwaway apitest-...@example.com accounts are created, and they're deleted at the end.
// No emails are sent. Test 1 (a real email arriving) is a manual check - see TESTING.md.
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { hashOtp } from '../utils/otp.js';
import { generateResetToken, hashResetToken } from '../utils/resetToken.js';

if (env.isProduction) {
  console.error('Refusing to run: NODE_ENV is production. This script writes test data to the database.');
  process.exit(1);
}

const RUN_ID = Date.now().toString(36);
const TEST_EMAIL_PATTERN = /^apitest-.*@example\.com$/;
const testEmail = (name) => `apitest-${name}-${RUN_ID}@example.com`;

// ---------- tiny test helpers ----------
let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n${title}`);
}

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✘ ${name}${detail ? `\n      got: ${detail}` : ''}`);
  }
}

let baseUrl;

// Calls the API like the browser does (Origin = our frontend), optionally with a login cookie.
async function api(path, { method = 'GET', body, cookie, origin = env.clientUrl, rawBody } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (body || rawBody) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = `token=${cookie}`;

  const res = await fetch(baseUrl + path, { method, headers, body: rawBody ?? (body && JSON.stringify(body)) });
  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    headers: res.headers,
    json: await res.json().catch(() => ({})),
    cookie: setCookie?.match(/token=([^;]*)/)?.[1],
    setCookie,
  };
}

const show = (r) => `${r.status} ${JSON.stringify(r.json)}`;

async function seedOtp(email, { code = '123456', expiresInMs = 5 * 60 * 1000 } = {}) {
  await Otp.findOneAndReplace(
    { email },
    { email, otpHash: hashOtp(email, code), expiresAt: new Date(Date.now() + expiresInMs), attempts: 0, createdAt: new Date() },
    { upsert: true }
  );
}

async function seedResetLink(userId, { expiresInMs = 30 * 60 * 1000 } = {}) {
  const token = generateResetToken();
  await PasswordReset.findOneAndReplace(
    { userId },
    { userId, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + expiresInMs), createdAt: new Date() },
    { upsert: true }
  );
  return token;
}

// Full sign-up via email code. Returns the login cookie.
async function signUp(email) {
  await seedOtp(email);
  const r = await api('/api/auth/verify-otp', { method: 'POST', body: { email, otp: '123456' } });
  return r.cookie;
}

async function cleanup() {
  const users = await User.find({ email: TEST_EMAIL_PATTERN }).select('_id').lean();
  await PasswordReset.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: TEST_EMAIL_PATTERN });
  await Otp.deleteMany({ email: TEST_EMAIL_PATTERN });
}

// ---------- the tests ----------
async function run() {
  section('Security basics');
  {
    const r = await api('/api/health');
    check('health endpoint reports database connected', r.status === 200 && r.json.database === 'connected', show(r));
    check('Helmet security headers present', Boolean(r.headers.get('x-content-type-options') && r.headers.get('strict-transport-security')));
    check('X-Powered-By header hidden', !r.headers.get('x-powered-by'));
    check('CORS allows our frontend', r.headers.get('access-control-allow-origin') === env.clientUrl);

    const csrf = await api('/api/auth/logout', { method: 'POST', origin: 'https://evil.example' });
    check('POST from another website is blocked (CSRF)', csrf.status === 403, show(csrf));

    const notFound = await api('/api/does-not-exist');
    check('unknown route -> 404 JSON', notFound.status === 404 && notFound.json.message === 'Not found.', show(notFound));

    const badJson = await api('/api/auth/send-otp', { method: 'POST', rawBody: '{"email":' });
    check('malformed JSON -> 400 without internal details', badJson.status === 400 && !JSON.stringify(badJson.json).includes('at '), show(badJson));
  }

  section('Send OTP (spec Test 1 & 6)');
  {
    const invalid = await api('/api/auth/send-otp', { method: 'POST', body: { email: 'not-an-email' } });
    check('invalid email -> 400', invalid.status === 400, show(invalid));

    const injection = await api('/api/auth/send-otp', { method: 'POST', body: { email: { $ne: null } } });
    check('NoSQL injection object -> 400', injection.status === 400, show(injection));

    const email = testEmail('cooldown');
    await seedOtp(email); // as if a code was just sent
    const again = await api('/api/auth/send-otp', { method: 'POST', body: { email } });
    check(
      'Test 6: request again within 60s -> "Please wait before requesting another OTP."',
      again.status === 429 && again.json.message === 'Please wait before requesting another OTP.' && again.json.retryAfter > 0,
      show(again)
    );
    const resend = await api('/api/auth/resend-otp', { method: 'POST', body: { email } });
    check('resend-otp obeys the same cooldown', resend.status === 429, show(resend));

    const stored = await Otp.findOne({ email }).lean();
    check('OTP stored only as a 64-char hash', /^[a-f0-9]{64}$/.test(stored.otpHash) && !JSON.stringify(stored).includes('123456'));
  }

  section('Verify OTP (spec Tests 2-5)');
  {
    const email = testEmail('verify');
    await seedOtp(email);

    const wrong = await api('/api/auth/verify-otp', { method: 'POST', body: { email, otp: '000000' } });
    check(
      'Test 3: wrong code -> "Invalid verification code."',
      wrong.status === 400 && wrong.json.message === 'Invalid verification code.' && wrong.json.attemptsRemaining === 4,
      show(wrong)
    );

    const right = await api('/api/auth/verify-otp', { method: 'POST', body: { email, otp: '123456' } });
    check('Test 2: correct code -> "Email verified successfully."', right.status === 200 && right.json.message === 'Email verified successfully.', show(right));
    check('response contains no OTP and no token', !/123456|eyJ/.test(JSON.stringify(right.json)));
    check('login cookie is HttpOnly', /HttpOnly/i.test(right.setCookie || ''), right.setCookie);
    check('user saved as verified', (await User.findOne({ email }).lean())?.emailVerified === true);

    const reuse = await api('/api/auth/verify-otp', { method: 'POST', body: { email, otp: '123456' } });
    check('a used code cannot be used again', reuse.status === 400, show(reuse));

    const expiredEmail = testEmail('expired');
    await seedOtp(expiredEmail, { expiresInMs: -1000 });
    const expired = await api('/api/auth/verify-otp', { method: 'POST', body: { email: expiredEmail, otp: '123456' } });
    check('Test 4: expired code -> "OTP expired."', expired.status === 400 && expired.json.message.startsWith('OTP expired.'), show(expired));

    const lockEmail = testEmail('lockout');
    await seedOtp(lockEmail);
    for (let i = 0; i < 5; i += 1) {
      await api('/api/auth/verify-otp', { method: 'POST', body: { email: lockEmail, otp: '999999' } });
    }
    const locked = await api('/api/auth/verify-otp', { method: 'POST', body: { email: lockEmail, otp: '123456' } });
    check(
      'Test 5: after 5 wrong codes, even the right one -> "Too many attempts."',
      locked.status === 429 && locked.json.message.startsWith('Too many attempts.'),
      show(locked)
    );

    const raceEmail = testEmail('race');
    await seedOtp(raceEmail);
    await Promise.all(
      Array.from({ length: 8 }, () => api('/api/auth/verify-otp', { method: 'POST', body: { email: raceEmail, otp: '999999' } }))
    );
    const attempts = (await Otp.findOne({ email: raceEmail }).lean()).attempts;
    check('8 simultaneous guesses still count as max 5 attempts', attempts === 5, `attempts = ${attempts}`);
  }

  section('Sessions, protected route, logout (spec Test 7)');
  {
    const email = testEmail('session');
    const cookie = await signUp(email);

    const noCookie = await api('/api/auth/me');
    check('Test 7: /me without login -> 401 (frontend redirects to login)', noCookie.status === 401, show(noCookie));

    const me = await api('/api/auth/me', { cookie });
    check('/me with login cookie -> the user', me.status === 200 && me.json.user?.email === email, show(me));

    const [h, , s] = cookie.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: new mongoose.Types.ObjectId().toString(), ver: 0 })).toString('base64url');
    const forged = await api('/api/auth/me', { cookie: `${h}.${forgedPayload}.${s}` });
    check('edited token is rejected', forged.status === 401, show(forged));

    const user = await User.findOne({ email });
    const expiredToken = jwt.sign({ sub: user.id, ver: user.tokenVersion, exp: Math.floor(Date.now() / 1000) - 10 }, env.jwtSecret);
    const expired = await api('/api/auth/me', { cookie: expiredToken });
    check('expired token is rejected', expired.status === 401, show(expired));

    const logout = await api('/api/auth/logout', { method: 'POST', cookie });
    check('logout clears the cookie', logout.status === 200 && /Expires=Thu, 01 Jan 1970/.test(logout.setCookie || ''), logout.setCookie);

    const afterLogout = await api('/api/auth/me', { cookie });
    check('old token stops working after logout', afterLogout.status === 401, show(afterLogout));
  }

  section('Passwords');
  {
    const email = testEmail('password');
    const cookie = await signUp(email);

    const before = await api('/api/auth/login', { method: 'POST', body: { email, password: 'whatever123' } });
    check('password login before one is set -> generic 401', before.status === 401 && before.json.message === 'Invalid email or password.', show(before));

    const weak = await api('/api/auth/set-password', { method: 'POST', body: { password: 'short' }, cookie });
    check('too-short password rejected', weak.status === 400, show(weak));

    const set = await api('/api/auth/set-password', { method: 'POST', body: { password: 'correct horse battery' }, cookie });
    check('create password after sign-up', set.status === 200 && set.json.user?.hasPassword === true, show(set));

    const stored = await User.findOne({ email }).select('+passwordHash').lean();
    check('password stored as bcrypt hash only', stored.passwordHash.startsWith('$2') && !JSON.stringify(stored).includes('correct horse'));

    const wrongPw = await api('/api/auth/login', { method: 'POST', body: { email, password: 'wrong password' } });
    const unknown = await api('/api/auth/login', { method: 'POST', body: { email: testEmail('nobody'), password: 'wrong password' } });
    check('wrong password and unknown email get the SAME message', wrongPw.status === 401 && wrongPw.json.message === unknown.json.message, `${show(wrongPw)} vs ${show(unknown)}`);

    const ok = await api('/api/auth/login', { method: 'POST', body: { email, password: 'correct horse battery' } });
    check('correct password -> signed in', ok.status === 200 && Boolean(ok.cookie), show(ok));

    const change = await api('/api/auth/set-password', { method: 'POST', body: { password: 'new password here' }, cookie: ok.cookie });
    check('cannot replace password from a password session (stolen-cookie protection)', change.status === 403, show(change));
  }

  section('Forgot / reset password');
  {
    const unknown = await api('/api/auth/forgot-password', { method: 'POST', body: { email: testEmail('nobody') } });
    check('unknown email gets the generic "if an account exists" reply', unknown.status === 200 && unknown.json.message.startsWith('If an account exists'), show(unknown));

    const email = testEmail('reset');
    await signUp(email);
    const user = await User.findOne({ email });
    const login1 = await api('/api/auth/login', { method: 'POST', body: { email, password: 'x' } }); // no password yet
    check('(setup) account without password', login1.status === 401);

    const token = await seedResetLink(user._id);
    const weak = await api('/api/auth/reset-password', { method: 'POST', body: { token, password: 'short' } });
    check('weak password rejected without using up the link', weak.status === 400, show(weak));

    const reset = await api('/api/auth/reset-password', { method: 'POST', body: { token, password: 'reset password 1' } });
    check('valid link -> password reset and signed in', reset.status === 200 && Boolean(reset.cookie), show(reset));

    const reuse = await api('/api/auth/reset-password', { method: 'POST', body: { token, password: 'reset password 2' } });
    check('link works only once', reuse.status === 400, show(reuse));

    const expiredToken = await seedResetLink(user._id, { expiresInMs: -1000 });
    const expired = await api('/api/auth/reset-password', { method: 'POST', body: { token: expiredToken, password: 'reset password 2' } });
    check('expired link rejected', expired.status === 400, show(expired));

    const login2 = await api('/api/auth/login', { method: 'POST', body: { email, password: 'reset password 1' } });
    check('can sign in with the new password', login2.status === 200, show(login2));
  }

  section('Rate limiting');
  {
    const email = testEmail('bruteforce');
    const cookie = await signUp(email);
    await api('/api/auth/set-password', { method: 'POST', body: { password: 'real password 1' }, cookie });

    for (let i = 0; i < 5; i += 1) {
      await api('/api/auth/login', { method: 'POST', body: { email, password: `guess number ${i}` } });
    }
    const blocked = await api('/api/auth/login', { method: 'POST', body: { email, password: 'real password 1' } });
    check(
      'after 5 failed logins, the account is paused for 15 min (even with the right password)',
      blocked.status === 429 && blocked.json.message.startsWith('Too many failed sign-in attempts'),
      show(blocked)
    );
    check('429 includes a Retry-After header', Boolean(blocked.headers.get('retry-after')));

    const other = testEmail('flood');
    await seedOtp(other); // cooldown active -> no real email is sent by these requests
    for (let i = 0; i < 5; i += 1) {
      await api('/api/auth/send-otp', { method: 'POST', body: { email: other } });
    }
    const flood = await api('/api/auth/send-otp', { method: 'POST', body: { email: other } });
    check(
      'more than 5 code requests per hour for one email -> blocked',
      flood.status === 429 && flood.json.message.startsWith('Too many verification codes'),
      show(flood)
    );
  }
}

// ---------- start, run, clean up ----------
await connectDB();
await Promise.all([User.syncIndexes(), Otp.syncIndexes(), PasswordReset.syncIndexes()]);
const server = app.listen(0); // 0 = any free port
await new Promise((resolve) => server.once('listening', resolve));
baseUrl = `http://localhost:${server.address().port}`;
console.log(`Testing a fresh app instance at ${baseUrl}`);

try {
  await run();
} catch (err) {
  failed += 1;
  console.error('\nTest run crashed:', err);
} finally {
  await cleanup();
  server.close();
  await mongoose.connection.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
