import { useSyncExternalStore } from 'react';

function subscribe(listener) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}

function getLocation() {
  return `${window.location.pathname}${window.location.search}`;
}

export function useLocation() {
  return useSyncExternalStore(subscribe, getLocation, () => '/');
}

export function navigate(destination, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, '', destination);
  } else {
    window.history.pushState({}, '', destination);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function safeReturnPath(search) {
  const candidate = new URLSearchParams(search).get('returnTo');
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return '/app';
  }

  try {
    const destination = new URL(candidate, window.location.origin);
    if (destination.origin !== window.location.origin) {
      return '/app';
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return '/app';
  }
}
