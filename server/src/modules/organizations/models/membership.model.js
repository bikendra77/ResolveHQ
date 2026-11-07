import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

membershipSchema.index({ organization: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1 });
membershipSchema.index({ organization: 1, role: 1 });

export const Membership =
  mongoose.models.Membership ?? mongoose.model('Membership', membershipSchema);
