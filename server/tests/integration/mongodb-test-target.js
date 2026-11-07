import { randomUUID } from 'node:crypto';

const approvedDatabase = 'resolvehq-integration';
const approvedDatabasePattern = /^resolvehq-integration-\d{1,4}-[0-9a-f]{32}$/;
const approvedHosts = new Set(['127.0.0.1:27018', 'localhost:27018']);

export function createMongoIntegrationTarget(connectionString, processId) {
  let baseUri;
  try {
    baseUri = new URL(connectionString);
  } catch {
    throw new Error('Invalid MongoDB integration URI');
  }

  if (
    baseUri.protocol !== 'mongodb:' ||
    baseUri.hostname !== '127.0.0.1' ||
    baseUri.port !== '27018' ||
    baseUri.username ||
    baseUri.password ||
    baseUri.pathname !== `/${approvedDatabase}` ||
    baseUri.searchParams.get('replicaSet') !== 'rs0' ||
    baseUri.hash
  ) {
    throw new Error(
      'MongoDB integration tests require the approved database on 127.0.0.1:27018 with replicaSet=rs0',
    );
  }

  const databaseName = `${approvedDatabase}-${String(processId).slice(-4)}-${randomUUID().replaceAll('-', '')}`;
  if (!approvedDatabasePattern.test(databaseName)) {
    throw new Error('Generated MongoDB integration database is not approved');
  }

  baseUri.pathname = `/${databaseName}`;
  return { databaseName, uri: baseUri.toString() };
}

export function assertSafeMongoIntegrationCleanup(target, connection, hello) {
  let targetUri;
  try {
    targetUri = new URL(target.uri);
  } catch {
    throw new Error('Refusing MongoDB integration cleanup: invalid target URI');
  }

  if (
    !approvedDatabasePattern.test(target.databaseName) ||
    targetUri.protocol !== 'mongodb:' ||
    targetUri.hostname !== '127.0.0.1' ||
    targetUri.port !== '27018' ||
    targetUri.username ||
    targetUri.password ||
    targetUri.pathname !== `/${target.databaseName}` ||
    targetUri.searchParams.get('replicaSet') !== 'rs0' ||
    connection.name !== target.databaseName ||
    connection.host !== '127.0.0.1' ||
    connection.port !== 27018 ||
    hello.setName !== 'rs0' ||
    hello.isWritablePrimary !== true ||
    !Array.isArray(hello.hosts) ||
    hello.hosts.length !== 1 ||
    !approvedHosts.has(hello.hosts[0]) ||
    !approvedHosts.has(hello.me)
  ) {
    throw new Error(
      'Refusing MongoDB integration cleanup: connected database or replica set does not match the approved isolated target',
    );
  }
}
