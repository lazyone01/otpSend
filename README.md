# OTP Auth

A full-stack email authentication app: sign up with a 6-digit code sent to your real inbox, then sign in with a password or another code. It also has forgot-password links, a protected dashboard and logout.

**Stack:** React + Vite · Node.js + Express · MongoDB Atlas (Mongoose) · Nodemailer / Brevo · JWT in HTTP-only cookies

## Features

- **Email OTP sign-up and sign-in**
  - 6-digit code from `crypto.randomInt`, stored only as an HMAC-SHA256 hash
  - Expires after 5 minutes; 5 attempts maximum; works once
  - 60-second resend cooldown
- **Passwords:** created after the email is verified, hashed with bcrypt (cost 12)
- **Forgot password:** a one-time link (256-bit token, 30-minute expiry) sent by email
- **Sessions:** a JWT in an `HttpOnly` cookie
  - Logout revokes it on the server (`tokenVersion`)
  - A password reset signs out all other devices
- **Security**
  - Rate limits per IP and per email
  - Helmet headers, CORS, Origin-based CSRF check
  - Input validation and NoSQL-injection guards
  - Generic error messages that don't reveal which accounts exist
  - No stack traces in responses

## Architecture

```
                 Browser
                    │ HTTPS (one site: your-app.vercel.app)
                    ▼
        Vercel ── static React app (index.html, JS, CSS)
                    │  /api/*  is forwarded (vercel.json rewrite)
                    ▼
        Render ── Node.js + Express API
              ┌─────┴──────┐
              ▼            ▼
       MongoDB Atlas   Email provider (Brevo / SMTP) ──▶ user's inbox
```

Why the `/api` proxy? The browser only ever talks to the frontend's domain, so the login cookie is first-party. Calling `*.onrender.com` directly from `*.vercel.app` would make it a third-party cookie, and Safari blocks those.

## Project structure

```
client/                       React app (Vite)
  src/pages/                  Login, Verify, SetPassword, ForgotPassword, ResetPassword, Dashboard
  src/components/             Alert, ProtectedRoute
  src/services/api.js         every backend call (uses VITE_API_URL)
  vercel.json                 /api proxy + single-page-app routing for Vercel
server/                       Express API
  server.js                   startup: connect DB → verify email → listen
  app.js                      middleware order: trust proxy, helmet, cors, json, cookies, limits, routes, errors
  config/                     env.js (all environment variables), db.js (MongoDB connection)
  models/                     User, Otp, PasswordReset (Mongoose schemas + indexes)
  routes/authRoutes.js        URL → middleware → controller
  controllers/                request logic (authController.js)
  middleware/                 requireAuth, rateLimiters, requireSameOrigin, errorHandler
  services/emailService.js    email templates + delivery (SMTP or Brevo API)
  utils/                      OTP, password, token, validation helpers
  scripts/                    apiTest.js (npm run test:api), checkDb.js (npm run db:check)
TESTING.md                    automated + manual test checklist
```

## Run locally

Requirements: Node.js 20+, a MongoDB Atlas database, and an SMTP account (a Gmail App Password works for development).

```bash
# Backend
cd server
npm install
cp .env.example .env        # then fill it in (see below)
npm run dev                 # http://localhost:5000

# Frontend (second terminal)
cd client
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:5000
npm run dev                 # http://localhost:5174
```

Check it: `cd server && npm run test:api` should end with `44 passed, 0 failed`.

## Environment variables

### `server/.env`

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | no | Port to listen on. Hosting platforms set it automatically. |
| `NODE_ENV` | yes in prod | `development` or `production`. Production turns on `Secure` cookies and requires an `https://` `CLIENT_URL`. |
| `CLIENT_URL` | yes | Exact frontend URL, no trailing slash. Used for CORS, the CSRF check and reset-email links. |
| `TRUST_PROXY` | no | Number of proxies in front of the server. Defaults to 0 in dev and 1 in production. |
| `COOKIE_SAMESITE` | no | `lax` (default). Use `none` only if the frontend calls the API on another domain directly. |
| `MONGODB_URI` | yes | Atlas connection string, including the database name. |
| `OTP_SECRET` | yes | 32+ random characters; key for hashing OTPs. |
| `JWT_SECRET` | yes | 32+ random characters, different from `OTP_SECRET`; signs login tokens. |
| `JWT_EXPIRES_IN` | no | How long a login lasts. Default `7d`. |
| `EMAIL_PROVIDER` | no | `smtp` (default) or `brevo`. |
| `EMAIL_FROM` | yes | Sender, e.g. `"OTP Auth <you@example.com>"`. It must be allowed by your provider. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | if smtp | SMTP server login. |
| `BREVO_API_KEY` | if brevo | Brevo → SMTP & API → API Keys. |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### `client/.env`

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Development: `http://localhost:5000`. Production on Vercel: **leave unset** so requests use the `/api` proxy. It is built into public JavaScript, so never put secrets in it. |

## API

All endpoints are under `/api/auth`. Every response is JSON with a `message`.

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `POST /send-otp` | `{ email }` | 200 `OTP sent successfully.` | 429 if within 60s cooldown (`retryAfter`) or rate-limited; 503 if email delivery fails |
| `POST /resend-otp` | `{ email }` | same as send-otp | New code; the old one stops working |
| `POST /verify-otp` | `{ email, otp }` | 200 + login cookie | 400 invalid / expired; 429 after 5 attempts |
| `POST /login` | `{ email, password }` | 200 + login cookie | 401 `Invalid email or password.` for every failure |
| `POST /forgot-password` | `{ email }` | 200 (always the same message) | Emails a reset link if the account exists |
| `POST /reset-password` | `{ token, password }` | 200 + login cookie | Link is single-use; signs out other devices |
| `POST /set-password` | `{ password }` | 200 | Requires login. Replacing an existing password requires a recent email-code sign-in. |
| `GET /me` | – | 200 `{ user }` | 401 if not logged in |
| `POST /logout` | – | 200 | Revokes the token and clears the cookie |

`GET /api/health` returns `{ status, database }` for uptime checks.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md): MongoDB Atlas → Render (backend) → Vercel (frontend) → environment variables → production test.

## Security notes

- Never commit `.env` files. They are in `.gitignore`.
- Production uses different secrets and a different database from development.
- Rate-limit counters are kept in memory. That's fine for one server instance; use a shared store (Redis or MongoDB) if you scale out.
