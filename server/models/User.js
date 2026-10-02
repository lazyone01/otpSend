import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true, // creates a unique index: one account per email, fast lookups
      lowercase: true, // "Jay@Gmail.com" and "jay@gmail.com" are the same user
      trim: true,
      maxlength: 254, // longest valid email address
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
    },
    // bcrypt hash of the password. Empty until the user creates one after signing up.
    // select: false = never loaded by queries unless explicitly asked for with .select('+passwordHash'),
    // so it can't leak into a response by accident.
    passwordHash: {
      type: String,
      select: false,
    },
    // When the password was set. Not secret - lets us tell the frontend "has a password" safely.
    passwordSetAt: {
      type: Date,
    },
    // Copied into every JWT. Logout increments it, which makes every token issued
    // before that moment invalid - even copies an attacker may have stolen.
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

export const User = mongoose.model('User', userSchema);
