import mongoose from 'mongoose';

async function assertTransactionTopology(connection) {
  if (connection.readyState !== 1 || !connection.db) {
    throw new Error('MongoDB must be connected before starting a transaction.');
  }

  const topology = await connection.db.admin().command({ hello: 1 });
  const isReplicaSet =
    typeof topology.setName === 'string' && topology.setName.length > 0;
  const isShardedCluster = topology.msg === 'isdbgrid';

  if (!isReplicaSet && !isShardedCluster) {
    throw new Error(
      'MongoDB transactions require a replica set or sharded cluster.',
    );
  }
}

/**
 * Runs database work inside a Mongoose transaction.
 * Pass the received session to every query and write that should participate.
 * Mongoose may retry the callback for transient transaction errors, so keep
 * non-database side effects outside this callback.
 *
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Transaction callback must be a function.');
  }

  const connection = mongoose.connection;
  await assertTransactionTopology(connection);

  const session = await connection.startSession();
  let result;
  let transactionFailed = false;
  let transactionError;
  let cleanupFailed = false;
  let cleanupError;

  try {
    result = await session.withTransaction(() => callback(session));
  } catch (error) {
    transactionFailed = true;
    transactionError = error;
  } finally {
    try {
      await session.endSession();
    } catch (error) {
      cleanupFailed = true;
      cleanupError = error;
    }
  }

  if (transactionFailed && cleanupFailed) {
    throw new AggregateError(
      [transactionError, cleanupError],
      'The transaction failed and its MongoDB session could not be ended.',
      { cause: cleanupError },
    );
  }

  if (transactionFailed) {
    throw transactionError;
  }

  if (cleanupFailed) {
    throw cleanupError;
  }

  return result;
}
