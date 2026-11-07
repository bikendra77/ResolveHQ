import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { backendProxyTarget, resolveBackendPort } from './dev-config.mjs';

describe('development backend port configuration', () => {
  it('uses port 4000 by default', () => {
    assert.equal(resolveBackendPort(undefined, undefined), 4000);
    assert.equal(
      backendProxyTarget(resolveBackendPort(undefined, undefined)),
      'http://localhost:4000',
    );
  });

  it('uses the server environment port when no shell override exists', () => {
    const port = resolveBackendPort(undefined, '4107');

    assert.equal(port, 4107);
    assert.equal(backendProxyTarget(port), 'http://localhost:4107');
  });

  it('prefers an explicit shell port over the server environment port', () => {
    assert.equal(resolveBackendPort('4200', '4107'), 4200);
  });

  it('rejects invalid backend ports', () => {
    for (const value of ['', '0', '-1', '65536', 'abc', '4000.5']) {
      assert.throws(() => resolveBackendPort(value), {
        message: 'PORT must be an integer between 1 and 65535.',
      });
    }
  });
});
