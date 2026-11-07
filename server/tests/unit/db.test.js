import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  connection: { readyState: 0 },
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('mongoose', () => ({
  default: {
    connect: mocks.connect,
    disconnect: mocks.disconnect,
    connection: mocks.connection,
  },
}));

vi.mock('dotenv/config', () => ({}));

vi.mock('../../src/config/logger.js', () => ({
  logger: { info: mocks.info, error: mocks.error },
}));

import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';

describe('database connection lifecycle', () => {
  beforeEach(() => {
    mocks.connection.readyState = 0;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('connects once with validated configuration and safe pool options', async () => {
    const connection = { readyState: 1 };
    mocks.connect.mockResolvedValue(connection);

    await expect(connectDatabase()).resolves.toBe(connection);

    expect(mocks.connect).toHaveBeenCalledWith(
      'mongodb://127.0.0.1:27017/resolvehq-test',
      {
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 5000,
      },
    );
    expect(mocks.info).toHaveBeenCalledWith('MongoDB connected');
  });

  it('shares an in-flight connection attempt', async () => {
    let resolveConnection;
    const connection = { readyState: 1 };
    mocks.connect.mockReturnValue(
      new Promise((resolveConnect) => {
        resolveConnection = resolveConnect;
      }),
    );

    const firstAttempt = connectDatabase();
    const secondAttempt = connectDatabase();
    resolveConnection(connection);

    await expect(Promise.all([firstAttempt, secondAttempt])).resolves.toEqual([
      connection,
      connection,
    ]);
    expect(mocks.connect).toHaveBeenCalledOnce();
  });

  it('logs connection errors without logging the URI or error message', async () => {
    const failure = new Error(
      'Unable to connect to mongodb://user:password@db.example',
    );
    mocks.connect.mockRejectedValue(failure);

    await expect(connectDatabase()).rejects.toBe(failure);

    expect(mocks.error).toHaveBeenCalledWith(
      { errorName: 'Error' },
      'MongoDB connection failed. Verify MongoDB is running and MONGODB_URI points to a reachable database.',
    );
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('password');
  });

  it('disconnects an active connection and logs the result', async () => {
    mocks.connection.readyState = 1;
    mocks.disconnect.mockResolvedValue();

    await expect(disconnectDatabase()).resolves.toBeUndefined();

    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith('MongoDB disconnected');
  });
});
