import { env } from '../../config/env.js';
import {
  configuredRateLimit,
  createRateLimiter,
} from '../../middleware/rate-limit.js';

export const organizationCreateRateLimit = createRateLimiter({
  limit: configuredRateLimit(env.ORGANIZATION_CREATE_RATE_LIMIT),
});

export const organizationInvitationRateLimit = createRateLimiter({
  limit: configuredRateLimit(env.ORGANIZATION_INVITATION_RATE_LIMIT),
});

export const invitationAcceptRateLimit = createRateLimiter({
  limit: configuredRateLimit(env.INVITATION_ACCEPT_RATE_LIMIT),
});

export const memberMutationRateLimit = createRateLimiter({
  limit: configuredRateLimit(env.MEMBER_MUTATION_RATE_LIMIT),
});
