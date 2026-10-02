import mongoose from 'mongoose';

// One pending "reset your password" link per user.
const passwordResetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // requesting a new link replaces the old one (old link stops working)
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true, // the link's token is looked up by its hash
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now, // used for the 60s cooldown between reset emails
  },
});

// Same idea as the OTP model: MongoDB deletes expired links automatically (within ~60s).
// The code still checks expiresAt itself.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
