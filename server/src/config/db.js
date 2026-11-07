import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

let connectionPromise;
let disconnectionPromise;

function errorName(error) {
  return error instanceof Error ? error.name : 'UnknownError';
}

export function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
    })
    .then((connection) => {
      logger.info('MongoDB connected');
      return connection;
    })
    .catch((error) => {
      logger.error(
        { errorName: errorName(error) },
        'MongoDB connection failed. Verify MongoDB is running and MONGODB_URI points to a reachable database.',
      );
      throw error;
    })
    .finally(() => {
      connectionPromise = undefined;
    });

  return connectionPromise;
}

export function disconnectDatabase() {
  if (disconnectionPromise) {
    return disconnectionPromise;
  }

  disconnectionPromise = (async () => {
    if (connectionPromise) {
      await connectionPromise;
    }
    if (mongoose.connection.readyState === 0) {
      return;
    }

    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected');
    } catch (error) {
      logger.error(
        { errorName: errorName(error) },
        'MongoDB disconnection failed',
      );
      throw error;
    }
  })().finally(() => {
    disconnectionPromise = undefined;
  });

  return disconnectionPromise;
}
