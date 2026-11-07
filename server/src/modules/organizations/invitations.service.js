import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';
import { withTransaction } from '../../utils/transaction.js';
import { User } from '../auth/models/user.model.js';
import { Invitation } from './models/invitation.model.js';
import { Membership } from './models/membership.model.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashInvitationToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function transactionsUnavailable(error) {
  return (
    error?.message ===
      'MongoDB transactions require a replica set or sharded cluster.' ||
    error?.message ===
      'MongoDB must be connected before starting a transaction.'
  );
}

async function expirePendingInvitations(organizationId, email, now) {
  await Invitation.updateMany(
    {
      organization: organizationId,
      email,
      status: 'pending',
      expiresAt: { $lte: now },
    },
    { $set: { status: 'expired' } },
  );
}

export async function createOrganizationInvitation(
  organizationId,
  invitedBy,
  { email, role },
) {
  const now = new Date();
  await expirePendingInvitations(organizationId, email, now);

  const existingUser = await User.findOne({ email }).select('_id');
  if (
    existingUser &&
    (await Membership.exists({
      organization: organizationId,
      user: existingUser._id,
    }))
  ) {
    throw new ApiError(409, 'CONFLICT', 'This person is already a member');
  }

  const pendingInvitation = await Invitation.findOne({
    organization: organizationId,
    email,
    status: 'pending',
    expiresAt: { $gt: now },
  }).select('_id');

  if (pendingInvitation) {
    throw new ApiError(
      409,
      'CONFLICT',
      'An invitation is already pending for this person',
    );
  }

  const token = randomBytes(32).toString('base64url');
  const invitation = new Invitation({
    organization: organizationId,
    email,
    role,
    tokenHash: hashInvitationToken(token),
    invitedBy,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
  });

  try {
    await invitation.save();
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ApiError(
        409,
        'CONFLICT',
        'An invitation is already pending for this person',
      );
    }
    throw error;
  }

  const acceptUrl = new URL(
    `/invite/${encodeURIComponent(token)}`,
    env.CLIENT_ORIGIN,
  ).toString();

  return { invitation, acceptUrl };
}

export async function listOrganizationInvitations(organizationId, status) {
  const now = new Date();
  await Invitation.updateMany(
    {
      organization: organizationId,
      status: 'pending',
      expiresAt: { $lte: now },
    },
    { $set: { status: 'expired' } },
  );

  const filter = { organization: organizationId };
  if (status) filter.status = status;

  return Invitation.find(filter).sort({ createdAt: -1 });
}

export async function revokeOrganizationInvitation(
  organizationId,
  invitationId,
) {
  if (!mongoose.isObjectIdOrHexString(invitationId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Invitation not found');
  }

  const invitation = await Invitation.findOne({
    _id: invitationId,
    organization: organizationId,
  }).select('status expiresAt');

  if (!invitation) {
    throw new ApiError(404, 'NOT_FOUND', 'Invitation not found');
  }

  const now = new Date();
  if (invitation.status !== 'pending' || invitation.expiresAt <= now) {
    throw new ApiError(409, 'CONFLICT', 'Invitation is no longer pending');
  }

  const revoked = await Invitation.findOneAndUpdate(
    {
      _id: invitationId,
      organization: organizationId,
      status: 'pending',
      expiresAt: { $gt: now },
    },
    { $set: { status: 'revoked' } },
    { new: true },
  );

  if (!revoked) {
    throw new ApiError(409, 'CONFLICT', 'Invitation is no longer pending');
  }

  return revoked;
}

export async function acceptOrganizationInvitation(token, user) {
  const tokenHash = hashInvitationToken(token);
  const invitation = await Invitation.findOne({ tokenHash });

  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt <= new Date()
  ) {
    throw new ApiError(404, 'NOT_FOUND', 'Invitation not found or expired');
  }

  if (invitation.email !== user.email.toLowerCase()) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'Invitation email does not match the authenticated user',
    );
  }

  try {
    return await withTransaction(async (session) => {
      const currentInvitation = await Invitation.findOne({
        _id: invitation._id,
        status: 'pending',
        expiresAt: { $gt: new Date() },
        email: user.email.toLowerCase(),
      }).session(session);

      if (!currentInvitation) {
        throw new ApiError(404, 'NOT_FOUND', 'Invitation not found or expired');
      }

      const existingMembership = await Membership.findOne({
        organization: currentInvitation.organization,
        user: user._id,
      })
        .select('_id')
        .session(session);

      if (existingMembership) {
        throw new ApiError(409, 'CONFLICT', 'User is already a member');
      }

      const now = new Date();
      const accepted = await Invitation.findOneAndUpdate(
        {
          _id: currentInvitation._id,
          status: 'pending',
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: 'accepted',
            acceptedBy: user._id,
          },
        },
        { new: true, session },
      );

      if (!accepted) {
        throw new ApiError(404, 'NOT_FOUND', 'Invitation not found or expired');
      }

      const [membership] = await Membership.create(
        [
          {
            organization: accepted.organization,
            user: user._id,
            role: accepted.role,
            invitedBy: accepted.invitedBy,
          },
        ],
        { session },
      );

      return { invitation: accepted, membership };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isDuplicateKey(error)) {
      throw new ApiError(409, 'CONFLICT', 'User is already a member');
    }
    if (transactionsUnavailable(error)) {
      throw new ApiError(503, 'TRANSACTIONS_UNAVAILABLE', error.message);
    }
    throw error;
  }
}
