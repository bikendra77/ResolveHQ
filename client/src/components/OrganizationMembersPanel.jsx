import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';

const roles = ['owner', 'admin', 'member', 'viewer'];

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function OrganizationMembersPanel({ organization, user }) {
  const { organizationApi, refreshOrganizations } = useAuth();
  const canManageMembers = ['owner', 'admin'].includes(organization.role);
  const canManageInvitations = canManageMembers;
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [roleDrafts, setRoleDrafts] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [invitationUrl, setInvitationUrl] = useState('');

  const fetchData = useCallback(
    () =>
      Promise.all([
        organizationApi.organizationMembers(organization.id),
        canManageInvitations
          ? organizationApi.organizationInvitations(organization.id)
          : Promise.resolve([]),
      ]),
    [canManageInvitations, organization.id, organizationApi],
  );

  const applyData = useCallback(([nextMembers, nextInvitations]) => {
    setMembers(nextMembers);
    setInvitations(nextInvitations);
    setRoleDrafts({});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      applyData(await fetchData());
    } catch (error) {
      setLoadError(
        error.message || 'Unable to load organization members and invitations.',
      );
    } finally {
      setLoading(false);
    }
  }, [applyData, fetchData]);

  useEffect(() => {
    let active = true;
    fetchData()
      .then((data) => {
        if (active) {
          applyData(data);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error.message ||
              'Unable to load organization members and invitations.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyData, fetchData]);

  async function runAction(action, successMessage, callback, options = {}) {
    if (busyAction) return;
    setBusyAction(action);
    setActionError('');
    setNotice('');
    try {
      await callback();
      setNotice(successMessage);
      if (options.reload !== false) {
        await loadData();
      }
      if (options.refreshOrganizations) {
        await refreshOrganizations();
      }
    } catch (error) {
      setActionError(error.message || 'Unable to complete this action.');
    } finally {
      setBusyAction('');
    }
  }

  function submitInvitation(event) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || busyAction) return;

    runAction(
      'invite',
      'Invitation created. Share the secure link with your teammate.',
      async () => {
        const result = await organizationApi.createOrganizationInvitation(
          organization.id,
          { email, role: inviteRole },
        );
        setInvitationUrl(result.acceptUrl);
        setInviteEmail('');
      },
    );
  }

  function saveRole(member) {
    const role = roleDrafts[member.id] ?? member.role;
    if (role === member.role || busyAction) return;

    runAction(
      `role:${member.id}`,
      `${member.name}'s role was updated.`,
      () =>
        organizationApi.changeOrganizationMemberRole(
          organization.id,
          member.id,
          role,
        ),
      { refreshOrganizations: member.id === user.id },
    );
  }

  function removeMember(member) {
    runAction(
      `remove:${member.id}`,
      `${member.name} was removed from the organization.`,
      () =>
        organizationApi.removeOrganizationMember(organization.id, member.id),
      {
        reload: member.id !== user.id,
        refreshOrganizations: member.id === user.id,
      },
    );
  }

  function revokeInvitation(invitation) {
    runAction(
      `revoke:${invitation.id}`,
      `The invitation for ${invitation.email} was revoked.`,
      () =>
        organizationApi.revokeOrganizationInvitation(
          organization.id,
          invitation.id,
        ),
    );
  }

  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const allowedRoles =
    organization.role === 'owner' ? roles : ['member', 'viewer'];

  return (
    <section className="member-management" aria-labelledby="members-title">
      <div className="member-page-heading">
        <div>
          <p className="eyebrow">Organization settings</p>
          <h1 id="members-title">Members</h1>
          <p className="welcome-copy">
            Manage who has access to {organization.name} and what they can do.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="form-alert" role="alert">
          {actionError}
        </div>
      )}
      {notice && (
        <p className="member-notice" role="status">
          {notice}
        </p>
      )}
      {invitationUrl && (
        <div className="invitation-link">
          <label htmlFor="created-invitation-link">Invitation link</label>
          <input
            id="created-invitation-link"
            type="url"
            readOnly
            value={invitationUrl}
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}
      {loadError && (
        <div className="member-load-error">
          <div className="form-alert" role="alert">
            {loadError}
          </div>
          <button
            className="text-button"
            type="button"
            onClick={loadData}
            disabled={loading}
          >
            Try again
          </button>
        </div>
      )}
      {loading && (
        <p className="member-loading" aria-live="polite" aria-busy="true">
          Loading members and invitations…
        </p>
      )}

      {!loading && !loadError && (
        <>
          <section
            className="management-card"
            aria-labelledby="member-list-title"
          >
            <div className="management-card-heading">
              <div>
                <h2 id="member-list-title">Organization members</h2>
                <p>{members.length} people have access to this workspace.</p>
              </div>
            </div>
            {members.length === 0 ? (
              <p className="management-empty">No members found.</p>
            ) : (
              <div className="member-table-wrap">
                <table className="member-table">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Role</th>
                      {canManageMembers && (
                        <th scope="col" className="member-actions-heading">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const isAdminRestricted =
                        organization.role === 'admin' &&
                        ['owner', 'admin'].includes(member.role);
                      const isLastOwner =
                        member.role === 'owner' && ownerCount <= 1;
                      const canEditRole =
                        canManageMembers && !isAdminRestricted && !isLastOwner;
                      const canRemove =
                        canManageMembers &&
                        !(
                          organization.role === 'admin' &&
                          member.role === 'owner'
                        ) &&
                        !isLastOwner;
                      const selectedRole = roleDrafts[member.id] ?? member.role;

                      return (
                        <tr key={member.id}>
                          <td>
                            <span className="member-person-name">
                              {member.name}
                              {member.id === user.id && (
                                <span className="member-you-tag">You</span>
                              )}
                            </span>
                            <span className="member-person-email">
                              {member.email}
                            </span>
                          </td>
                          <td>
                            {canEditRole ? (
                              <label
                                className="visually-hidden"
                                htmlFor={`member-role-${member.id}`}
                              >
                                Role for {member.name}
                              </label>
                            ) : null}
                            {canEditRole ? (
                              <select
                                id={`member-role-${member.id}`}
                                className="member-role-select"
                                value={selectedRole}
                                disabled={Boolean(busyAction)}
                                onChange={(event) =>
                                  setRoleDrafts((current) => ({
                                    ...current,
                                    [member.id]: event.target.value,
                                  }))
                                }
                              >
                                {allowedRoles.map((role) => (
                                  <option key={role} value={role}>
                                    {role[0].toUpperCase() + role.slice(1)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`role-badge role-${member.role}`}
                              >
                                {member.role}
                              </span>
                            )}
                          </td>
                          {canManageMembers && (
                            <td>
                              <div className="member-actions">
                                {canEditRole && (
                                  <button
                                    className="text-button"
                                    type="button"
                                    disabled={
                                      Boolean(busyAction) ||
                                      selectedRole === member.role
                                    }
                                    onClick={() => saveRole(member)}
                                  >
                                    {busyAction === `role:${member.id}`
                                      ? 'Saving…'
                                      : 'Save role'}
                                  </button>
                                )}
                                {canRemove && (
                                  <button
                                    className="text-button danger-button"
                                    type="button"
                                    disabled={Boolean(busyAction)}
                                    onClick={() => removeMember(member)}
                                  >
                                    {busyAction === `remove:${member.id}`
                                      ? 'Removing…'
                                      : 'Remove'}
                                  </button>
                                )}
                                {isLastOwner && (
                                  <span className="management-hint">
                                    Final Owner protected
                                  </span>
                                )}
                                {isAdminRestricted && (
                                  <span className="management-hint">
                                    {member.role === 'owner'
                                      ? 'Owner-managed'
                                      : 'Role changes require an Owner'}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {canManageInvitations && (
            <div className="invitation-management-grid">
              <section
                className="management-card"
                aria-labelledby="invite-member-title"
              >
                <div className="management-card-heading">
                  <div>
                    <h2 id="invite-member-title">Invite a teammate</h2>
                    <p>
                      They’ll receive a secure link to join this organization.
                    </p>
                  </div>
                </div>
                <form className="invite-form" onSubmit={submitInvitation}>
                  <div className="field">
                    <label htmlFor="invite-email">Email address</label>
                    <input
                      id="invite-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={inviteEmail}
                      disabled={Boolean(busyAction)}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="invite-role">Organization role</label>
                    <select
                      id="invite-role"
                      name="role"
                      value={inviteRole}
                      disabled={Boolean(busyAction)}
                      onChange={(event) => setInviteRole(event.target.value)}
                    >
                      {['admin', 'member', 'viewer'].map((role) => (
                        <option key={role} value={role}>
                          {role[0].toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction === 'invite'
                      ? 'Creating invitation…'
                      : 'Create invitation'}
                  </button>
                </form>
              </section>

              <section
                className="management-card"
                aria-labelledby="invitations-title"
              >
                <div className="management-card-heading">
                  <div>
                    <h2 id="invitations-title">Invitations</h2>
                    <p>Review pending and past invitations.</p>
                  </div>
                </div>
                {invitations.length === 0 ? (
                  <p className="management-empty">No invitations yet.</p>
                ) : (
                  <ul className="invitation-list">
                    {invitations.map((invitation) => (
                      <li key={invitation.id}>
                        <div className="invitation-details">
                          <strong>{invitation.email}</strong>
                          <span>
                            {invitation.role} · {invitation.status}
                          </span>
                          <span>
                            Expires {formatDate(invitation.expiresAt)}
                          </span>
                        </div>
                        {invitation.status === 'pending' && (
                          <button
                            className="text-button danger-button"
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => revokeInvitation(invitation)}
                          >
                            {busyAction === `revoke:${invitation.id}`
                              ? 'Revoking…'
                              : 'Revoke'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
