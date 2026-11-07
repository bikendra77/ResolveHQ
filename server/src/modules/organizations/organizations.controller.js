import {
  createOrganizationForUser,
  listOrganizationsForUser,
} from './organizations.service.js';

function publicOrganization(organization, role) {
  return {
    id: String(organization._id),
    name: organization.name,
    slug: organization.slug,
    role,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

export async function listOrganizationsController(req, res) {
  const memberships = await listOrganizationsForUser(req.user._id);
  return res.status(200).json({
    data: {
      organizations: memberships.map(({ organization, role }) =>
        publicOrganization(organization, role),
      ),
    },
  });
}

export async function createOrganizationController(req, res) {
  const { organization, membership } = await createOrganizationForUser(
    req.user._id,
    req.body.name,
  );

  return res.status(201).json({
    data: {
      organization: publicOrganization(organization, membership.role),
    },
  });
}

export function getOrganizationController(req, res) {
  return res.status(200).json({
    data: {
      organization: publicOrganization(req.organization, req.membership.role),
    },
  });
}
