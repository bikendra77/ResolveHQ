import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv/config', () => ({}));

const environmentKeys = [
  'NODE_ENV',
  'LOG_LEVEL',
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL_DAYS',
  'BCRYPT_COST',
  'ORGANIZATION_CREATE_RATE_LIMIT',
  'ORGANIZATION_INVITATION_RATE_LIMIT',
  'INVITATION_ACCEPT_RATE_LIMIT',
  'MEMBER_MUTATION_RATE_LIMIT',
  'HTTPS_ENABLED',
  'CLIENT_ORIGIN',
];
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
});

async function loadEnvironment(nodeEnv, values = {}) {
  process.env.NODE_ENV = nodeEnv;
  for (const key of environmentKeys.slice(1)) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  vi.resetModules();
  return import('../../src/config/env.js');
}

describe('environment validation', () => {
  it('provides an isolated URI in test mode without requiring a database', async () => {
    const { env } = await loadEnvironment('test');

    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/resolvehq-test');
    expect(env.BCRYPT_COST).toBe(4);
    expect(env.ACCESS_TOKEN_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.ORGANIZATION_CREATE_RATE_LIMIT).toBe(1000);
    expect(env.ORGANIZATION_INVITATION_RATE_LIMIT).toBe(1000);
    expect(env.INVITATION_ACCEPT_RATE_LIMIT).toBe(1000);
    expect(env.MEMBER_MUTATION_RATE_LIMIT).toBe(1000);
    expect(env.HTTPS_ENABLED).toBe(false);
  });

  it('loads configured production rate limits and HTTPS deployment state', async () => {
    const { env } = await loadEnvironment('production', {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/resolvehq',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      CLIENT_ORIGIN: 'https://resolvehq.example',
      ORGANIZATION_CREATE_RATE_LIMIT: '3',
      ORGANIZATION_INVITATION_RATE_LIMIT: '12',
      INVITATION_ACCEPT_RATE_LIMIT: '7',
      MEMBER_MUTATION_RATE_LIMIT: '18',
      HTTPS_ENABLED: 'true',
    });

    expect(env.ORGANIZATION_CREATE_RATE_LIMIT).toBe(3);
    expect(env.ORGANIZATION_INVITATION_RATE_LIMIT).toBe(12);
    expect(env.INVITATION_ACCEPT_RATE_LIMIT).toBe(7);
    expect(env.MEMBER_MUTATION_RATE_LIMIT).toBe(18);
    expect(env.HTTPS_ENABLED).toBe(true);
  });

  it('rejects invalid rate limits and HTTPS configuration', async () => {
    await expect(
      loadEnvironment('development', {
        ORGANIZATION_CREATE_RATE_LIMIT: '0',
      }),
    ).rejects.toThrow(/ORGANIZATION_CREATE_RATE_LIMIT/);
    await expect(
      loadEnvironment('development', {
        HTTPS_ENABLED: 'yes',
      }),
    ).rejects.toThrow(/HTTPS_ENABLED/);
  });

  it('rejects verbose logging and non-HTTPS client origins in production', async () => {
    const productionEnvironment = {
      MONGODB_URI: 'mongodb://127.0.0.1:27017/resolvehq',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      CLIENT_ORIGIN: 'https://resolvehq.example',
    };

    await expect(
      loadEnvironment('production', {
        ...productionEnvironment,
        LOG_LEVEL: 'debug',
      }),
    ).rejects.toThrow(/LOG_LEVEL/);
    await expect(
      loadEnvironment('production', {
        ...productionEnvironment,
        LOG_LEVEL: 'trace',
      }),
    ).rejects.toThrow(/LOG_LEVEL/);
    await expect(
      loadEnvironment('production', {
        ...productionEnvironment,
        CLIENT_ORIGIN: 'http://resolvehq.example',
      }),
    ).rejects.toThrow(/CLIENT_ORIGIN/);
  });

  it('requires a MongoDB URI outside test mode', async () => {
    await expect(loadEnvironment('development')).rejects.toThrow(
      /MONGODB_URI.*JWT_ACCESS_SECRET/,
    );
  });

  it('requires a non-placeholder access secret outside test mode', async () => {
    await expect(
      loadEnvironment('development', {
        MONGODB_URI: 'mongodb://127.0.0.1:27017/resolvehq',
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-bytes',
      }),
    ).rejects.toThrow(/JWT_ACCESS_SECRET/);
  });

  it('requires a client origin in production', async () => {
    await expect(
      loadEnvironment('production', {
        MONGODB_URI: 'mongodb://127.0.0.1:27017/resolvehq',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
      }),
    ).rejects.toThrow(/CLIENT_ORIGIN/);
  });

  it('rejects non-MongoDB URI protocols', async () => {
    await expect(
      loadEnvironment('development', {
        MONGODB_URI: 'https://example.com',
      }),
    ).rejects.toThrow();
  });
});
