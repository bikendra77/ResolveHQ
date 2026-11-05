import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/api-error.js';
import { RefreshToken } from './models/refresh-token.model.js';
import { User } from './models/user.model.js';

const refreshTokenLifetimeMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const dummyPasswordHash =
  env.BCRYPT_COST === 4
    ? '$2b$04$G24dsFZ5ppvm3pX7.IR.L.81UFnhvK6BASAl.7uSkYsNI7cuwt552'
    : '$2b$12$zM9wo8A/mTRZAc.n5MhJheph4PoLSOizXF3AsUNGjIz6fChUEUFzy';

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user) {
  return jwt.sign({ ver: user.tokenVersion }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    audience: 'resolvehq-web',
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'resolvehq-api',
    subject: String(user._id),
  });
}

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
  };
}

async function saveRefreshToken(userId, family, tokenVersion) {
  const token = randomBytes(32).toString('base64url');
  await RefreshToken.create({
    user: userId,
    tokenHash: hashRefreshToken(token),
    family,
    tokenVersion,
    expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
  });
  return token;
}

async function createSession(user, family = randomBytes(16).toString('hex')) {
  const refreshToken = await saveRefreshToken(
    user._id,
    family,
    user.tokenVersion,
  );
  return {
    accessToken: createAccessToken(user),
    refreshToken,
    user: publicUser(user),
  };
}

async function revokeFamily(family, userId, requestId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await RefreshToken.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  logger.warn(
    { requestId, userId: String(userId) },
    'Refresh token reuse detected',
  );
}

export async function register({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
  const user = new User({ name, email, passwordHash });

  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        409,
        'CONFLICT',
        'An account with this email already exists',
      );
    }
    throw error;
  }

  try {
    return await createSession(user);
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
}

export async function login({ email, password }, requestId) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? dummyPasswordHash,
  );

  if (!user || !passwordMatches || user.status !== 'active') {
    logger.warn({ requestId }, 'Authentication failed');
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();
  return createSession(user);
}

export async function refresh(rawToken, requestId) {
  if (!rawToken) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  const tokenHash = hashRefreshToken(rawToken);
  const storedToken = await RefreshToken.findOne({ tokenHash });
  if (!storedToken) {
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  if (storedToken.revokedAt) {
    await revokeFamily(storedToken.family, storedToken.user, requestId);
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  const now = new Date();
  if (storedToken.expiresAt <= now) {
    await RefreshToken.updateOne(
      { _id: storedToken._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  const user = await User.findById(storedToken.user);
  if (
    !user ||
    user.status !== 'active' ||
    storedToken.tokenVersion !== user.tokenVersion
  ) {
    await RefreshToken.updateOne(
      { _id: storedToken._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  const revokedToken = await RefreshToken.findOneAndUpdate(
    { _id: storedToken._id, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { returnDocument: 'after' },
  );
  if (!revokedToken) {
    await revokeFamily(storedToken.family, storedToken.user, requestId);
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  const session = await createSession(user, storedToken.family);
  const currentUser = await User.findById(user._id);
  if (!currentUser || currentUser.tokenVersion !== user.tokenVersion) {
    await RefreshToken.updateOne(
      { tokenHash: hashRefreshToken(session.refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw new ApiError(401, 'INVALID_TOKEN', 'Authentication required');
  }

  return { ...session, user: publicUser(currentUser) };
}

export async function logout(rawToken) {
  if (!rawToken) {
    return;
  }

  await RefreshToken.updateOne(
    { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function logoutAll(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
