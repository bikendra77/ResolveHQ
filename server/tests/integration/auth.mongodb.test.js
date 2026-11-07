import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('dotenv/config', () => ({}));

import {
  assertSafeMongoIntegrationCleanup,
  createMongoIntegrationTarget,
} from './mongodb-test-target.js';

const integrationEnabled = process.env.RESOLVEHQ_MONGODB_INTEGRATION === '1';
const integrationTarget = integrationEnabled
  ? createMongoIntegrationTarget(
      process.env.RESOLVEHQ_MONGODB_INTEGRATION_URI,
      process.pid,
    )
  : null;
const testMongoUri =
  integrationTarget?.uri ??
  'mongodb://127.0.0.1:27018/resolvehq-integration-skipped?replicaSet=rs0';
const testEnvironment = {
  NODE_ENV: 'test',
  MONGODB_URI: testMongoUri,
  JWT_ACCESS_SECRET: 'resolvehq-auth-integration-secret-only',
  BCRYPT_COST: '4',
  CLIENT_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
};
const previousEnvironment = Object.fromEntries(
  Object.keys(testEnvironment).map((key) => [key, process.env[key]]),
);

for (const [key, value] of Object.entries(testEnvironment)) {
  process.env[key] = value;
}

const [{ app }, { User }, { RefreshToken }, { refreshCookieName }] =
  await Promise.all([
    import('../../src/app.js'),
    import('../../src/modules/auth/models/user.model.js'),
    import('../../src/modules/auth/models/refresh-token.model.js'),
    import('../../src/modules/auth/auth.controller.js'),
  ]);

const origin = 'http://localhost:5173';
const password = 'a sufficiently long password';

afterAll(async () => {
  let cleanupError;
  try {
    if (
      integrationEnabled &&
      mongoose.connection.readyState === 1 &&
      integrationTarget
    ) {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      assertSafeMongoIntegrationCleanup(
        integrationTarget,
        mongoose.connection,
        hello,
      );
      await mongoose.connection.dropDatabase();
    }
  } catch (error) {
    cleanupError = error;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
  if (cleanupError) throw cleanupError;
});

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function getRefreshToken(response) {
  const prefix = `${refreshCookieName}=`;
  const cookie = response.headers['set-cookie']?.find((value) =>
    value.startsWith(prefix),
  );
  if (!cookie) {
    throw new Error('Authentication response did not set a refresh cookie');
  }
  return decodeURIComponent(cookie.split(';', 1)[0].slice(prefix.length));
}

function cookie(token) {
  return `${refreshCookieName}=${token}`;
}

async function register(email = 'person@example.com') {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Test Person',
    email,
    password,
  });
}

async function clearTestData() {
  await Promise.all([RefreshToken.deleteMany({}), User.deleteMany({})]);
}

