import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { verifyEmailTransport } from './services/emailService.js';

async function start() {
  try {
    // Connect to the database BEFORE accepting requests -
    // every auth endpoint needs it, so there's no point starting without it.
    await connectDB();
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1); // Hosting platforms restart crashed processes automatically.
  }

  // Check the SMTP login at startup so bad credentials show up in the logs immediately.
  // Not fatal: logged-in users can still use the app while email is down.
  try {
    await verifyEmailTransport();
    console.log('SMTP connection verified');
  } catch (err) {
    console.error('SMTP verification failed:', err.code || '', err.message);
  }

  const server = app.listen(env.port, () => {
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
}

start();
