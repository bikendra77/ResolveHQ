import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';

describe('shared rate-limit middleware', () => {
  it('returns a centralized 429 response with Retry-After at the configured limit', async () => {
    const app = express();
    app.get(
      '/limited',
      createRateLimiter({
        limit: 2,
        keyGenerator: () => 'test-client',
      }),
      (_req, res) => res.status(200).json({ status: 'ok' }),
    );
    app.use(errorHandler);

    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);
    const limited = await request(app).get('/limited');

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(limited.headers['ratelimit-limit']).toBe('2');
  });
});