describe.skipIf(!integrationEnabled)('MongoDB-backed authentication', () => {
  beforeAll(async () => {
    if (!integrationTarget) {
      throw new Error('MongoDB integration target was not configured');
    }
    const connection = await mongoose.connect(testMongoUri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 3000,
    });
    const hello = await connection.connection.db.admin().command({ hello: 1 });
    assertSafeMongoIntegrationCleanup(
      integrationTarget,
      connection.connection,
      hello,
    );
    await Promise.all([User.init(), RefreshToken.init()]);
  }, 5000);

  beforeEach(clearTestData);

  it('persists registration with a password hash and hashed refresh token', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      name: 'Test Person',
      email: 'person@example.com',
    });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');

    const user = await User.findOne({ email: 'person@example.com' }).select(
      '+passwordHash',
    );
    expect(user).not.toBeNull();
    expect(user.passwordHash).not.toBe(password);
    await expect(
      (await import('bcrypt')).default.compare(password, user.passwordHash),
    ).resolves.toBe(true);

    const rawRefreshToken = getRefreshToken(response);
    const storedToken = await RefreshToken.findOne({
      tokenHash: hashToken(rawRefreshToken),
    });
    expect(storedToken).not.toBeNull();
    expect(storedToken.user.toString()).toBe(user._id.toString());
    expect(storedToken.tokenHash).not.toBe(rawRefreshToken);
  });

  it('authenticates persisted users and records the login session', async () => {
    expect((await register()).status).toBe(201);

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'PERSON@example.com',
      password,
    });

    expect(response.status).toBe(200);
    const user = await User.findOne({ email: 'person@example.com' });
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    const token = await RefreshToken.findOne({
      tokenHash: hashToken(getRefreshToken(response)),
    });
    expect(token).not.toBeNull();
    expect(token.user.toString()).toBe(user._id.toString());

    const invalidLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'person@example.com', password: 'incorrect password' });
    expect(invalidLogin.status).toBe(401);
  });

  it('rotates refresh tokens and revokes the persisted family after reuse', async () => {
    const registration = await register();
    const oldRefreshToken = getRefreshToken(registration);
    const original = await RefreshToken.findOne({
      tokenHash: hashToken(oldRefreshToken),
    });

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie(oldRefreshToken));
    expect(rotated.status).toBe(200);
    const newRefreshToken = getRefreshToken(rotated);
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    const oldRecord = await RefreshToken.findById(original._id);
    const newRecord = await RefreshToken.findOne({
      tokenHash: hashToken(newRefreshToken),
    });
    expect(oldRecord.revokedAt).toBeInstanceOf(Date);
    expect(newRecord.family).toBe(original.family);
    expect(newRecord.revokedAt).toBeFalsy();

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie(oldRefreshToken));
    expect(replay.status).toBe(401);

    const user = await User.findById(original.user);
    const familyTokens = await RefreshToken.find({ family: original.family });
    expect(user.tokenVersion).toBe(1);
    expect(familyTokens.length).toBeGreaterThanOrEqual(2);
    expect(familyTokens.every((token) => token.revokedAt instanceof Date)).toBe(
      true,
    );

    const oldAccessToken = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`);
    expect(oldAccessToken.status).toBe(401);
  });

  it('revokes the refresh family when rotation and replay race concurrently', async () => {
    const registration = await register();
    const rawRefreshToken = getRefreshToken(registration);
    const original = await RefreshToken.findOne({
      tokenHash: hashToken(rawRefreshToken),
    });

    const responses = await Promise.all([
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', cookie(rawRefreshToken)),
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', cookie(rawRefreshToken)),
    ]);

    expect(responses.map(({ status }) => status)).toContain(401);
    expect(responses.every(({ status }) => [200, 401].includes(status))).toBe(
      true,
    );
    const user = await User.findById(original.user);
    const familyTokens = await RefreshToken.find({ family: original.family });
    expect(user.tokenVersion).toBeGreaterThan(0);
    expect(familyTokens.length).toBeGreaterThanOrEqual(1);
    expect(familyTokens.every((token) => token.revokedAt instanceof Date)).toBe(
      true,
    );

    for (const response of responses.filter(({ status }) => status === 200)) {
      const profile = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${response.body.data.accessToken}`);
      expect(profile.status).toBe(401);
    }
  });

  it('revokes the logged-out refresh token in MongoDB', async () => {
    const registration = await register();
    const rawRefreshToken = getRefreshToken(registration);
    const stored = await RefreshToken.findOne({
      tokenHash: hashToken(rawRefreshToken),
    });

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookie(rawRefreshToken));
    expect(logout.status).toBe(204);

    const revoked = await RefreshToken.findById(stored._id);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', cookie(rawRefreshToken));
    expect(reuse.status).toBe(401);
  });

  it('revokes all of the user’s sessions and invalidates their access tokens', async () => {
    const registration = await register();
    const secondSession = await request(app).post('/api/v1/auth/login').send({
      email: 'person@example.com',
      password,
    });
    const anotherUser = await register('another@example.com');
    const rawSecondRefreshToken = getRefreshToken(secondSession);

    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
      .set('Origin', origin)
      .set('Cookie', cookie(rawSecondRefreshToken));
    expect(response.status).toBe(204);

    const user = await User.findOne({ email: 'person@example.com' });
    expect(user.tokenVersion).toBe(1);
    const ownTokens = await RefreshToken.find({ user: user._id });
    expect(ownTokens.length).toBe(2);
    expect(ownTokens.every((token) => token.revokedAt instanceof Date)).toBe(
      true,
    );

    const ownAccess = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${secondSession.body.data.accessToken}`);
    expect(ownAccess.status).toBe(401);

    const otherUser = await User.findOne({ email: 'another@example.com' });
    const otherToken = await RefreshToken.findOne({ user: otherUser._id });
    expect(otherToken.revokedAt).toBeFalsy();
    const otherProfile = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${anotherUser.body.data.accessToken}`);
    expect(otherProfile.status).toBe(200);
  });

  it('rejects logout-all without an Origin and leaves database records unchanged', async () => {
    const registration = await register();
    const rawRefreshToken = getRefreshToken(registration);
    const stored = await RefreshToken.findOne({
      tokenHash: hashToken(rawRefreshToken),
    });

    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${registration.body.data.accessToken}`)
      .set('Cookie', cookie(rawRefreshToken));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const user = await User.findById(stored.user);
    const token = await RefreshToken.findById(stored._id);
    expect(user.tokenVersion).toBe(0);
    expect(token.revokedAt).toBeFalsy();
  });
});
