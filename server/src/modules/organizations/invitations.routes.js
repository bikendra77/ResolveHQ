import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateBody } from '../../middleware/validate-body.js';
import { acceptInvitationController } from './invitations.controller.js';
import { acceptInvitationSchema } from './invitations.schema.js';

export const invitationAcceptanceRouter = Router();

invitationAcceptanceRouter.post(
  '/accept',
  authenticate,
  validateBody(acceptInvitationSchema),
  acceptInvitationController,
);
