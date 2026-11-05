import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';
import { User } from '../modules/auth/models/user.model.js';

export async function authenticate(req, _res, next) {
  const authorization = req.get('authorization');
  if (!authorization) {
    return next(new ApiError(401, 'MISSING_TOKEN', 'Authentication required'));
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) {
    return next(new ApiError(401, 'INVALID_TOKEN', 'Authentication required'));
  }

  let payload;
  try {
    payload = jwt.verify(match[1], env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      audience: 'resolvehq-web',
      issuer: 'resolvehq-api',
    });
  } catch (error) {
    const code =
      error?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return next(new ApiError(401, code, 'Authentication required'));
  }

  if (
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    !mongoose.isObjectIdOrHexString(payload.sub) ||
    !Number.isInteger(payload.ver)
  ) {
    return next(new ApiError(401, 'INVALID_TOKEN', 'Authentication required'));
  }

  try {
    const user = await User.findById(payload.sub).select(
      'name email tokenVersion status',
    );
    if (
      !user ||
      user.status !== 'active' ||
      user.tokenVersion !== payload.ver
    ) {
      return next(
        new ApiError(401, 'INVALID_TOKEN', 'Authentication required'),
      );
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}
