import { describe, expect, it } from 'vitest';
import { authorize } from '../../src/middleware/authorize.js';
import { ApiError } from '../../src/utils/api-error.js';

function runAuthorization(permission, role) {
  let receivedError;
  let nextCalled = false;
  const middleware = authorize(permission);

  middleware(role === undefined ? {} : { ctx: { role } }, {}, (error) => {
    receivedError = error;
    nextCalled = true;
  });

  return { receivedError, nextCalled };
}

describe('authorization middleware', () => {
  it.each(['owner', 'admin', 'member', 'viewer'])(
    'allows %s to read organization members',
    (role) => {
      expect(runAuthorization('member:read', role)).toEqual({
        receivedError: undefined,
        nextCalled: true,
      });
    },
  );

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['viewer', false],
  ])('applies %s permissions when inviting members', (role, allowed) => {
    const result = runAuthorization('member:invite', role);

    expect(result.nextCalled).toBe(true);
    if (allowed) {
      expect(result.receivedError).toBeUndefined();
    } else {
      expect(result.receivedError).toBeInstanceOf(ApiError);
      expect(result.receivedError).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    }
  });

  it('denies access when organization context is missing or invalid', () => {
    for (const role of [undefined, 'unknown']) {
      const result = runAuthorization('member:read', role);
      expect(result.receivedError).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
    }
  });
});
