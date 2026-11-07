import { describe, expect, it } from 'vitest';
import {
  assertSafeMongoIntegrationCleanup,
  createMongoIntegrationTarget,
} from '../integration/mongodb-test-target.js';

const approvedUri =
  'mongodb://127.0.0.1:27018/resolvehq-integration?replicaSet=rs0';

function uriWithCredentials() {
  const uri = new URL(approvedUri);
  uri.username = 'unit-test';
  uri.password = 'placeholder';
  return uri.toString();
}

describe('isolated MongoDB integration target', () => {
  it('creates a unique database under the approved loopback replica set', () => {
    const first = createMongoIntegrationTarget(approvedUri, 1234);
    const second = createMongoIntegrationTarget(approvedUri, 1234);

    expect(first.databaseName).toMatch(
      /^resolvehq-integration-1234-[0-9a-f]{32}$/,
    );
    expect(second.databaseName).not.toBe(first.databaseName);
    expect(new URL(first.uri).host).toBe('127.0.0.1:27018');
    expect(new URL(first.uri).searchParams.get('replicaSet')).toBe('rs0');
  });

  it('keeps generated database names at or below MongoDB’s 63-character limit', () => {
    const target = createMongoIntegrationTarget(
      approvedUri,
      Number.MAX_SAFE_INTEGER,
    );

    expect(target.databaseName.length).toBeLessThanOrEqual(63);
  });

  it.each([
    'mongodb://127.0.0.1:27017/resolvehq-integration?replicaSet=rs0',
    'mongodb://127.0.0.1:27018/resolvehq/resolvehq?replicaSet=rs0',
    'mongodb://localhost:27018/resolvehq-integration?replicaSet=rs0',
    'mongodb://127.0.0.1:27018/resolvehq-integration',
    uriWithCredentials(),
  ])('refuses an unsafe or unapproved URI: %s', (uri) => {
    expect(() => createMongoIntegrationTarget(uri, 1234)).toThrow();
  });

  it('permits cleanup only for the verified single-node rs0 target', () => {
    const target = createMongoIntegrationTarget(approvedUri, 1234);

    expect(() =>
      assertSafeMongoIntegrationCleanup(
        target,
        { name: target.databaseName, host: '127.0.0.1', port: 27018 },
        {
          setName: 'rs0',
          isWritablePrimary: true,
          hosts: ['127.0.0.1:27018'],
          me: '127.0.0.1:27018',
        },
      ),
    ).not.toThrow();
  });

  it('refuses cleanup when the connected database or replica set differs', () => {
    const target = createMongoIntegrationTarget(approvedUri, 1234);

    expect(() =>
      assertSafeMongoIntegrationCleanup(
        target,
        { name: 'production', host: '127.0.0.1', port: 27017 },
        {
          setName: 'rs0',
          isWritablePrimary: true,
          hosts: ['127.0.0.1:27018'],
          me: '127.0.0.1:27018',
        },
      ),
    ).toThrow(/Refusing MongoDB integration cleanup/);
    expect(() =>
      assertSafeMongoIntegrationCleanup(
        target,
        { name: target.databaseName, host: '127.0.0.1', port: 27018 },
        {
          setName: 'rs0',
          isWritablePrimary: true,
          hosts: ['127.0.0.1:27018', '127.0.0.1:27019'],
          me: '127.0.0.1:27018',
        },
      ),
    ).toThrow(/Refusing MongoDB integration cleanup/);
  });
});
