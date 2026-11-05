import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => {
  const usersByEmail = new Map();
  const usersById = new Map();
  const refreshTokens = new Map();
  let refreshTokenUpdateManyError;
  let beforeRefreshTokenCreate;
  let nextId = 1;

  function id() {
    return (nextId++).toString(16).padStart(24, '0');
  }

  class FakeUser {
    constructor(fields) {
      Object.assign(this, fields);
      this._id = id();
      this.tokenVersion = 0;
      this.status = 'active';
    }

    async save() {
      if (
        usersByEmail.has(this.email) &&
        usersByEmail.get(this.email)._id !== this._id
      ) {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
      }
      usersByEmail.set(this.email, this);
      usersById.set(this._id, this);
      return this;
    }

    static findOne({ email }) {
      return { select: async () => usersByEmail.get(email) ?? null };
    }

    static findById(userId) {
      const user = usersById.get(String(userId));
      const snapshot = user ? { ...user } : null;
      return {
        select: async () => snapshot,
        then(resolve, reject) {
          return Promise.resolve(snapshot).then(resolve, reject);
        },
      };
    }

    static async updateOne({ _id }, update) {
      const user = usersById.get(String(_id));
      if (user && update.$inc?.tokenVersion) {
        user.tokenVersion += update.$inc.tokenVersion;
      }
      return { modifiedCount: user ? 1 : 0 };
    }

    static async deleteOne({ _id }) {
      const user = usersById.get(String(_id));
      if (user) {
        usersByEmail.delete(user.email);
        usersById.delete(user._id);
      }
    }
  }

  class FakeRefreshToken {
    static async create(fields) {
      if (beforeRefreshTokenCreate) {
        await beforeRefreshTokenCreate(fields);
      }
      const token = { _id: id(), ...fields };
      refreshTokens.set(token._id, token);
      return token;
    }

    static async findOne({ tokenHash }) {
      return [...refreshTokens.values()].find(
        (token) => token.tokenHash === tokenHash,
      );
    }

    static async findOneAndUpdate(filter, update) {
      const token = refreshTokens.get(String(filter._id));
      if (
        !token ||
        token.revokedAt != null ||
        token.expiresAt <= filter.expiresAt.$gt
      ) {
        return null;
      }
      Object.assign(token, update.$set);
      return token;
    }

    static async updateMany(filter, update) {
      if (refreshTokenUpdateManyError) {
        throw refreshTokenUpdateManyError;
      }
      const { family, user, revokedAt } = filter;
      let modifiedCount = 0;
      for (const token of refreshTokens.values()) {
        const matchesFamily = family === undefined || token.family === family;
        const matchesUser =
          user === undefined || String(token.user) === String(user);
        const matchesRevokedAt =
          revokedAt === undefined ||
          (revokedAt === null
            ? token.revokedAt == null
            : token.revokedAt === revokedAt);
        if (
          matchesFamily &&
          matchesUser &&
          token.revokedAt == null &&
          matchesRevokedAt
        ) {
          Object.assign(token, update.$set);
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    }

    static async updateOne(filter, update) {
      const token = filter._id
        ? refreshTokens.get(String(filter._id))
        : await this.findOne({ tokenHash: filter.tokenHash });
      if (token && token.revokedAt == null) {
        Object.assign(token, update.$set);
      }
      return { modifiedCount: token ? 1 : 0 };
    }
  }

  return {
    FakeRefreshToken,
    FakeUser,
    refreshTokens,
    usersByEmail,
    usersById,
    get refreshTokenUpdateManyError() {
      return refreshTokenUpdateManyError;
    },
    set refreshTokenUpdateManyError(error) {
      refreshTokenUpdateManyError = error;
    },
    set beforeRefreshTokenCreate(hook) {
      beforeRefreshTokenCreate = hook;
    },
  };
});

vi.mock('dotenv/config', () => ({}));
vi.mock('../../src/modules/auth/models/user.model.js', () => ({
  User: stores.FakeUser,
}));
vi.mock('../../src/modules/auth/models/refresh-token.model.js', () => ({
  RefreshToken: stores.FakeRefreshToken,
}));

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { refreshCookieName } from '../../src/modules/auth/auth.controller.js';

const origin = env.CLIENT_ORIGIN;

function refreshCookie(response) {
  return response.headers['set-cookie'][0].split(';', 1)[0];
}

function protectedApp() {
  const application = express();
  application.get('/protected', authenticate, (req, res) => {
    res.json({ id: String(req.user._id) });
  });
  application.use(errorHandler);
  return application;
}

async function register(email = 'person@example.com') {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Test Person',
    email,
    password: 'a sufficiently long password',
  });
}

