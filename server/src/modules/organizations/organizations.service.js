import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { Membership } from './models/membership.model.js';
import { Organization } from './models/organization.model.js';
import { ApiError } from '../../utils/api-error.js';
import { withTransaction } from '../../utils/transaction.js';

const SLUG_ATTEMPTS = 5;

function slugify(name) {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  return slug || 'organization';
}

function slugForAttempt(base, attempt) {
  if (attempt === 0) {
    return base;
  }

  const suffix = randomBytes(4).toString('hex');
  return `${base.slice(0, 70).replace(/-+$/g, '')}-${suffix}`;
}

function isSlugDuplicate(error) {
  return (
    error?.code === 11000 &&
    (error.keyPattern?.slug === 1 ||
      Object.prototype.hasOwnProperty.call(error.keyValue || {}, 'slug'))
  );
}

export async function listOrganizationsForUser(userId) {
  const memberships = await Membership.find({ user: userId })
    .populate('organization', 'name slug createdAt updatedAt')
    .sort({ createdAt: 1 });

  return memberships
    .filter((membership) => membership.organization)
    .map((membership) => ({
      organization: membership.organization,
      role: membership.role,
    }));
}

export async function listOrganizationMembers(organizationId) {
  return Membership.find({ organization: organizationId })
    .populate('user', 'name email')
    .sort({ createdAt: 1 });
}

function isTransactionsUnavailable(error) {
  return (
    error?.message ===
      'MongoDB transactions require a replica set or sharded cluster.' ||
    error?.message ===
      'MongoDB must be connected before starting a transaction.'
  );
}

async function serializeMembershipChange(organizationId, session) {
  const result = await Organization.updateOne(
    { _id: organizationId },
    { $inc: { membershipVersion: 1 } },
    { session },
  );

  if (result.matchedCount !== 1) {
    throw new ApiError(404, 'NOT_FOUND', 'Organization not found');
  }
}

function assertCanManageTarget(actorRole, targetRole, newRole) {
  if (
    actorRole === 'admin' &&
    (targetRole === 'admin' ||
      targetRole === 'owner' ||
      newRole === 'admin' ||
      newRole === 'owner')
  ) {
    throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
}

async function ensureOwnerRemains(organizationId, session) {
  const ownerCount = await Membership.countDocuments({
    organization: organizationId,
    role: 'owner',
  }).session(session);

  if (ownerCount <= 1) {
    throw new ApiError(
      409,
      'LAST_OWNER',
      'The organization must have at least one Owner',
    );
  }
}

export async function changeOrganizationMemberRole(
  organizationId,
  userId,
  role,
  actorRole,
) {
  if (!mongoose.isObjectIdOrHexString(userId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Organization member not found');
  }

  try {
    return await withTransaction(async (session) => {
      await serializeMembershipChange(organizationId, session);

      const target = await Membership.findOne({
        organization: organizationId,
        user: userId,
      }).session(session);

      if (!target) {
        throw new ApiError(404, 'NOT_FOUND', 'Organization member not found');
      }

      assertCanManageTarget(actorRole, target.role, role);

      if (target.role === 'owner' && role !== 'owner') {
        await ensureOwnerRemains(organizationId, session);
      }

      const updated = await Membership.findOneAndUpdate(
        {
          _id: target._id,
          organization: organizationId,
          role: target.role,
        },
        { $set: { role } },
        { new: true, session },
      );

      if (!updated) {
        throw new ApiError(409, 'CONFLICT', 'Organization member changed');
      }

      return updated;
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isTransactionsUnavailable(error)) {
      throw new ApiError(503, 'TRANSACTIONS_UNAVAILABLE', error.message);
    }
    throw error;
  }
}

export async function removeOrganizationMember(
  organizationId,
  userId,
  actorRole,
) {
  if (!mongoose.isObjectIdOrHexString(userId)) {
    throw new ApiError(404, 'NOT_FOUND', 'Organization member not found');
  }

  try {
    return await withTransaction(async (session) => {
      await serializeMembershipChange(organizationId, session);

      const target = await Membership.findOne({
        organization: organizationId,
        user: userId,
      }).session(session);

      if (!target) {
        throw new ApiError(404, 'NOT_FOUND', 'Organization member not found');
      }

      if (actorRole === 'admin' && target.role === 'owner') {
        throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
      }

      if (target.role === 'owner') {
        await ensureOwnerRemains(organizationId, session);
      }

      const removed = await Membership.findOneAndDelete({
        _id: target._id,
        organization: organizationId,
        role: target.role,
      }).session(session);

      if (!removed) {
        throw new ApiError(409, 'CONFLICT', 'Organization member changed');
      }

      return removed;
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isTransactionsUnavailable(error)) {
      throw new ApiError(503, 'TRANSACTIONS_UNAVAILABLE', error.message);
    }
    throw error;
  }
}

export async function createOrganizationForUser(userId, name) {
  const baseSlug = slugify(name);

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = slugForAttempt(baseSlug, attempt);

    try {
      return await withTransaction(async (session) => {
        const existing = await Organization.exists({ slug }).session(session);
        if (existing) {
          const error = new Error('Organization slug already exists');
          error.code = 'ORGANIZATION_SLUG_COLLISION';
          throw error;
        }

        const [organization] = await Organization.create(
          [{ name, slug, createdBy: userId }],
          { session },
        );
        const [membership] = await Membership.create(
          [
            {
              organization: organization._id,
              user: userId,
              role: 'owner',
            },
          ],
          { session },
        );

        return { organization, membership };
      });
    } catch (error) {
      if (
        error?.code === 'ORGANIZATION_SLUG_COLLISION' ||
        isSlugDuplicate(error)
      ) {
        continue;
      }
      if (
        error?.message ===
          'MongoDB transactions require a replica set or sharded cluster.' ||
        error?.message ===
          'MongoDB must be connected before starting a transaction.'
      ) {
        throw new ApiError(503, 'TRANSACTIONS_UNAVAILABLE', error.message);
      }
      throw error;
    }
  }

  throw new ApiError(
    409,
    'SLUG_CONFLICT',
    'Could not generate a unique organization address. Please try again.',
  );
}
