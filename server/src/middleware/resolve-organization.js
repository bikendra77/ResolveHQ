import mongoose from 'mongoose';
import { Membership } from '../modules/organizations/models/membership.model.js';
import { Organization } from '../modules/organizations/models/organization.model.js';
import { ApiError } from '../utils/api-error.js';

export async function resolveOrganization(req, _res, next) {
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
    return next();
  } catch (error) {
    return next(error);
  }
}