describe('authentication endpoints', () => {
  beforeEach(() => {
    stores.usersByEmail.clear();
    stores.usersById.clear();
    stores.refreshTokens.clear();
    stores.refreshTokenUpdateManyError = undefined;
    stores.beforeRefreshTokenCreate = undefined;
  });

  it('registers a normalized user, hashes the password and returns a secure cookie', async () => {
    const response = await register('  PERSON@EXAMPLE.COM ');

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      name: 'Test Person',
      email: 'person@example.com',
    });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data).toHaveProperty('accessToken');
    const claims = jwt.decode(response.body.data.accessToken);
    expect(claims.exp - claims.iat).toBe(15 * 60);
    expect(claims).not.toHaveProperty('role');

    const savedUser = stores.usersByEmail.get('person@example.com');
    expect(savedUser.passwordHash).not.toBe('a sufficiently long password');
    const bcrypt = await import('bcrypt');
    await expect(
      bcrypt.default.compare(
        'a sufficiently long password',
        savedUser.passwordHash,
      ),
    ).resolves.toBe(true);

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain(`${refreshCookieName}=`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
    expect(cookie).toMatch(/Max-Age=604800/i);

    const rawToken = decodeURIComponent(refreshCookie(response).split('=')[1]);
    const storedToken = [...stores.refreshTokens.values()][0];
    expect(storedToken.tokenHash).not.toBe(rawToken);
    expect(storedToken.expiresAt.getTime()).toBeCloseTo(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
      -3,
    );
    expect(response.text).not.toContain(savedUser.passwordHash);

    const protectedResponse = await request(protectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`);
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.id).toBe(savedUser._id);
  });

  it('returns a conflict for a duplicate email regardless of case', async () => {
    expect((await register()).status).toBe(201);
    const duplicate = await register('PERSON@EXAMPLE.COM');

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('returns validation details and rejects passwords longer than 72 bytes', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test Person',
        email: 'person@example.com',
        password: 'x'.repeat(73),
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'password' })]),
    );
    expect(stores.usersByEmail.size).toBe(0);
  });

  it('logs in with valid credentials and uses the same generic error for invalid credentials', async () => {
    await register();
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'PERSON@EXAMPLE.COM',
      password: 'a sufficiently long password',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
    expect(login.body.data.user).not.toHaveProperty('passwordHash');
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/i);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'person@example.com', password: 'wrong password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.com', password: 'wrong password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.message).toBe(
      unknownEmail.body.error.message,
    );
  });

  it('rejects missing, invalid and expired access tokens', async () => {
    const application = protectedApp();
    const missing = await request(application).get('/protected');
    const invalid = await request(application)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-jwt');
    const expiredToken = jwt.sign({ ver: 0 }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      audience: 'resolvehq-web',
      expiresIn: -1,
      issuer: 'resolvehq-api',
      subject: '000000000000000000000001',
    });
    const expired = await request(application)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('MISSING_TOKEN');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('requires authentication for the profile and rejects invalid bearer tokens', async () => {
    const unauthenticated = await request(app).get('/api/v1/auth/me');
    const invalid = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe('MISSING_TOKEN');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns only the authenticated user’s safe public profile', async () => {
    const registration = await register();
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        user: {
          id: stores.usersByEmail.get('person@example.com')._id,
          name: 'Test Person',
          email: 'person@example.com',
        },
      },
    });
    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain('tokenVersion');
    expect(response.text).not.toContain('status');
    expect(response.text).not.toContain('lastLoginAt');
  });

  it('logs out all sessions, revokes refresh tokens and invalidates access tokens', async () => {
    const registration = await register();
    const anotherUser = await register('another@example.com');
    const secondSession = await request(app).post('/api/v1/auth/login').send({
      email: 'person@example.com',
      password: 'a sufficiently long password',
    });
    expect(secondSession.status).toBe(200);

    const logoutAll = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
      .set('Origin', origin)
      .set('Cookie', refreshCookie(secondSession));

    expect(logoutAll.status).toBe(204);
    expect(logoutAll.headers['set-cookie'][0]).toMatch(/resolvehq_refresh=;/);
    const loggedOutUserId = stores.usersByEmail.get('person@example.com')._id;
    expect(
      [...stores.refreshTokens.values()]
        .filter((token) => token.user === loggedOutUserId)
        .every((token) => token.revokedAt),
    ).toBe(true);
    expect(
      [...stores.refreshTokens.values()]
        .filter((token) => token.user !== loggedOutUserId)
        .every((token) => !token.revokedAt),
    ).toBe(true);

    for (const accessToken of [
      registration.body.data.accessToken,
      secondSession.body.data.accessToken,
    ]) {
      const profile = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(profile.status).toBe(401);
      expect(profile.body.error.code).toBe('INVALID_TOKEN');
    }

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', refreshCookie(secondSession));
    expect(refresh.status).toBe(401);

    const otherUserProfile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${anotherUser.body.data.accessToken}`);
    expect(otherUserProfile.status).toBe(200);
  });

  it('rejects logout-all without authentication or with a disallowed origin', async () => {
    const unauthenticated = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Origin', origin);
    const registration = await register();
    const disallowedOrigin = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
      .set('Origin', 'https://attacker.example');

    expect(unauthenticated.status).toBe(401);
    expect(disallowedOrigin.status).toBe(403);
    expect(disallowedOrigin.body.error.code).toBe('FORBIDDEN');
    expect(
      [...stores.refreshTokens.values()].every((token) => !token.revokedAt),
    ).toBe(true);
  });

  it('returns a safe server error if refresh-token revocation fails', async () => {
    const registration = await register();
    const cookie = refreshCookie(registration);
    stores.refreshTokenUpdateManyError = new Error('database failure');

    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
      .set('Origin', origin);

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({
      code: 'INTERNAL',
      message: 'Something went wrong',
    });
    expect(response.headers['set-cookie'][0]).toMatch(/resolvehq_refresh=;/);
    expect(response.text).not.toContain('database failure');
    stores.refreshTokenUpdateManyError = undefined;
    const oldAccess = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`);
    expect(oldAccess.status).toBe(401);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });

  it('rotates refresh tokens and revokes a token family after reuse', async () => {
    const registration = await register();
    const oldCookie = refreshCookie(registration);
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie);

    expect(rotated.status).toBe(200);
    expect(rotated.body.data.accessToken).toBeTruthy();
    const newCookie = refreshCookie(rotated);
    expect(newCookie).not.toBe(oldCookie);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
    expect(
      [...stores.refreshTokens.values()].every((token) => token.revokedAt),
    ).toBe(true);

    const invalidatedAccess = await request(protectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`);
    expect(invalidatedAccess.status).toBe(401);
    expect(invalidatedAccess.body.error.code).toBe('INVALID_TOKEN');
  });

  it('does not leave a usable refresh token when reuse races token creation', async () => {
    const registration = await register();
    const oldCookie = refreshCookie(registration);
    let signalCreateStarted;
    let releaseCreate;
    const createStarted = new Promise((resolve) => {
      signalCreateStarted = resolve;
    });
    const holdCreate = new Promise((resolve) => {
      releaseCreate = resolve;
    });

    stores.beforeRefreshTokenCreate = async () => {
      stores.beforeRefreshTokenCreate = undefined;
      signalCreateStarted();
      await holdCreate;
    };

    const winningRefreshPromise = request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie)
      .then((response) => response);

    await createStarted;
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', oldCookie);
    expect(reuse.status).toBe(401);

    releaseCreate();
    const winningRefresh = await winningRefreshPromise;
    expect(winningRefresh.status).toBe(401);

    const user = stores.usersByEmail.get('person@example.com');
    expect(user.tokenVersion).toBe(1);
    expect(
      [...stores.refreshTokens.values()]
        .filter((token) => String(token.user) === user._id)
        .every(
          (token) =>
            token.revokedAt != null || token.tokenVersion !== user.tokenVersion,
        ),
    ).toBe(true);
  });

  it('logs out, revokes the refresh token and clears the cookie', async () => {
    const registration = await register();
    const cookie = refreshCookie(registration);
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie);

    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie'][0]).toMatch(/resolvehq_refresh=;/);
    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });
});
