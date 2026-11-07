import { createHash } from 'node:crypto';
import {
  configuredRateLimit,
  createRateLimiter,
} from '../../middleware/rate-limit.js';

export const createAuthRateLimiter = createRateLimiter;

function hashEmailKey(req) {
  return createHash('sha256').update(req.body.email).digest('hex');
}

export const registerRateLimit = createAuthRateLimiter({
  limit: configuredRateLimit(5),
});
export const loginIpRateLimit = createAuthRateLimiter({
  limit: configuredRateLimit(10),
});
export const loginEmailRateLimit = createAuthRateLimiter({
  limit: configuredRateLimit(10),
  keyGenerator: hashEmailKey,
});
export const refreshRateLimit = createAuthRateLimiter({
  limit: configuredRateLimit(30),
});
