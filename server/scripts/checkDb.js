// Checks a MongoDB connection and creates the app's indexes.
//
//   Development database (from .env):
//     npm run db:check
//
//   Production database, WITHOUT putting its URI in .env:
//     1. create server/.env.production.local containing only:  MONGODB_URI=mongodb+srv://...
//        (git ignores this file)
//     2. npm run db:check:prod
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { PasswordReset } from '../models/PasswordReset.js';

try {
  await connectDB();
  const { host, name } = mongoose.connection;
  console.log(`Host:     ${host}`);
  console.log(`Database: ${name}`);

  if (name === 'test') {
    console.warn('Warning: database name is "test" - the URI is missing "/<dbname>" before the "?".');
  }

  // Creates the unique and TTL indexes now, instead of on the first request.
  for (const model of [User, Otp, PasswordReset]) {
    await model.syncIndexes();
    const indexes = (await model.collection.indexes()).map((i) => Object.keys(i.key).join('+'));
    console.log(`${model.collection.collectionName.padEnd(15)} indexes: ${indexes.join(', ')}`);
  }

  console.log('Users:', await User.countDocuments());
  console.log('OK - connection works.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
