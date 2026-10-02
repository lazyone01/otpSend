import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true, // at most ONE active OTP per email - a new one replaces the old
    lowercase: true,
    trim: true,
  },
  otpHash: {
    type: String,
    required: true, // the hash of the code, never the code itself
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0, // failed verification attempts; locked out at 5
  },
  createdAt: {
    type: Date,
    default: Date.now, // when this code was sent; used for the 60s resend cooldown
  },
});

// TTL index: MongoDB's background job deletes each document once expiresAt has passed.
// expireAfterSeconds: 0 means "delete at exactly expiresAt" (not N seconds after).
// The job runs about once a minute, so our code must STILL check expiresAt itself.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = mongoose.model('Otp', otpSchema);
