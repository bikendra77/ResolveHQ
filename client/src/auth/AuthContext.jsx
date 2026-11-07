import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './auth-context.js';
import { apiClient } from './api-client.js';

export function AuthProvider({ children, client = apiClient }) {
  const [session, setSession] = useState({ status: 'loading', user: null });
  const [organizations, setOrganizations] = useState([]);
  const [organizationsStatus, setOrganizationsStatus] = useState('loading');
  const [organizationsError, setOrganizationsError] = useState(null);

  const refreshOrganizations = useCallback(async () => {
    setOrganizationsStatus('loading');
    setOrganizationsError(null);
    try {
      const result = await client.organizations();
      setOrganizations(result);
      setOrganizationsStatus('ready');
      return { status: 'ready', organizations: result };
    } catch (error) {
      setOrganizationsStatus('error');
      setOrganizationsError(error);
      return { status: 'error', error };
    }
  }, [client]);

  const clearOrganizationState = useCallback(() => {
    setOrganizations([]);
    setOrganizationsStatus('ready');
    setOrganizationsError(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const refreshed = await client.refresh();
        const user = refreshed ? await client.me() : null;
        if (active) {
          setSession({ status: user ? 'authenticated' : 'anonymous', user });
          if (!user) {
            clearOrganizationState();
          }
        }
        if (active && user) {
          await refreshOrganizations();
        }
      } catch {
        client.clearAccessToken();
        if (active) {
          setSession({ status: 'anonymous', user: null });
          clearOrganizationState();
        }
      }
    }

    restoreSession();
    return () => {
      active = false;
    };
  }, [clearOrganizationState, client, refreshOrganizations]);

  useEffect(() => {
    function expireSession() {
      setSession({ status: 'anonymous', user: null });
      clearOrganizationState();
    }
    window.addEventListener('resolvehq:session-expired', expireSession);
    return () =>
      window.removeEventListener('resolvehq:session-expired', expireSession);
  }, [clearOrganizationState]);

  const value = useMemo(
    () => ({
      ...session,
      organizations,
      organizationsStatus,
      organizationsError,
      refreshOrganizations,
      async signIn(credentials) {
        await client.login(credentials);
        let user;
        try {
          user = await client.me();
        } catch (error) {
          client.clearAccessToken();
          setSession({ status: 'anonymous', user: null });
          clearOrganizationState();
          throw error;
        }
        setSession({ status: 'authenticated', user });
        await refreshOrganizations();
        return user;
      },
      async signUp(details) {
        await client.register(details);
        let user;
        try {
          user = await client.me();
        } catch (error) {
          client.clearAccessToken();
          setSession({ status: 'anonymous', user: null });
          clearOrganizationState();
          throw error;
        }
        setSession({ status: 'authenticated', user });
        await refreshOrganizations();
        return user;
      },
      async createOrganization(details) {
        const organization = await client.createOrganization(details);
        setOrganizations((current) => [...current, organization]);
        setOrganizationsStatus('ready');
        setOrganizationsError(null);
        return organization;
      },
      async signOut() {
        try {
          await client.logout();
        } finally {
          client.clearAccessToken();
          setSession({ status: 'anonymous', user: null });
          clearOrganizationState();
        }
      },
    }),
    [
      clearOrganizationState,
      client,
      organizations,
      organizationsError,
      organizationsStatus,
      refreshOrganizations,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
