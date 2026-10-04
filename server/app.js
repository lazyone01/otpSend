import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { requireSameOrigin } from './middleware/requireSameOrigin.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

// On Render/Railway, requests reach us through the platform's proxy. Without this, every
// request would appear to come from the proxy's IP - and one user hitting a rate limit
// would block EVERYONE. With it, Express reads the real client IP from X-Forwarded-For.
// The number = how many proxies to trust. Never trust more than actually exist: otherwise a
// client could send a fake X-Forwarded-For header and pretend to be a different IP.
app.set('trust proxy', env.trustProxy);

// Security headers (Helmet). Tells browsers e.g. "don't guess content types", "don't put this
// in an iframe", "only talk to me over HTTPS", and removes the "X-Powered-By: Express" header.
app.use(helmet());

// Health check: hosting platforms call this to see if the app is alive (Render waits for it
// before switching traffic to a new deploy). Registered BEFORE cors, body parsing and rate limits,
// so a configuration mistake there can never make the health check itself fail or be throttled.
app.get('/api/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

// TEMPORARY diagnostic (remove after configuring TRUST_PROXY): shows which client-IP headers
// reach the app through Vercel and Render. Only reveals the caller's own IP and proxy IPs.
app.get('/api/debug/ip', (req, res) => {
  res.json({
    reqIp: req.ip,
    xForwardedFor: req.get('x-forwarded-for') || null,
    trueClientIp: req.get('true-client-ip') || null,
    cfConnectingIp: req.get('cf-connecting-ip') || null,
    xRealIp: req.get('x-real-ip') || null,
    xVercelForwardedFor: req.get('x-vercel-forwarded-for') || null,
  });
});

// Only our frontend may call this API from a browser.
// credentials: true lets the browser send/receive cookies cross-origin (needed for the JWT cookie).
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);

// Parse JSON request bodies (max 10kb - our payloads are tiny).
app.use(express.json({ limit: '10kb' }));

// Parse the Cookie header into req.cookies (so requireAuth can read the JWT).
app.use(cookieParser());

// Every /api request: overall rate limit, then reject cross-site POSTs (CSRF).
app.use('/api', apiLimiter, requireSameOrigin);

app.use('/api/auth', authRoutes);

// These two must come LAST: they only run if no route above handled the request.
app.use(notFound);
app.use(errorHandler);

export default app;
