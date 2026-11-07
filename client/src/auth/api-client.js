const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/$/,
  '',
);

let accessToken = null;
let refreshInFlight = null;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notifySessionExpired() {
  accessToken = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resolvehq:session-expired'));
  }
}

async function readResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  return response.json();
}

function apiError(response, body) {
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.code || 'REQUEST_FAILED',
    error?.message || 'Unable to complete the request. Please try again.',
    error?.details,
  );
}

async function send(
  path,
  options = {},
  { authenticated = true, retry = true } = {},
) {
  const tokenForRequest = authenticated ? accessToken : null;
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (tokenForRequest) {
    headers.set('Authorization', `Bearer ${tokenForRequest}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && authenticated && retry) {
    if (tokenForRequest && accessToken && tokenForRequest !== accessToken) {
      return send(path, options, { authenticated, retry: false });
    }
    const restored = await refreshAccessToken();
    if (restored) {
      return send(path, options, { authenticated, retry: false });
    }
  }

  const body = await readResponse(response);
  if (!response.ok) {
    throw apiError(response, body);
  }
  return body;
}

function bodyJson(body) {
  return JSON.stringify(body);
}

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const body = await readResponse(response);
        if (!response.ok || !body?.data?.accessToken) {
          notifySessionExpired();
          return false;
        }
        accessToken = body.data.accessToken;
        return true;
      } catch {
        notifySessionExpired();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export const apiClient = {
  setAccessToken(token) {
    accessToken = token || null;
  },

  clearAccessToken() {
    accessToken = null;
  },

  async login(credentials) {
    const result = await send(
      '/auth/login',
      { method: 'POST', body: bodyJson(credentials) },
      { authenticated: false },
    );
    accessToken = result.data.accessToken;
    return result.data.user;
  },

  async register(details) {
    const result = await send(
      '/auth/register',
      { method: 'POST', body: bodyJson(details) },
      { authenticated: false },
    );
    accessToken = result.data.accessToken;
    return result.data.user;
  },

  refresh: refreshAccessToken,

  async me() {
    const result = await send('/auth/me');
    return result.data.user;
  },

  async organizations() {
    const result = await send('/organizations');
    return result.data.organizations;
  },

  async createOrganization(details) {
    const result = await send('/organizations', {
      method: 'POST',
      body: bodyJson(details),
    });
    return result.data.organization;
  },

  async organizationMembers(organizationId) {
    const result = await send(
      `/organizations/${encodeURIComponent(organizationId)}/members`,
    );
    return result.data.members;
  },

  async changeOrganizationMemberRole(organizationId, userId, role) {
    return send(
      `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: bodyJson({ role }) },
    );
  },

  async removeOrganizationMember(organizationId, userId) {
    return send(
      `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
  },

  async organizationInvitations(organizationId) {
    const result = await send(
      `/organizations/${encodeURIComponent(organizationId)}/invitations`,
    );
    return result.data.invitations;
  },

  async createOrganizationInvitation(organizationId, details) {
    const result = await send(
      `/organizations/${encodeURIComponent(organizationId)}/invitations`,
      { method: 'POST', body: bodyJson(details) },
    );
    return result.data;
  },

  async revokeOrganizationInvitation(organizationId, invitationId) {
    return send(
      `/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: 'DELETE' },
    );
  },

  async logout() {
    return send('/auth/logout', { method: 'POST' }, { authenticated: false });
  },

  async logoutAll() {
    return send('/auth/logout-all', { method: 'POST' });
  },
};
