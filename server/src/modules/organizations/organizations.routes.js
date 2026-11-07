import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { loadContext } from '../../middleware/load-context.js';
import { resolveOrganization } from '../../middleware/resolve-organization.js';
import { validateBody } from '../../middleware/validate-body.js';
import {
  createOrganizationController,
  getOrganizationController,
  listOrganizationMembersController,
  listOrganizationsController,
} from './organizations.controller.js';
import { createOrganizationSchema } from './organizations.schema.js';

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
organizationsRouter.get(
  '/:organizationId',
  resolveOrganization,
  getOrganizationController,
);
