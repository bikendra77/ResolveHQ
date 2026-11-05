import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';

const windowMs = 15 * 60 * 1000;
const testLimit = 1000;

export function createAuthRateLimiter({ limit, keyGenerator } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler(req, res, next) {
      const resetTime = req.rateLimit?.resetTime;
      if (resetTime) {
        res.setHeader(
          'Retry-After',
          Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)),
        );
      }
      return next(
        new ApiError(429, 'RATE_LIMITED', 'Too many attempts, try again later'),
      );
    },
  });
}

function hashEmailKey(req) {
  return createHash('sha256').update(req.body.email).digest('hex');
}

const limit = (productionLimit) =>
  env.NODE_ENV === 'test' ? testLimit : productionLimit;

export const registerRateLimit = createAuthRateLimiter({
  limit: limit(5),
});
export const loginIpRateLimit = createAuthRateLimiter({
  limit: limit(10),
});
export const loginEmailRateLimit = createAuthRateLimiter({
  limit: limit(10),
  keyGenerator: hashEmailKey,
});
export const refreshRateLimit = createAuthRateLimiter({
  limit: limit(30),
});
