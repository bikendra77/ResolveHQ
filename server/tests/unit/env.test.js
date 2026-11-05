import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv/config', () => ({}));

const environmentKeys = [
  'NODE_ENV',
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL_DAYS',
  'BCRYPT_COST',
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
  return import('../../src/config/env.js');
}

describe('environment validation', () => {
  it('provides an isolated URI in test mode without requiring a database', async () => {
    const { env } = await loadEnvironment('test');

    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/resolvehq-test');
    expect(env.BCRYPT_COST).toBe(4);
    expect(env.ACCESS_TOKEN_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
  });

  it('requires a MongoDB URI outside test mode', async () => {
    await expect(loadEnvironment('development')).rejects.toThrow();
  });

  it('requires a non-placeholder access secret outside test mode', async () => {
    await expect(
      loadEnvironment('development', {
        MONGODB_URI: 'mongodb://127.0.0.1:27017/resolvehq',
        JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-bytes',
      }),
    ).rejects.toThrow();
  });

  it('requires a client origin in production', async () => {
    await expect(
      loadEnvironment('production', {
        MONGODB_URI: 'mongodb://127.0.0.1:27017/resolvehq',
        JWT_ACCESS_SECRET: 'a'.repeat(32),
      }),
    ).rejects.toThrow();
  });

  it('rejects non-MongoDB URI protocols', async () => {
    await expect(
      loadEnvironment('development', {
        MONGODB_URI: 'https://example.com',
      }),
    ).rejects.toThrow();
  });
});
