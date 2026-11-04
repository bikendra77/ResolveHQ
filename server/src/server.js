import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'ResolveHQ API listening');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'Failed to start ResolveHQ API');
  process.exitCode = 1;
});
