import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    tokenVersion: {
      type: Number,
      required: true,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    revokedAt: Date,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export const RefreshToken =
  mongoose.models.RefreshToken ??
  mongoose.model('RefreshToken', refreshTokenSchema);
