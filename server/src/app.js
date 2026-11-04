import { randomUUID } from 'node:crypto';
import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';

export const app = express();

app.disable('x-powered-by');
app.use(
  pinoHttp({
    logger,
    genReqId: () => randomUUID(),
  }),
);
app.use((req, res, next) => {
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(express.json({ limit: '10kb' }));

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(notFound);
app.use(errorHandler);
