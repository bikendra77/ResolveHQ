import helmet from 'helmet';
import { env } from '../config/env.js';

export function createSecurityHeaders({
  nodeEnv = env.NODE_ENV,
  httpsEnabled = env.HTTPS_ENABLED,
} = {}) {
  const enableHsts = nodeEnv === 'production' && httpsEnabled;

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        ...(enableHsts ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    frameguard: { action: 'deny' },
    hsts: enableHsts
      ? { maxAge: 15552000, includeSubDomains: false, preload: false }
      : false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

export const securityHeaders = createSecurityHeaders();
