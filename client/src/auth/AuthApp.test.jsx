import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { AuthProvider } from './AuthContext.jsx';

const user = {
  id: '665f00000000000000000001',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
};
const organization = {
  id: '665f00000000000000000010',
  name: 'Ada Team',
  slug: 'ada-team',
  role: 'owner',
};
const member = {
  id: '665f00000000000000000002',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  role: 'member',
  joinedAt: '2025-01-01T00:00:00.000Z',
};
const invitation = {
  id: '665f00000000000000000020',
  email: 'grace@example.com',
  role: 'member',
  status: 'pending',
  expiresAt: '2026-11-14T00:00:00.000Z',
  createdAt: '2026-11-07T00:00:00.000Z',
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

function makeClient(overrides = {}) {
  return {
    refresh: vi.fn().mockResolvedValue(false),
    clearAccessToken: vi.fn(),
    login: vi.fn().mockResolvedValue(user),
    register: vi.fn().mockResolvedValue(user),
    me: vi.fn().mockResolvedValue(user),
    organizations: vi.fn().mockResolvedValue([organization]),
    createOrganization: vi.fn().mockImplementation(async ({ name }) => ({
      ...organization,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
    })),
    organizationMembers: vi
      .fn()
      .mockResolvedValue([{ ...user, role: organization.role }, member]),
    organizationInvitations: vi.fn().mockResolvedValue([invitation]),
    createOrganizationInvitation: vi.fn().mockResolvedValue({
      invitation,
      acceptUrl: 'https://resolvehq.example/invite/secure-token',
    }),
    changeOrganizationMemberRole: vi.fn().mockResolvedValue(null),
    removeOrganizationMember: vi.fn().mockResolvedValue(null),
    revokeOrganizationInvitation: vi.fn().mockResolvedValue(null),
    logout: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

async function mount(path, client = makeClient()) {
  window.history.replaceState({}, '', path);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AuthProvider client={client}>
        <App />
      </AuthProvider>,
    );
    await Promise.resolve();
  });
  await settle();
  return client;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setInput(id, value) {
  const input = document.getElementById(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelect(id, value) {
  const select = document.getElementById(id);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  ).set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

async function submitForm() {
  await act(async () => {
    document
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('authentication screens and session routing', () => {
  it('manages organization members and invitations for an Owner', async () => {
    const client = await mount(
      '/app/members',
      makeClient({ refresh: vi.fn().mockResolvedValue(true) }),
    );

    expect(window.location.pathname).toBe('/app/members');
    expect(document.getElementById('members-title')?.textContent).toBe(
      'Members',
    );
    expect(client.organizationMembers).toHaveBeenCalledWith(organization.id);
    expect(client.organizationInvitations).toHaveBeenCalledWith(
      organization.id,
    );
    expect(document.body.textContent).toContain('Grace Hopper');
    expect(document.body.textContent).toContain('Invitations');

    setInput('invite-email', '  grace@example.com  ');
    setSelect('invite-role', 'viewer');
    await submitForm();
    expect(client.createOrganizationInvitation).toHaveBeenCalledWith(
      organization.id,
      { email: 'grace@example.com', role: 'viewer' },
    );
    expect(document.getElementById('created-invitation-link').value).toBe(
      'https://resolvehq.example/invite/secure-token',
    );
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(
      /invitation created/i,
    );

    setSelect(`member-role-${member.id}`, 'admin');
    const saveRoleButton = Array.from(
      document.querySelectorAll('.member-actions button'),
    ).find((button) => button.textContent.includes('Save role'));
    await click(saveRoleButton);
    expect(client.changeOrganizationMemberRole).toHaveBeenCalledWith(
      organization.id,
      member.id,
      'admin',
    );

    const removeButton = Array.from(
      document.querySelectorAll('.member-actions button'),
    ).find((button) => button.textContent.trim() === 'Remove');
    await click(removeButton);
    expect(client.removeOrganizationMember).toHaveBeenCalledWith(
      organization.id,
      member.id,
    );

    await click(
      Array.from(document.querySelectorAll('.invitation-list button')).find(
        (button) => button.textContent.includes('Revoke'),
      ),
    );
    expect(client.revokeOrganizationInvitation).toHaveBeenCalledWith(
      organization.id,
      invitation.id,
    );
  });

  it('hides invitation and member controls from a Viewer', async () => {
    const viewerOrganization = { ...organization, role: 'viewer' };
    const client = await mount(
      '/app/members',
      makeClient({
        refresh: vi.fn().mockResolvedValue(true),
        organizations: vi.fn().mockResolvedValue([viewerOrganization]),
      }),
    );

    expect(client.organizationMembers).toHaveBeenCalledWith(organization.id);
    expect(client.organizationInvitations).not.toHaveBeenCalled();
    expect(document.getElementById('invite-email')).toBeNull();
    expect(document.querySelector('.member-actions')).toBeNull();
    expect(document.body.textContent).toContain('Grace Hopper');
  });

  it('limits Admin role changes and protects Owner memberships in the UI', async () => {
    const adminOrganization = { ...organization, role: 'admin' };
    const otherAdmin = {
      ...member,
      id: '665f00000000000000000003',
      name: 'Linus Torvalds',
      role: 'admin',
    };
    const anotherOwner = {
      ...member,
      id: '665f00000000000000000004',
      name: 'Katherine Johnson',
      role: 'owner',
    };
    const client = await mount(
      '/app/members',
      makeClient({
        refresh: vi.fn().mockResolvedValue(true),
        organizations: vi.fn().mockResolvedValue([adminOrganization]),
        organizationMembers: vi
          .fn()
          .mockResolvedValue([
            { ...user, role: 'admin' },
            member,
            otherAdmin,
            anotherOwner,
          ]),
      }),
    );

    expect(
      Array.from(
        document.querySelector('#member-role-665f00000000000000000002').options,
      ).map((option) => option.value),
    ).toEqual(['member', 'viewer']);
    expect(
      document.getElementById('member-role-665f00000000000000000003'),
    ).toBeNull();
    expect(
      document.getElementById('member-role-665f00000000000000000004'),
    ).toBeNull();
    expect(client.organizationInvitations).toHaveBeenCalledWith(
      organization.id,
    );
    expect(document.querySelectorAll('.member-table select')).toHaveLength(1);
  });

  it('disables role changes and removal for the final Owner', async () => {
    await mount(
      '/app/members',
      makeClient({
        refresh: vi.fn().mockResolvedValue(true),
        organizationMembers: vi
          .fn()
          .mockResolvedValue([{ ...user, role: 'owner' }, member]),
      }),
    );

    const ownerRow = document.querySelector('tbody tr');
    expect(ownerRow.textContent).toContain('Final Owner protected');
    expect(ownerRow.querySelector('select')).toBeNull();
    expect(
      Array.from(ownerRow.querySelectorAll('button')).some((button) =>
        button.textContent.includes('Remove'),
      ),
    ).toBe(false);
  });

  it('shows member loading errors and retries successfully', async () => {
    const organizationMembers = vi
      .fn()
      .mockRejectedValueOnce(new Error('Members are unavailable'))
      .mockResolvedValue([{ ...user, role: 'owner' }, member]);
    const client = await mount(
      '/app/members',
      makeClient({
        refresh: vi.fn().mockResolvedValue(true),
        organizationMembers,
      }),
    );

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Members are unavailable',
    );
    await click(
      Array.from(document.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Try again'),
      ),
    );
    expect(organizationMembers).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain('Grace Hopper');
    expect(client.organizationMembers).toHaveBeenCalled();
  });

  it('validates login fields, shows API errors, and submits normalized credentials', async () => {
    const client = await mount('/login');

    await submitForm();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /valid email address/i,
    );
    expect(client.login).not.toHaveBeenCalled();

    setInput('login-email', 'a@b.c');
    setInput('login-password', 'correct horse');
    await submitForm();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /valid email address/i,
    );
    expect(client.login).not.toHaveBeenCalled();

    client.login.mockRejectedValueOnce(new Error('Invalid email or password'));
    setInput('login-email', ' ADA@EXAMPLE.COM ');
    setInput('login-password', 'correct horse');
    await submitForm();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Invalid email or password',
    );

    client.login.mockResolvedValueOnce(user);
    await submitForm();
    expect(client.login).toHaveBeenLastCalledWith({
      email: 'ada@example.com',
      password: 'correct horse',
    });
    expect(client.me).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/app');
    expect(document.body.textContent).toContain('Good to have you here, Ada.');
  });

  it('validates registration, toggles password visibility, and creates an account', async () => {
    const client = await mount(
      '/register',
      makeClient({ organizations: vi.fn().mockResolvedValue([]) }),
    );
    setInput('register-name', '  Ada Lovelace  ');
    setInput('register-email', ' ADA@EXAMPLE.COM ');
    setInput('register-password', 'long enough password');
    setInput('register-confirm-password', 'different password');
    await submitForm();

    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /passwords don’t match/i,
    );
    expect(client.register).not.toHaveBeenCalled();

    await click(document.querySelector('[aria-label="Show password"]'));
    expect(document.getElementById('register-password').type).toBe('text');
    await click(document.querySelector('[aria-label="Hide password"]'));
    expect(document.getElementById('register-password').type).toBe('password');

    setInput('register-confirm-password', 'long enough password');
    client.register.mockRejectedValueOnce(
      new Error('An account with this email already exists'),
    );
    await submitForm();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'An account with this email already exists',
    );

    await submitForm();
    expect(client.register).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'long enough password',
    });
    expect(client.me).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/onboarding');
  });

  it('onboards an authenticated user without an organization and reports submission errors', async () => {
    const client = await mount(
      '/register',
      makeClient({ organizations: vi.fn().mockResolvedValue([]) }),
    );
    setInput('register-name', 'Ada Lovelace');
    setInput('register-email', 'ada@example.com');
    setInput('register-password', 'long enough password');
    setInput('register-confirm-password', 'long enough password');
    await submitForm();

    expect(window.location.pathname).toBe('/onboarding');
    expect(
      document.querySelector('label[for="organization-name"]'),
    ).not.toBeNull();

    await submitForm();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /organization name is required/i,
    );
    expect(client.createOrganization).not.toHaveBeenCalled();

    setInput('organization-name', 'Ada Team');
    client.createOrganization.mockRejectedValueOnce(
      new Error(
        'MongoDB transactions require a replica set or sharded cluster.',
      ),
    );
    await submitForm();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /MongoDB transactions require a replica set/i,
    );
    expect(window.location.pathname).toBe('/onboarding');

    await submitForm();
    expect(client.createOrganization).toHaveBeenLastCalledWith({
      name: 'Ada Team',
    });
    expect(window.location.pathname).toBe('/app');
    expect(document.body.textContent).toContain('Ada Team');
  });

  it('restores a valid session and redirects away from authentication pages', async () => {
    const client = makeClient({
      refresh: vi.fn().mockResolvedValue(true),
      me: vi.fn().mockResolvedValue(user),
    });
    await mount('/login', client);

    expect(client.refresh).toHaveBeenCalledOnce();
    expect(client.me).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('Good to have you here, Ada.');
    expect(window.location.pathname).toBe('/app');
  });

  it('keeps an authenticated session when organization loading fails and allows retry', async () => {
    const organizations = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValue([organization]);
    const client = makeClient({
      refresh: vi.fn().mockResolvedValue(true),
      organizations,
    });
    await mount('/app', client);

    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /organization list could not be loaded/i,
    );
    expect(client.clearAccessToken).not.toHaveBeenCalled();

    await click(document.querySelector('.primary-button'));
    expect(organizations).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('Good to have you here, Ada.');
  });

  it('returns to the originally requested app route after a failed refresh and login', async () => {
    await mount('/app?tab=mine');
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(
      '/app?tab=mine',
    );

    setInput('login-email', 'ada@example.com');
    setInput('login-password', 'correct horse');
    await submitForm();
    expect(window.location.pathname).toBe('/app');
    expect(window.location.search).toBe('?tab=mine');
  });

  it('clears client authentication and returns to login on logout', async () => {
    const client = makeClient({
      refresh: vi.fn().mockResolvedValue(true),
      me: vi.fn().mockResolvedValue(user),
    });
    await mount('/app', client);

    await click(document.querySelector('.text-button'));
    expect(client.logout).toHaveBeenCalledOnce();
    expect(client.clearAccessToken).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/login');
    expect(document.querySelector('form')).not.toBeNull();
  });

  it('explains when the server cannot confirm logout', async () => {
    const client = makeClient({
      refresh: vi.fn().mockResolvedValue(true),
      me: vi.fn().mockResolvedValue(user),
      logout: vi.fn().mockRejectedValue(new Error('Network unavailable')),
    });
    await mount('/app', client);

    await click(document.querySelector('.text-button'));
    expect(client.clearAccessToken).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/login');
    expect(new URLSearchParams(window.location.search).get('notice')).toBe(
      'logout-unconfirmed',
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
      /server could not confirm/i,
    );
  });

  it('rejects unsafe return destinations', async () => {
    await mount('/login?returnTo=%2F%5C%5Cattacker.example');
    setInput('login-email', 'ada@example.com');
    setInput('login-password', 'correct horse');
    const link = document.querySelector('a[href^="/register"]');
    expect(link.getAttribute('href')).toBe('/register?returnTo=%2Fapp');
  });
});
