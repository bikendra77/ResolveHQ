import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callback: vi.fn(),
  command: vi.fn(),
  endSession: vi.fn(),
  withTransaction: vi.fn(),
  connection: {
    readyState: 1,
    db: { admin: vi.fn() },
    startSession: vi.fn(),
  },
}));

vi.mock('mongoose', () => ({
  default: { connection: mocks.connection },
}));

import { withTransaction } from '../../src/utils/transaction.js';

const session = {
  endSession: mocks.endSession,
  withTransaction: mocks.withTransaction,
};

describe('MongoDB transaction utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.readyState = 1;
    mocks.connection.db.admin.mockReturnValue({ command: mocks.command });
    mocks.command.mockResolvedValue({ setName: 'resolvehq-test-rs' });
    mocks.connection.startSession.mockResolvedValue(session);
    mocks.withTransaction.mockImplementation(async (callback) => callback());
    mocks.endSession.mockResolvedValue();
    mocks.callback.mockResolvedValue('committed result');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('checks topology and resolves the callback result through withTransaction', async () => {
    await expect(withTransaction(mocks.callback)).resolves.toBe(
      'committed result',
    );

    expect(mocks.command).toHaveBeenCalledWith({ hello: 1 });
    expect(mocks.connection.startSession).toHaveBeenCalledOnce();
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.callback).toHaveBeenCalledOnce();
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('passes the active session to the callback', async () => {
    await withTransaction(mocks.callback);

    expect(mocks.callback).toHaveBeenCalledWith(session);
  });

  it('accepts a sharded cluster topology', async () => {
    mocks.command.mockResolvedValue({ msg: 'isdbgrid' });

    await expect(withTransaction(mocks.callback)).resolves.toBe(
      'committed result',
    );

    expect(mocks.connection.startSession).toHaveBeenCalledOnce();
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('rejects standalone MongoDB without starting a session or falling back', async () => {
    const callback = vi.fn();
    mocks.command.mockResolvedValue({ isWritablePrimary: true });

    await expect(withTransaction(callback)).rejects.toThrow(
      'MongoDB transactions require a replica set or sharded cluster.',
    );

    expect(mocks.connection.startSession).not.toHaveBeenCalled();
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects an unconnected MongoDB connection before capability checks', async () => {
    mocks.connection.readyState = 0;

    await expect(withTransaction(mocks.callback)).rejects.toThrow(
      'MongoDB must be connected before starting a transaction.',
    );

    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.connection.startSession).not.toHaveBeenCalled();
  });

  it('propagates callback application errors and still ends the session', async () => {
    const applicationError = new Error('organization validation failed');
    mocks.callback.mockRejectedValue(applicationError);

    await expect(withTransaction(mocks.callback)).rejects.toBe(
      applicationError,
    );

    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('propagates transaction failures and still ends the session', async () => {
    const transactionError = new Error('transaction commit failed');
    mocks.withTransaction.mockRejectedValue(transactionError);

    await expect(withTransaction(mocks.callback)).rejects.toBe(
      transactionError,
    );

    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('preserves both transaction and cleanup errors if ending the session fails', async () => {
    const transactionError = new Error('transaction failed');
    const cleanupError = new Error('session cleanup failed');
    mocks.withTransaction.mockRejectedValue(transactionError);
    mocks.endSession.mockRejectedValue(cleanupError);

    let receivedError;
    try {
      await withTransaction(mocks.callback);
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBeInstanceOf(AggregateError);
    expect(receivedError.errors).toEqual([transactionError, cleanupError]);
    expect(receivedError.cause).toBe(cleanupError);
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('propagates a session cleanup error after a successful transaction', async () => {
    const cleanupError = new Error('session cleanup failed');
    mocks.endSession.mockRejectedValue(cleanupError);

    await expect(withTransaction(mocks.callback)).rejects.toBe(cleanupError);
  });

  it('does not return a result or retry work outside a failed transaction', async () => {
    const transactionError = new Error('transaction commit failed');
    const databaseOperation = vi.fn();
    const callback = vi.fn(async (activeSession) => {
      databaseOperation(activeSession);
      return 'uncommitted result';
    });
    mocks.withTransaction.mockImplementation(async (transactionCallback) => {
      await transactionCallback();
      throw transactionError;
    });

    await expect(withTransaction(callback)).rejects.toBe(transactionError);

    expect(databaseOperation).toHaveBeenCalledOnce();
    expect(databaseOperation).toHaveBeenCalledWith(session);
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('rejects non-function callbacks without opening a session', async () => {
    await expect(withTransaction(null)).rejects.toThrow(TypeError);

    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.connection.startSession).not.toHaveBeenCalled();
  });
});
