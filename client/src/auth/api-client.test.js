import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError } from './api-client.js';

const user = {
  id: '665f00000000000000000001',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(payload),
  };
}

let fetchMock;

beforeEach(() => {
  apiClient.clearAccessToken();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authentication API client', () => {
  it('sends login and registration through the configured API with cookie credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(200, { data: { user, accessToken: 'login-access-token' } }),
      )
      .mockResolvedValueOnce(
        response(201, { data: { user, accessToken: 'register-access-token' } }),
      );

    await expect(
      apiClient.login({ email: user.email, password: 'correct horse' }),
    ).resolves.toEqual(user);
    let [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/login');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      email: user.email,
      password: 'correct horse',
    });

    await expect(
      apiClient.register({
        name: user.name,
        email: user.email,
        password: 'correct horse',
      }),
    ).resolves.toEqual(user);
    [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/v1/auth/register');
    expect(options.credentials).toBe('include');
  });

  it('lists and creates organizations through authenticated API requests', async () => {
    apiClient.setAccessToken('short-lived-access-token');
    const organizations = [
      {
        id: '665f00000000000000000010',
        name: 'Ada Team',
        slug: 'ada-team',
        role: 'owner',
      },
    ];
    fetchMock
      .mockResolvedValueOnce(response(200, { data: { organizations } }))
      .mockResolvedValueOnce(
        response(201, { data: { organization: organizations[0] } }),
      );

    await expect(apiClient.organizations()).resolves.toEqual(organizations);
    await expect(
      apiClient.createOrganization({ name: 'Ada Team' }),
    ).resolves.toEqual(organizations[0]);

    const [listUrl, listOptions] = fetchMock.mock.calls[0];
    expect(listUrl).toBe('/api/v1/organizations');
    expect(listOptions.headers.get('Authorization')).toMatch(/^Bearer /);
    const [createUrl, createOptions] = fetchMock.mock.calls[1];
    expect(createUrl).toBe('/api/v1/organizations');
    expect(createOptions.method).toBe('POST');
    expect(createOptions.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(createOptions.body)).toEqual({ name: 'Ada Team' });
  });

  it('loads the current user with the in-memory access token and includes cookies', async () => {
    apiClient.setAccessToken('short-lived-access-token');
    fetchMock.mockResolvedValueOnce(response(200, { data: { user } }));

    await expect(apiClient.me()).resolves.toEqual(user);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/me');
    expect(options.credentials).toBe('include');
    expect(options.headers.get('Authorization')).toBe(
      'Bearer short-lived-access-token',
    );
  });

  it('shares one refresh request when parallel authenticated calls receive 401', async () => {
    apiClient.setAccessToken('expired-access-token');
    let releaseRefresh;
    let signalRefreshStarted;
    const refreshStarted = new Promise((resolve) => {
      signalRefreshStarted = resolve;
    });
    const holdRefresh = new Promise((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshRequests = 0;

    fetchMock.mockImplementation(async (url, options) => {
      if (url.endsWith('/auth/refresh')) {
        refreshRequests += 1;
        signalRefreshStarted();
        await holdRefresh;
        return response(200, {
          data: { user, accessToken: 'renewed-access-token' },
        });
      }

      if (
        options.headers.get('Authorization') === 'Bearer renewed-access-token'
      ) {
        return response(200, { data: { user } });
      }

      return response(401, {
        error: { code: 'TOKEN_EXPIRED', message: 'Authentication required' },
      });
    });

    const pending = Promise.all([apiClient.me(), apiClient.me()]);
    await refreshStarted;
    expect(refreshRequests).toBe(1);
    releaseRefresh();

    await expect(pending).resolves.toEqual([user, user]);
    expect(refreshRequests).toBe(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/me')),
    ).toHaveLength(4);
  });

  it('clears the client session after a failed refresh and reports the API error', async () => {
    apiClient.setAccessToken('expired-access-token');
    const sessionExpired = vi.fn();
    window.addEventListener('resolvehq:session-expired', sessionExpired);
    fetchMock
      .mockResolvedValueOnce(
        response(401, {
          error: { code: 'TOKEN_EXPIRED', message: 'Authentication required' },
        }),
      )
      .mockResolvedValueOnce(
        response(401, {
          error: { code: 'INVALID_TOKEN', message: 'Authentication required' },
        }),
      );

    await expect(apiClient.me()).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
    expect(sessionExpired).toHaveBeenCalledOnce();
    window.removeEventListener('resolvehq:session-expired', sessionExpired);
  });

  it('preserves forbidden responses instead of refreshing the session', async () => {
    apiClient.setAccessToken('valid-access-token');
    fetchMock.mockResolvedValueOnce(
      response(403, {
        error: { code: 'FORBIDDEN', message: 'Request origin is not allowed' },
      }),
    );

    const pending = apiClient.me();
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Request origin is not allowed',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('logs out through the cookie endpoint without persisting or sending a token', async () => {
    apiClient.setAccessToken('access-token');
    fetchMock.mockResolvedValueOnce({ status: 204, ok: true });

    await expect(apiClient.logout()).resolves.toBeNull();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/auth/logout');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers.has('Authorization')).toBe(false);
    expect('localStorage' in apiClient).toBe(false);
    expect('sessionStorage' in apiClient).toBe(false);
  });
});
