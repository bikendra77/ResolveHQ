import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { Link } from './Link.jsx';
import { navigate } from '../routing.js';

const navigation = [
  { label: 'Overview', active: true, icon: '◫' },
  { label: 'My work', icon: '▤', soon: true },
  { label: 'Activity', icon: '◷', soon: true },
];

function UserAvatar({ name }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <span className="user-avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

function NavigationItem({ label, active, icon, soon }) {
  const className = `side-nav-item${active ? ' is-active' : ''}${soon ? ' is-upcoming' : ''}`;
  const content = (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {soon && <span className="coming-soon">Soon</span>}
    </>
  );

  if (soon) {
    return (
      <button className={className} type="button" disabled aria-disabled="true">
        {content}
      </button>
    );
  }

  return (
    <Link
      className={className}
      href="/app"
      aria-current={active ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}

export function Dashboard() {
  const { user, organizations, signOut } = useAuth();
  const organization = organizations[0];
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      navigate('/login?notice=logout-unconfirmed', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Workspace navigation">
        <Link className="brand app-brand" href="/app">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 28 28" fill="none">
              <path d="M5 8.5 14 4l9 4.5v11L14 24l-9-4.5v-11Z" />
              <path d="m9.5 14 3 3 6-6" />
            </svg>
          </span>
          <span>ResolveHQ</span>
        </Link>

        <div className="workspace-switcher">
          <span className="workspace-avatar">
            {organization.name[0]?.toUpperCase()}
          </span>
          <span className="workspace-label">
            <strong>{organization.name}</strong>
            <span>Organization</span>
          </span>
          <span className="switcher-chevron" aria-hidden="true">
            ⌄
          </span>
        </div>

        <p className="nav-label">Workspace</p>
        <nav className="side-nav">
          {navigation.map((item) => (
            <NavigationItem key={item.label} {...item} />
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon" aria-hidden="true">
              ✳
            </span>
            <strong>A clear place to start</strong>
            <p>Your workspace is ready for the next chapter.</p>
          </div>
          <button
            className="sidebar-user"
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            aria-label={`Sign out ${user.name}`}
          >
            <UserAvatar name={user.name} />
            <span className="sidebar-user-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </span>
            <span className="user-menu-icon" aria-hidden="true">
              ↗
            </span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb">
            <span>{organization.name}</span>
            <span aria-hidden="true">/</span>
            <strong>Overview</strong>
          </div>
          <div className="topbar-actions">
            <span className="connection-status">
              <span /> Secure session
            </span>
            <button
              className="topbar-user"
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              aria-label="Sign out"
              title={`Sign out ${user.name}`}
            >
              <UserAvatar name={user.name} />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="welcome-heading">
            <div>
              <p className="eyebrow">Your workspace</p>
              <h1>Good to have you here, {user.name.split(/\s+/)[0]}.</h1>
              <p className="welcome-copy">
                Your space is set up. The next step is yours.
              </p>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={handleSignOut}
              disabled={busy}
            >
              {busy ? 'Signing out…' : 'Sign out'}
              <span aria-hidden="true">↗</span>
            </button>
          </div>

          <section className="welcome-panel" aria-labelledby="welcome-title">
            <div className="welcome-panel-copy">
              <span className="panel-kicker">
                <span /> A fresh start
              </span>
              <h2 id="welcome-title">
                Good work starts with a little clarity.
              </h2>
              <p>
                ResolveHQ is ready to help your team keep the important details
                in view. Your focused workspace is taking shape.
              </p>
              <div className="panel-note">
                <span className="note-check" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Signed in as <strong>{user.email}</strong>
                </span>
              </div>
            </div>
            <div className="welcome-illustration" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="illustration-card card-back">
                <span />
                <span />
              </div>
              <div className="illustration-card card-front">
                <div className="illustration-mark">✓</div>
                <div className="illustration-lines">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="illustration-avatar">
                  {user.name[0]?.toUpperCase()}
                </div>
              </div>
              <div className="float-dot dot-one" />
              <div className="float-dot dot-two" />
            </div>
          </section>

          <section className="dashboard-lower" aria-label="Workspace overview">
            <article className="overview-card">
              <div className="overview-icon icon-blue" aria-hidden="true">
                ◫
              </div>
              <div>
                <p className="overview-label">Workspace status</p>
                <h3>Ready when you are</h3>
              </div>
              <span className="status-pill">
                <span /> Active
              </span>
            </article>
            <article className="overview-card">
              <div className="overview-icon icon-gold" aria-hidden="true">
                ✳
              </div>
              <div>
                <p className="overview-label">A note for today</p>
                <h3>One thing at a time.</h3>
              </div>
              <span className="overview-arrow" aria-hidden="true">
                ↗
              </span>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
