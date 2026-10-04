// Entry point. Logs each startup stage, so if the app ever hangs while starting,
// the hosting logs show exactly where.
console.log(`Starting (Node.js ${process.version})...`);

let stage = 'loading app code';

// Watchdog: if the server isn't listening within 90s, say where it got stuck and exit,
// instead of hanging silently until the host gives up (Render waits 15 minutes).
const startupWatchdog = setTimeout(() => {
  console.error(`Startup timed out after 90s while ${stage}.`);
  process.exit(1);
}, 90_000);

// Dynamic imports (instead of `import ... from` at the top) so the line above is printed
// BEFORE all the app code is loaded - static imports always run first.
const { default: app } = await import('./app.js');
const { env } = await import('./config/env.js');
const { connectDB, disconnectDB } = await import('./config/db.js');
const { verifyEmailTransport } = await import('./services/emailService.js');

try {
  // Connect to the database BEFORE accepting requests -
  // every auth endpoint needs it, so there's no point starting without it.
  stage = 'connecting to MongoDB';
  console.log('Connecting to MongoDB...');
  await connectDB();
} catch (err) {
  console.error('Failed to connect to MongoDB:', err.message);
  process.exit(1); // Hosting platforms restart crashed processes automatically.
}

// Check the email login at startup so bad credentials show up in the logs immediately.
// Not fatal: logged-in users can still use the app while email is down.
try {
  stage = `verifying the email provider (${env.emailProvider})`;
  await verifyEmailTransport();
  console.log(`Email provider verified (${env.emailProvider})`);
} catch (err) {
  console.error(`Email provider verification failed (${env.emailProvider}):`, err.code || '', err.message);
}

stage = `opening port ${env.port}`;
const server = app.listen(env.port, () => {
  clearTimeout(startupWatchdog);
  console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
});

// Hosting platforms send SIGTERM when redeploying. Finish in-flight requests, then close cleanly.
const shutdown = () => {
  console.log('Shutting down...');
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
