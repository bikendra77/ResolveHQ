import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createSecurityHeaders } from '../../src/middleware/security-headers.js';

function appWithSecurityHeaders(options) {
  const app = express();
  app.use(createSecurityHeaders(options));
  app.get('/', (_req, res) => res.status(200).send('ok'));
  return app;
}

describe('security headers', () => {
  it('sets CSP, frame, MIME-sniffing, and referrer protections without HSTS by default', async () => {
    const response = await request(
      appWithSecurityHeaders({ nodeEnv: 'development', httpsEnabled: false }),
    ).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('does not enable HSTS for production without an HTTPS guarantee', async () => {
    const response = await request(
      appWithSecurityHeaders({ nodeEnv: 'production', httpsEnabled: false }),
    ).get('/');

    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('enables HSTS and insecure-request upgrades only for HTTPS production', async () => {
    const response = await request(
      appWithSecurityHeaders({ nodeEnv: 'production', httpsEnabled: true }),
    ).get('/');

    expect(response.headers['strict-transport-security']).toBe(
      'max-age=15552000',
    );
    expect(response.headers['content-security-policy']).toContain(
      'upgrade-insecure-requests',
    );
  });
});
