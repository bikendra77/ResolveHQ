import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-body.js';
import {
  loginEmailRateLimit,
  loginIpRateLimit,
  refreshRateLimit,
  registerRateLimit,
} from './auth.rate-limit.js';
import {
  loginController,
  logoutController,
  logoutAllController,
  meController,
  refreshController,
  registerController,
} from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schema.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  registerRateLimit,
  registerController,
);
authRouter.post(
  '/login',
  validateBody(loginSchema),
  loginIpRateLimit,
  loginEmailRateLimit,
  loginController,
);
authRouter.post('/refresh', refreshRateLimit, refreshController);
authRouter.post('/logout', logoutController);
authRouter.get('/me', authenticate, meController);
authRouter.post('/logout-all', authenticate, logoutAllController);
