import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startServer } from '../../src/server.js';

function createServerHarness() {
  const calls = [];
  const processRef = new EventEmitter();
  processRef.exitCode = 0;

  const server = new EventEmitter();
  server.close = vi.fn((callback) => {
    calls.push('close');
    setImmediate(() => callback());
  });

  const application = {
    listen: vi.fn(() => {
      calls.push('listen');
      setImmediate(() => server.emit('listening'));
      return server;
    }),
  };

  const log = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() };
  const connect = vi.fn(async () => calls.push('connect'));
  const disconnect = vi.fn(async () => calls.push('disconnect'));

  return {
    application,
    calls,
    connect,
    disconnect,
    log,
    processRef,
    server,
  };
}

describe('HTTP server lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects before listening and shuts down idempotently', async () => {
    const harness = createServerHarness();
    const runtime = await startServer({
      ...harness,
      port: 0,
    });

    expect(harness.calls).toEqual(['connect', 'listen']);
    expect(harness.application.listen).toHaveBeenCalledWith(0);

    harness.processRef.emit('SIGTERM');
    const firstShutdown = runtime.shutdown('SIGTERM');
    const secondShutdown = runtime.shutdown('SIGINT');
    expect(firstShutdown).toBe(secondShutdown);

    await firstShutdown;

    expect(harness.calls).toEqual(['connect', 'listen', 'close', 'disconnect']);
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(harness.disconnect).toHaveBeenCalledOnce();
    expect(harness.processRef.listenerCount('SIGINT')).toBe(0);
    expect(harness.processRef.listenerCount('SIGTERM')).toBe(0);
  });

  it('does not listen when the database connection fails', async () => {
    const harness = createServerHarness();
    const failure = new Error('database unavailable');
    harness.connect.mockRejectedValue(failure);

    await expect(startServer(harness)).rejects.toBe(failure);

    expect(harness.application.listen).not.toHaveBeenCalled();
    expect(harness.disconnect).not.toHaveBeenCalled();
  });

  it('marks the process as failed on an HTTP server error', async () => {
    const harness = createServerHarness();
    await startServer(harness);

    harness.server.emit('error', new Error('server error'));

    expect(harness.log.fatal).toHaveBeenCalledWith(
      { errorName: 'Error' },
      'ResolveHQ HTTP server error',
    );
    expect(harness.processRef.exitCode).toBe(1);
  });

  it('disconnects the database if the HTTP listener fails to start', async () => {
    const harness = createServerHarness();
    const failure = new Error('port unavailable');
    harness.application.listen.mockImplementation(() => {
      const server = new EventEmitter();
      setImmediate(() => server.emit('error', failure));
      return server;
    });

    await expect(startServer(harness)).rejects.toBe(failure);

    expect(harness.disconnect).toHaveBeenCalledOnce();
    expect(harness.processRef.listenerCount('SIGINT')).toBe(0);
    expect(harness.processRef.listenerCount('SIGTERM')).toBe(0);
  });
});
