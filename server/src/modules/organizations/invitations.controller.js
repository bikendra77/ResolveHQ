import { ApiError } from '../../utils/api-error.js';
import {
  acceptOrganizationInvitation,
  createOrganizationInvitation,
  listOrganizationInvitations,
  revokeOrganizationInvitation,
} from './invitations.service.js';
import { invitationStatusSchema } from './invitations.schema.js';

function publicInvitation(invitation) {
  return {
    id: String(invitation._id),
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

export async function createInvitationController(req, res) {
  const { invitation, acceptUrl } = await createOrganizationInvitation(
    req.ctx.organization._id,
    req.user._id,
    req.body,
  );

  return res.status(201).json({
    data: {
      invitation: publicInvitation(invitation),
      acceptUrl,
    },
  });
}

export async function listInvitationsController(req, res) {
  const statusResult = invitationStatusSchema
    .optional()
    .safeParse(req.query.status);
  if (!statusResult.success) {
    const details = statusResult.error.issues.map((issue) => ({
      path: 'status',
      message: issue.message,
    }));
    throw new ApiError(
      422,
      'VALIDATION_FAILED',
      'Request validation failed',
      details,
    );
  }

  const invitations = await listOrganizationInvitations(
    req.ctx.organization._id,
    statusResult.data,
  );

  return res.status(200).json({
    data: { invitations: invitations.map(publicInvitation) },
  });
}

export async function revokeInvitationController(req, res) {
  await revokeOrganizationInvitation(
    req.ctx.organization._id,
    req.params.invitationId,
  );
  return res.status(204).end();
}

export async function acceptInvitationController(req, res) {
  const { invitation, membership } = await acceptOrganizationInvitation(
    req.body.token,
    req.user,
  );

  return res.status(200).json({
    data: {
      organizationId: String(invitation.organization),
      role: membership.role,
    },
  });
}
