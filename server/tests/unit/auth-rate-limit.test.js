import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { createAuthRateLimiter } from '../../src/modules/auth/auth.rate-limit.js';

describe('authentication rate limiting', () => {
  it('returns a centralized 429 response with Retry-After when the limit is reached', async () => {
    const app = express();
    app.get(
      '/limited',
      createAuthRateLimiter({
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
  });
});
