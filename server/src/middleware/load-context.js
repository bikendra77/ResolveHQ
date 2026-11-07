import mongoose from 'mongoose';
import { Membership } from '../modules/organizations/models/membership.model.js';
import { Organization } from '../modules/organizations/models/organization.model.js';
import { ApiError } from '../utils/api-error.js';

export async function loadContext(req, _res, next) {
  if (!req.user?._id) {
    return next(new ApiError(401, 'MISSING_TOKEN', 'Authentication required'));
  }

  const organizationId = req.params.organizationId;
  if (!mongoose.isObjectIdOrHexString(organizationId)) {
    return next(new ApiError(404, 'NOT_FOUND', 'Organization not found'));
  }

  try {
    const membership = await Membership.findOne({
      organization: organizationId,
      user: req.user._id,
    }).select('organization role');

    if (!membership) {
      return next(new ApiError(404, 'NOT_FOUND', 'Organization not found'));
    }

    const organization = await Organization.findById(
      membership.organization,
    ).select('name slug createdAt updatedAt');

    if (!organization) {
      return next(new ApiError(404, 'NOT_FOUND', 'Organization not found'));
    }

    req.organization = organization;
    req.membership = membership;
    req.ctx = {
      user: req.user,
      organization,
      membership,
      role: membership.role,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
