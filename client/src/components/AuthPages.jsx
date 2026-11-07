import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { Link } from './Link.jsx';
import { navigate, safeReturnPath, useLocation } from '../routing.js';

const appName = import.meta.env.VITE_APP_NAME || 'ResolveHQ';
const emailPattern =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

function passwordBytes(value) {
  return new TextEncoder().encode(value).length;
}

function Brand({ compact = false }) {
  return (
    <Link className={`brand${compact ? ' brand-compact' : ''}`} href="/">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 28 28" fill="none">
          <path d="M5 8.5 14 4l9 4.5v11L14 24l-9-4.5v-11Z" />
          <path d="m9.5 14 3 3 6-6" />
        </svg>
      </span>
      <span>{appName}</span>
    </Link>
  );
}

function PasswordInput({ id, label, value, onChange, autoComplete, hint }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          aria-describedby={hint ? `${id}-hint` : undefined}
          required
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthFrame({ mode, children, switchHref }) {
  const registering = mode === 'register';
  const onboarding = mode === 'onboarding';
  return (
    <main className="auth-screen">
      <aside className="auth-aside">
        <div className="auth-aside-top">
          <Brand />
          <div className="aside-rule" />
          <p className="eyebrow">Work, in clear view</p>
          <h1>
            The details move.
            <br />
            Your team stays <span>in sync.</span>
          </h1>
          <p className="aside-copy">
            A calmer workspace for the work that takes your team forward.
          </p>
        </div>
        <div className="aside-bottom">
          <div className="signal-row" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p>One focused place for your team’s next step.</p>
        </div>
      </aside>

      <section className="auth-main">
        <div className="auth-topline">
          <Brand compact />
          {onboarding ? (
            <p>Workspace setup</p>
          ) : (
            <p>
              {registering ? 'Already have an account?' : 'New to ResolveHQ?'}{' '}
              <Link href={switchHref || (registering ? '/login' : '/register')}>
                {registering ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
          )}
        </div>
        <div className="auth-card-wrap">
          <div className="auth-card">
            <p className="eyebrow">
              {onboarding
                ? 'One last step'
                : registering
                  ? 'Get started'
                  : 'Welcome back'}
            </p>
            <h2>
              {onboarding
                ? 'Name your organization'
                : registering
                  ? 'Create your account'
                  : 'Sign in to your workspace'}
            </h2>
            <p className="form-intro">
              {onboarding
                ? 'Choose the name your team will recognize.'
                : registering
                  ? 'A few details and you’re ready to get to work.'
                  : 'Pick up where your team left off.'}
            </p>
            {children}
          </div>
          <p className="auth-footnote">
            By continuing, you agree to use ResolveHQ responsibly and keep your
            account secure.
          </p>
        </div>
        <div className="auth-bottomline">
          <span>
            © {new Date().getFullYear()} {appName}
          </span>
          <span>Thoughtful tools for focused teams</span>
        </div>
      </section>
    </main>
  );
}

function SubmitButton({ busy, children }) {
  return (
    <button className="primary-button" type="submit" disabled={busy}>
      {busy && <span className="button-spinner" aria-hidden="true" />}
      {busy ? 'Please wait…' : children}
      {!busy && <span aria-hidden="true">→</span>}
    </button>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const search = location.includes('?')
    ? location.slice(location.indexOf('?'))
    : '';
  const returnTo = new URLSearchParams(search).get('returnTo');
  const registerHref = returnTo
    ? `/register?returnTo=${encodeURIComponent(safeReturnPath(search))}`
    : '/register';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFieldError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailPattern.test(normalizedEmail)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    const bytes = passwordBytes(password);
    if (bytes < 1 || bytes > 72) {
      setFieldError('Password must be between 1 and 72 UTF-8 bytes.');
      return;
    }

    setBusy(true);
    try {
      await signIn({ email: normalizedEmail, password });
      navigate(safeReturnPath(search), { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame mode="login" switchHref={registerHref}>
      <form className="auth-form" onSubmit={submit} noValidate>
        {new URLSearchParams(search).get('notice') === 'logout-unconfirmed' && (
          <div className="form-alert" role="alert">
            You are signed out on this device, but the server could not confirm
            that the saved session was revoked. Try signing out again when your
            connection is available.
          </div>
        )}
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        {fieldError && (
          <p className="field-error" role="alert">
            {fieldError}
          </p>
        )}
        <div className="field">
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            aria-invalid={Boolean(fieldError)}
          />
        </div>
        <PasswordInput
          id="login-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="form-meta">
          <span className="form-note">Secure sign-in to your workspace</span>
        </div>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { signUp } = useAuth();
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const search = location.includes('?')
    ? location.slice(location.indexOf('?'))
    : '';
  const returnTo = new URLSearchParams(search).get('returnTo');
  const loginHref = returnTo
    ? `/login?returnTo=${encodeURIComponent(safeReturnPath(search))}`
    : '/login';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setFieldError('');
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const bytes = passwordBytes(password);
    if (!normalizedName || normalizedName.length > 80) {
      setFieldError('Name is required and must be 80 characters or fewer.');
      return;
    }
    if (!emailPattern.test(normalizedEmail)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    if (bytes < 10 || bytes > 72) {
      setFieldError('Password must be between 10 and 72 UTF-8 bytes.');
      return;
    }
    if (password !== confirmation) {
      setFieldError('Those passwords don’t match yet.');
      return;
    }

    setBusy(true);
    try {
      await signUp({ name: normalizedName, email: normalizedEmail, password });
      navigate(safeReturnPath(search), { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to create your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame mode="register" switchHref={loginHref}>
      <form className="auth-form register-form" onSubmit={submit} noValidate>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        {fieldError && (
          <p className="field-error" role="alert">
            {fieldError}
          </p>
        )}
        <div className="field">
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            name="name"
            type="text"
            autoComplete="name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="register-email">Work email</label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <PasswordInput
          id="register-password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="Use 10–72 UTF-8 bytes. A longer phrase is easier to remember."
        />
        <PasswordInput
          id="register-confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
    </AuthFrame>
  );
}
