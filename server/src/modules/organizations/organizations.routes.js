import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { loadContext } from '../../middleware/load-context.js';
import { resolveOrganization } from '../../middleware/resolve-organization.js';
import { validateBody } from '../../middleware/validate-body.js';
import {
  changeMemberRoleController,
  createOrganizationController,
  getOrganizationController,
  listOrganizationMembersController,
  listOrganizationsController,
  removeMemberController,
} from './organizations.controller.js';
import {
  createInvitationController,
  listInvitationsController,
  revokeInvitationController,
} from './invitations.controller.js';
import {
  changeMemberRoleSchema,
  createOrganizationSchema,
} from './organizations.schema.js';
import { createInvitationSchema } from './invitations.schema.js';

export const organizationsRouter = Router();

organizationsRouter.use(authenticate);
organizationsRouter.get('/', listOrganizationsController);
organizationsRouter.post(
  '/',
  validateBody(createOrganizationSchema),
  createOrganizationController,
);
organizationsRouter.get(
  '/:organizationId/members',
  loadContext,
  authorize('member:read'),
  listOrganizationMembersController,
);
organizationsRouter.patch(
  '/:organizationId/members/:userId',
  loadContext,
  authorize('member:role'),
  validateBody(changeMemberRoleSchema),
  changeMemberRoleController,
);
organizationsRouter.delete(
  '/:organizationId/members/:userId',
  loadContext,
  authorize('member:remove'),
  removeMemberController,
);
organizationsRouter.post(
  '/:organizationId/invitations',
  loadContext,
  authorize('member:invite'),
  validateBody(createInvitationSchema),
  createInvitationController,
);
organizationsRouter.get(
  '/:organizationId/invitations',
  loadContext,
  authorize('member:invite'),
  listInvitationsController,
);
organizationsRouter.delete(
  '/:organizationId/invitations/:invitationId',
  loadContext,
  authorize('member:invite'),
  revokeInvitationController,
);
organizationsRouter.get(
  '/:organizationId',
  resolveOrganization,
  getOrganizationController,
);
