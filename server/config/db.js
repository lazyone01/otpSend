import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  // Throw immediately if a query runs while disconnected, instead of silently queueing it.
  mongoose.set('bufferCommands', false);

  // Give up after 10s if Atlas is unreachable (wrong URI, IP not allowed, no internet).
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });

  // Log the database name only - never the full URI, it contains the password.
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
