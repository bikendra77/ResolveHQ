import { useEffect } from 'react';
import { useAuth } from './auth/useAuth.js';
import { Dashboard } from './components/Dashboard.jsx';
import { LoginPage, RegisterPage } from './components/AuthPages.jsx';
import { OrganizationOnboardingPage } from './components/OrganizationOnboarding.jsx';
import { navigate, safeReturnPath, useLocation } from './routing.js';

function LoadingScreen() {
  return (
    <main className="session-loading" aria-live="polite" aria-busy="true">
      <span className="loading-mark" aria-hidden="true" />
      <p>Restoring your secure session…</p>
    </main>
  );
}

function OrganizationLoadError({ onRetry }) {
  function retry() {
    onRetry();
  }

  return (
    <main className="session-loading" aria-live="polite">
      <div className="form-alert" role="alert">
        Your organization list could not be loaded. Check your connection and
        try again.
      </div>
      <button className="primary-button" type="button" onClick={retry}>
        Try again <span aria-hidden="true">→</span>
      </button>
    </main>
  );
}

function AppRoutes() {
  const location = useLocation();
  const {
    status,
    user,
    organizations,
    organizationsStatus,
    refreshOrganizations,
  } = useAuth();
  const queryIndex = location.indexOf('?');
  const pathname = queryIndex === -1 ? location : location.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : location.slice(queryIndex);

  useEffect(() => {
    if (status === 'loading' || organizationsStatus === 'loading') {
      return;
    }

    if (pathname === '/login' || pathname === '/register') {
      if (status === 'authenticated' && organizationsStatus === 'ready') {
        navigate(
          organizations.length > 0 ? safeReturnPath(search) : '/onboarding',
          { replace: true },
        );
      }
      return;
    }

    if (status !== 'authenticated') {
      const intendedPath = `${pathname}${search}`;
      navigate(`/login?returnTo=${encodeURIComponent(intendedPath)}`, {
        replace: true,
      });
      return;
    }

    if (organizationsStatus !== 'ready') {
      return;
    }

    const isAppRoute = pathname === '/app' || pathname === '/app/members';
    const destination =
      organizations.length > 0
        ? isAppRoute
          ? pathname
          : '/app'
        : '/onboarding';
    if (pathname !== destination) {
      navigate(destination, { replace: true });
    }
  }, [organizations.length, organizationsStatus, pathname, search, status]);

  if (
    status === 'loading' ||
    (status === 'authenticated' && organizationsStatus === 'loading')
  ) {
    return <LoadingScreen />;
  }

  if (status === 'authenticated' && organizationsStatus === 'error') {
    return <OrganizationLoadError onRetry={refreshOrganizations} />;
  }

  if (pathname === '/login' && status === 'anonymous') {
    return <LoginPage />;
  }

  if (pathname === '/register' && status === 'anonymous') {
    return <RegisterPage />;
  }

  if (
    pathname === '/onboarding' &&
    status === 'authenticated' &&
    user &&
    organizationsStatus === 'ready' &&
    organizations.length === 0
  ) {
    return <OrganizationOnboardingPage />;
  }

  if (
    (pathname === '/app' || pathname === '/app/members') &&
    status === 'authenticated' &&
    user &&
    organizationsStatus === 'ready' &&
    organizations.length > 0
  ) {
    return <Dashboard />;
  }

  return <LoadingScreen />;
}

export default function App() {
  return <AppRoutes />;
}
