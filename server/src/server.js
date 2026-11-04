import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

function errorName(error) {
  return error instanceof Error ? error.name : 'UnknownError';
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
      } else {
        resolveClose();
      }
    });
  });
}

export async function startServer({
  application = app,
  port = env.PORT,
  connect = connectDatabase,
  disconnect = disconnectDatabase,
  log = logger,
  processRef = process,
} = {}) {
  await connect();

  let server;
  try {
    server = application.listen(port);
    await once(server, 'listening');
  } catch (error) {
    try {
      await disconnect();
    } catch (disconnectError) {
      log.error(
        { errorName: errorName(disconnectError) },
        'MongoDB disconnect failed after server startup error',
      );
    }
    throw error;
  }

  log.info({ port }, 'ResolveHQ API listening');
  server.on('error', (error) => {
    log.fatal({ errorName: errorName(error) }, 'ResolveHQ HTTP server error');
    processRef.exitCode = 1;
  });

  let shutdownPromise;
  const shutdown = (signal) => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        log.info({ signal }, 'ResolveHQ API shutdown requested');
        const errors = [];

        try {
          await closeServer(server);
        } catch (error) {
          errors.push(error);
        }

        try {
          await disconnect();
        } catch (error) {
          errors.push(error);
        }

        if (errors.length > 0) {
          for (const error of errors) {
            log.error(
              { errorName: errorName(error) },
              'ResolveHQ API graceful shutdown failed',
            );
          }
          processRef.exitCode = 1;
          throw errors[0];
        }

        log.info('ResolveHQ API shutdown complete');
      })().finally(() => {
        processRef.removeListener('SIGINT', onSigint);
        processRef.removeListener('SIGTERM', onSigterm);
      });
    }
    return shutdownPromise;
  };

  const onSignal = (signal) => {
    shutdown(signal).catch(() => {
      processRef.exitCode = 1;
    });
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');

  processRef.once('SIGINT', onSigint);
  processRef.once('SIGTERM', onSigterm);

  return { server, shutdown };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  startServer().catch((error) => {
    logger.fatal(
      { errorName: errorName(error) },
      'Failed to start ResolveHQ API',
    );
    process.exitCode = 1;
  });
}
