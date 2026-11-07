import {
  changeOrganizationMemberRole,
  createOrganizationForUser,
  listOrganizationMembers,
  listOrganizationsForUser,
  removeOrganizationMember,
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

export async function listOrganizationMembersController(req, res) {
  const memberships = await listOrganizationMembers(req.ctx.organization._id);

  return res.status(200).json({
    data: {
      members: memberships
        .filter((membership) => membership.user)
        .map(({ user, role, createdAt }) => ({
          id: String(user._id),
          name: user.name,
          email: user.email,
          role,
          joinedAt: createdAt,
        })),
    },
  });
}

export async function changeMemberRoleController(req, res) {
  await changeOrganizationMemberRole(
    req.ctx.organization._id,
    req.params.userId,
    req.body.role,
    req.ctx.role,
  );
  return res.status(204).end();
}

export async function removeMemberController(req, res) {
  await removeOrganizationMember(
    req.ctx.organization._id,
    req.params.userId,
    req.ctx.role,
  );
  return res.status(204).end();
}
