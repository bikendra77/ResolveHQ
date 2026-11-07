import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveOrganization } from '../../middleware/resolve-organization.js';
import { validateBody } from '../../middleware/validate-body.js';
import {
  createOrganizationController,
  getOrganizationController,
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
  '/:organizationId',
  resolveOrganization,
  getOrganizationController,
);
