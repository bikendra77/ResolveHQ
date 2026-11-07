import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { navigate } from '../routing.js';
import { AuthFrame } from './AuthPages.jsx';
import { Link } from './Link.jsx';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function invitationFailure(error) {
  if (error.status === 404 && error.code === 'NOT_FOUND') {
    return {
      kind: 'unavailable',
      message:
        'This invitation is no longer available. It may be invalid, expired, revoked, or already accepted. Ask the inviter for a new link.',
    };
  }

  if (error.status === 403 && error.code === 'FORBIDDEN') {
    return {
      kind: 'email-mismatch',
      message:
        'This invitation was sent to a different email address. Sign in with the invited account to accept it.',
    };
  }

  if (error.status === 401) {
    return {
      kind: 'session',
      message:
        'Your sign-in session expired. Sign in again to accept this invitation.',
    };
  }

  if (error.status === 409 && error.code === 'CONFLICT') {
    return {
      kind: 'already-member',
      message: 'Your account is already a member of this organization.',
    };
  }

  return {
    kind: 'request',
    message:
      error.message || 'Unable to accept this invitation. Please try again.',
  };
}

export function InvitationAcceptancePage({ token }) {
  const { user, organizationApi, refreshOrganizations, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [acceptedOrganizationId, setAcceptedOrganizationId] = useState(null);
  const validToken = tokenPattern.test(token);
  const invitationPath = `/invite/${encodeURIComponent(token)}`;
  const loginHref = `/login?returnTo=${encodeURIComponent(invitationPath)}`;
  const registerHref = `/register?returnTo=${encodeURIComponent(invitationPath)}`;
  const cannotRetryAcceptance = [
    'unavailable',
    'email-mismatch',
    'session',
    'already-member',
  ].includes(failure?.kind);

  function openOrganization(organizationId) {
    const query = new URLSearchParams({ notice: 'invitation-accepted' });
    if (organizationId) {
      query.set('organization', organizationId);
    }
    navigate(`/app?${query.toString()}`, { replace: true });
  }

  async function refreshAndOpen(organizationId) {
    const result = await refreshOrganizations();
    if (result.status !== 'ready') {
      setAcceptedOrganizationId(organizationId);
      setFailure({
        kind: 'refresh',
        message:
          'Your invitation was accepted, but your organization list could not be refreshed. Try again before continuing.',
      });
      return;
    }

    openOrganization(organizationId);
  }

  async function acceptInvitation() {
    if (busy || !validToken) {
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const accepted = await organizationApi.acceptInvitation(token);
      await refreshAndOpen(accepted.organizationId);
    } catch (error) {
      setFailure(invitationFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function retryOrganizationRefresh() {
    if (busy || !acceptedOrganizationId) {
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      await refreshAndOpen(acceptedOrganizationId);
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await signOut();
    } catch {
      // signOut clears the local session even when the server cannot confirm it.
    }
    navigate(loginHref, { replace: true });
  }

  return (
    <AuthFrame mode="invitation">
      {!validToken ? (
        <div className="form-alert invitation-alert" role="alert">
          This invitation link is invalid. Ask the inviter for a new link.
        </div>
      ) : user ? (
        <div className="invitation-content">
          <p className="invitation-identity">
            Signed in as <strong>{user.email}</strong>
          </p>
          {failure && (
            <div className="form-alert invitation-alert" role="alert">
              {failure.message}
            </div>
          )}
          {(failure?.kind === 'email-mismatch' ||
            failure?.kind === 'session') && (
            <button
              className="primary-button"
              type="button"
              onClick={switchAccount}
              disabled={busy}
            >
              Use another account <span aria-hidden="true">→</span>
            </button>
          )}
          {failure?.kind === 'refresh' ? (
            <button
              className="primary-button"
              type="button"
              onClick={retryOrganizationRefresh}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? 'Refreshing…' : 'Retry and continue'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={acceptInvitation}
              disabled={busy || cannotRetryAcceptance}
              aria-busy={busy}
            >
              {busy ? 'Accepting invitation…' : 'Accept invitation'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          )}
        </div>
      ) : (
        <div className="invitation-content">
          {failure && (
            <div className="form-alert invitation-alert" role="alert">
              {failure.message}
            </div>
          )}
          <p>
            Sign in or create an account with the email address that received
            this invitation.
          </p>
          <div className="invitation-actions">
            <Link className="primary-button" href={loginHref}>
              Sign in to accept <span aria-hidden="true">→</span>
            </Link>
            <Link className="invitation-secondary-link" href={registerHref}>
              Create an account
            </Link>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
