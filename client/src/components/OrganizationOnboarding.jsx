import { useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { navigate } from '../routing.js';
import { AuthFrame } from './AuthPages.jsx';

export function OrganizationOnboardingPage() {
  const { createOrganization } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const submitting = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) {
      return;
    }

    setError('');
    setFieldError('');
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 80) {
      setFieldError(
        'Organization name is required and must be 80 characters or fewer.',
      );
      return;
    }

    submitting.current = true;
    setBusy(true);
    try {
      await createOrganization({ name: normalizedName });
      navigate('/app', { replace: true });
    } catch (requestError) {
      setError(
        requestError.message ||
          'Unable to create your organization. Please try again.',
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthFrame mode="onboarding">
      <form className="auth-form" onSubmit={submit} noValidate>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="organization-name">Organization name</label>
          <input
            id="organization-name"
            name="name"
            type="text"
            autoComplete="organization"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (fieldError) {
                setFieldError('');
              }
            }}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={
              fieldError ? 'organization-name-error' : undefined
            }
            required
          />
          {fieldError && (
            <p
              className="field-error"
              id="organization-name-error"
              role="alert"
            >
              {fieldError}
            </p>
          )}
        </div>
        <button
          className="primary-button"
          type="submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Creating organization…' : 'Create organization'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
      </form>
    </AuthFrame>
  );
}
