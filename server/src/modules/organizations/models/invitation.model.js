import mongoose from 'mongoose';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITATION_TTL_CLEANUP_SECONDS = 30 * 24 * 60 * 60;

const invitationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'viewer'],
      required: true,
    },
    projects: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
      default: [],
      validate: {
        validator: (projectIds) => projectIds.length <= 20,
        message: 'An invitation can include at most 20 projects',
      },
    },
    tokenHash: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + INVITATION_TTL_MS),
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index({ organization: 1, email: 1, status: 1 });
invitationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: INVITATION_TTL_CLEANUP_SECONDS },
);

export const Invitation =
  mongoose.models.Invitation ?? mongoose.model('Invitation', invitationSchema);
