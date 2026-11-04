import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv/config', () => ({}));

const originalNodeEnv = process.env.NODE_ENV;
const originalMongoUri = process.env.MONGODB_URI;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalMongoUri === undefined) {
    delete process.env.MONGODB_URI;
  } else {
    process.env.MONGODB_URI = originalMongoUri;
  }
  vi.resetModules();
});

async function loadEnvironment(nodeEnv, mongodbUri) {
  process.env.NODE_ENV = nodeEnv;
  if (mongodbUri === undefined) {
    delete process.env.MONGODB_URI;
  } else {
    process.env.MONGODB_URI = mongodbUri;
  }
  return import('../../src/config/env.js');
}

describe('environment validation', () => {
  it('provides an isolated URI in test mode without requiring a database', async () => {
    const { env } = await loadEnvironment('test');

    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/resolvehq-test');
  });

  it('requires a MongoDB URI outside test mode', async () => {
    await expect(loadEnvironment('development')).rejects.toThrow();
  });

  it('rejects non-MongoDB URI protocols', async () => {
    await expect(
      loadEnvironment('development', 'https://example.com'),
    ).rejects.toThrow();
  });
});
