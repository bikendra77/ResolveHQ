import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-body.js';
import { invitationAcceptRateLimit } from './organizations.rate-limit.js';
import { acceptInvitationController } from './invitations.controller.js';
import { acceptInvitationSchema } from './invitations.schema.js';

export const invitationAcceptanceRouter = Router();

invitationAcceptanceRouter.post(
  '/accept',
  invitationAcceptRateLimit,
  authenticate,
  validateBody(acceptInvitationSchema),
  acceptInvitationController,
);
