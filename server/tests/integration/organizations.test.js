import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => {
  const organizations = new Map();
  const memberships = [];
  const users = new Map();
  const session = Object.freeze({ transactionSession: true });
  let nextId = 1;
  let membershipCreateError = null;
  let organizationSlugDuplicateOnce = false;
  let transactionError = null;
  let lastMembershipFilter = null;
  let lastMemberListFilter = null;

  function id() {
    return (nextId++).toString(16).padStart(24, '0');
  }

  function query(resolve) {
    const pending = {
      session() {
        return pending;
      },
      select() {
        return pending;
      },
      populate() {
        return pending;
      },
      sort() {
        return pending;
      },
      then(resolveResult, rejectResult) {
        return Promise.resolve(resolve()).then(resolveResult, rejectResult);
      },
    };
    return pending;
  }

  class FakeOrganization {
    static exists({ slug }) {
      return query(
        () =>
          [...organizations.values()].find(
            (organization) => organization.slug === slug,
          ) ?? null,
      );
    }

    static async create(records, { session: activeSession }) {
      if (activeSession !== session) {
        throw new Error(
          'Organization write did not receive the transaction session',
        );
      }

      return records.map((record) => {
        if (organizationSlugDuplicateOnce && record.slug === 'acme-team') {
          organizationSlugDuplicateOnce = false;
          throw Object.assign(new Error('duplicate slug'), {
            code: 11000,
            keyPattern: { slug: 1 },
          });
        }
        if (
          [...organizations.values()].some(
            (organization) => organization.slug === record.slug,
          )
        ) {
          throw Object.assign(new Error('duplicate slug'), {
            code: 11000,
            keyPattern: { slug: 1 },
          });
        }
        const organization = {
          _id: id(),
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
          ...record,
        };
        organizations.set(String(organization._id), organization);
        return organization;
      });
    }

    static findById(organizationId) {
      return query(() => organizations.get(String(organizationId)) ?? null);
    }
  }

  class FakeMembership {
    static async create(records, { session: activeSession }) {
      if (activeSession !== session) {
        throw new Error(
          'Membership write did not receive the transaction session',
        );
      }
      if (membershipCreateError) {
        throw membershipCreateError;
      }
      const created = records.map((record) => ({
        _id: id(),
        ...record,
      }));
      memberships.push(...created);
      return created;
    }

    static find(filter) {
      if (Object.hasOwn(filter, 'organization')) {
        lastMemberListFilter = filter;
        return query(() =>
          memberships
            .filter(
              (membership) =>
                String(membership.organization) === String(filter.organization),
            )
            .map((membership) => ({
              ...membership,
              user: users.get(String(membership.user)) ?? null,
            })),
        );
      }

      return query(() =>
        memberships
          .filter(
            (membership) => String(membership.user) === String(filter.user),
          )
          .map((membership) => ({
            ...membership,
            organization:
              organizations.get(String(membership.organization)) ?? null,
          })),
      );
    }

    static findOne(filter) {
      lastMembershipFilter = filter;
      return query(
        () =>
          memberships.find(
            (membership) =>
              String(membership.user) === String(filter.user) &&
              String(membership.organization) === String(filter.organization),
          ) ?? null,
      );
    }
  }

  class FakeUser {
    static findById(userId) {
      const user = users.get(String(userId)) ?? null;
      return { select: async () => user };
    }
  }

  async function runTransaction(callback) {
    if (transactionError) {
      throw transactionError;
    }

    const organizationSnapshot = new Map(organizations);
    const membershipSnapshot = [...memberships];
    try {
      return await callback(session);
    } catch (error) {
      organizations.clear();
      for (const [key, value] of organizationSnapshot) {
        organizations.set(key, value);
      }
      memberships.splice(0, memberships.length, ...membershipSnapshot);
      throw error;
    }
  }

  function reset() {
    organizations.clear();
    memberships.length = 0;
    users.clear();
    users.set('665f00000000000000000001', {
      _id: '665f00000000000000000001',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      tokenVersion: 0,
      status: 'active',
    });
    users.set('665f00000000000000000002', {
      _id: '665f00000000000000000002',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      tokenVersion: 0,
      status: 'active',
    });
    nextId = 1;
    membershipCreateError = null;
    organizationSlugDuplicateOnce = false;
    transactionError = null;
    lastMembershipFilter = null;
    lastMemberListFilter = null;
  }

  function seedOrganization(fields) {
    const organization = { _id: id(), ...fields };
    organizations.set(String(organization._id), organization);
    return organization;
  }

  function seedMembership(fields) {
    const membership = {
      _id: id(),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      ...fields,
    };
    memberships.push(membership);
    return membership;
  }

  return {
    FakeMembership,
    FakeOrganization,
    FakeUser,
    organizations,
    memberships,
    reset,
    runTransaction,
    seedMembership,
    seedOrganization,
    get membershipCreateError() {
      return membershipCreateError;
    },
    set membershipCreateError(error) {
      membershipCreateError = error;
    },
    set organizationSlugDuplicateOnce(value) {
      organizationSlugDuplicateOnce = value;
    },
    set transactionError(error) {
      transactionError = error;
    },
    get lastMembershipFilter() {
      return lastMembershipFilter;
    },
    get lastMemberListFilter() {
      return lastMemberListFilter;
    },
  };
});

vi.mock('dotenv/config', () => ({}));
vi.mock('../../src/modules/auth/models/user.model.js', () => ({
  User: stores.FakeUser,
}));
vi.mock('../../src/modules/organizations/models/organization.model.js', () => ({
  Organization: stores.FakeOrganization,
}));
vi.mock('../../src/modules/organizations/models/membership.model.js', () => ({
  Membership: stores.FakeMembership,
}));
vi.mock('../../src/utils/transaction.js', () => ({
  withTransaction: stores.runTransaction,
}));

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';

const userId = '665f00000000000000000001';
const otherUserId = '665f00000000000000000002';

function accessToken(subject = userId) {
  return jwt.sign({ sub: subject, ver: 0 }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    audience: 'resolvehq-web',
    issuer: 'resolvehq-api',
    expiresIn: '5m',
  });
}

function authenticatedAs(subject = userId) {
  return { Authorization: `Bearer ${accessToken(subject)}` };
}

beforeEach(() => {
  stores.reset();
});

describe('organization API', () => {
  it('requires authentication for organization creation', async () => {
    const response = await request(app)
      .post('/api/v1/organizations')
      .send({ name: 'Acme Team' });

    expect(response.status).toBe(401);
    expect(stores.organizations.size).toBe(0);
    expect(stores.memberships).toHaveLength(0);
  });

  it('creates an organization and Owner membership for the authenticated user', async () => {
    const response = await request(app)
      .post('/api/v1/organizations')
      .set(authenticatedAs())
      .send({ name: '  Acme Team  ' });

    expect(response.status).toBe(201);
    expect(response.body.data.organization).toMatchObject({
      id: expect.any(String),
      name: 'Acme Team',
      slug: 'acme-team',
      role: 'owner',
    });
    expect([...stores.organizations.values()][0].createdBy).toBe(userId);
    expect(stores.memberships).toHaveLength(1);
    expect(stores.memberships[0]).toMatchObject({
      organization: response.body.data.organization.id,
      user: userId,
      role: 'owner',
    });
  });

  it('uses a unique URL-safe slug when the base slug is already taken', async () => {
    stores.seedOrganization({
      name: 'Acme Team',
      slug: 'acme-team',
      createdBy: otherUserId,
    });

    const response = await request(app)
      .post('/api/v1/organizations')
      .set(authenticatedAs())
      .send({ name: 'Acme Team' });

    expect(response.status).toBe(201);
    expect(response.body.data.organization.slug).toMatch(
      /^acme-team-[a-f0-9]{8}$/,
    );
    expect(stores.organizations.size).toBe(2);
  });

  it('retries a unique-index slug race in a fresh transaction', async () => {
    stores.organizationSlugDuplicateOnce = true;

    const response = await request(app)
      .post('/api/v1/organizations')
      .set(authenticatedAs())
      .send({ name: 'Acme Team' });

    expect(response.status).toBe(201);
    expect(response.body.data.organization.slug).toMatch(
      /^acme-team-[a-f0-9]{8}$/,
    );
    expect(stores.organizations.size).toBe(1);
    expect(stores.memberships).toHaveLength(1);
  });

  it('rejects invalid names and client-supplied owner or tenant fields', async () => {
    for (const body of [
      { name: '   ' },
      { name: 'x'.repeat(81) },
      { name: 'Acme Team', createdBy: otherUserId },
      { name: 'Acme Team', organizationId: '665f00000000000000000003' },
    ]) {
      const response = await request(app)
        .post('/api/v1/organizations')
        .set(authenticatedAs())
        .send(body);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }

    expect(stores.organizations.size).toBe(0);
    expect(stores.memberships).toHaveLength(0);
  });

  it('does not retain an organization when Owner membership creation fails', async () => {
    stores.membershipCreateError = new Error('membership write failed');

    const response = await request(app)
      .post('/api/v1/organizations')
      .set(authenticatedAs())
      .send({ name: 'Acme Team' });

    expect(response.status).toBe(500);
    expect(stores.organizations.size).toBe(0);
    expect(stores.memberships).toHaveLength(0);
  });

  it('reports unsupported transaction topology without attempting nontransactional writes', async () => {
    stores.transactionError = new Error(
      'MongoDB transactions require a replica set or sharded cluster.',
    );

    const response = await request(app)
      .post('/api/v1/organizations')
      .set(authenticatedAs())
      .send({ name: 'Acme Team' });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: 'TRANSACTIONS_UNAVAILABLE',
      message: 'MongoDB transactions require a replica set or sharded cluster.',
    });
    expect(stores.organizations.size).toBe(0);
    expect(stores.memberships).toHaveLength(0);
  });

  it('lists only organizations connected to the authenticated user memberships', async () => {
    const ownOrganization = stores.seedOrganization({
      name: 'Ada Team',
      slug: 'ada-team',
      createdBy: userId,
    });
    stores.seedMembership({
      organization: ownOrganization._id,
      user: userId,
      role: 'owner',
    });
    stores.seedMembership({
      organization: stores.seedOrganization({
        name: 'Grace Team',
        slug: 'grace-team',
        createdBy: otherUserId,
      })._id,
      user: otherUserId,
      role: 'owner',
    });

    const response = await request(app)
      .get('/api/v1/organizations')
      .set(authenticatedAs());

    expect(response.status).toBe(200);
    expect(response.body.data.organizations).toHaveLength(1);
    expect(response.body.data.organizations[0]).toMatchObject({
      id: String(ownOrganization._id),
      name: 'Ada Team',
      role: 'owner',
    });
  });

  it('returns an organization only after resolving the caller membership', async () => {
    const organization = stores.seedOrganization({
      name: 'Ada Team',
      slug: 'ada-team',
      createdBy: userId,
    });
    stores.seedMembership({
      organization: organization._id,
      user: userId,
      role: 'member',
    });

    const response = await request(app)
      .get(`/api/v1/organizations/${organization._id}`)
      .set(authenticatedAs());

    expect(response.status).toBe(200);
    expect(response.body.data.organization).toMatchObject({
      id: String(organization._id),
      name: 'Ada Team',
      role: 'member',
    });
    expect(stores.lastMembershipFilter).toEqual({
      organization: String(organization._id),
      user: userId,
    });
  });

  it('returns 404 for invalid or non-member organization identifiers', async () => {
    const organization = stores.seedOrganization({
      name: 'Grace Team',
      slug: 'grace-team',
      createdBy: otherUserId,
    });
    stores.seedMembership({
      organization: organization._id,
      user: otherUserId,
      role: 'owner',
    });

    const invalidIdResponse = await request(app)
      .get('/api/v1/organizations/not-an-object-id')
      .set(authenticatedAs());
    const nonMemberResponse = await request(app)
      .get(`/api/v1/organizations/${organization._id}`)
      .set(authenticatedAs());

    expect(invalidIdResponse.status).toBe(404);
    expect(nonMemberResponse.status).toBe(404);
  });

  it.each(['owner', 'admin', 'member', 'viewer'])(
    'allows %s members to list members only from the resolved organization',
    async (role) => {
      const organization = stores.seedOrganization({
        name: 'Ada Team',
        slug: 'ada-team',
        createdBy: userId,
      });
      stores.seedMembership({
        organization: organization._id,
        user: userId,
        role,
      });
      stores.seedMembership({
        organization: organization._id,
        user: otherUserId,
        role: 'member',
      });
      const otherOrganization = stores.seedOrganization({
        name: 'Grace Team',
        slug: 'grace-team',
        createdBy: otherUserId,
      });
      stores.seedMembership({
        organization: otherOrganization._id,
        user: otherUserId,
        role: 'owner',
      });

      const response = await request(app)
        .get(`/api/v1/organizations/${organization._id}/members`)
        .set(authenticatedAs());

      expect(response.status).toBe(200);
      expect(response.body.data.members).toHaveLength(2);
      expect(response.body.data.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: userId,
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role,
            joinedAt: '2025-01-01T00:00:00.000Z',
          }),
          expect.objectContaining({
            id: otherUserId,
            name: 'Grace Hopper',
            email: 'grace@example.com',
            role: 'member',
          }),
        ]),
      );
      expect(stores.lastMembershipFilter).toEqual({
        organization: String(organization._id),
        user: userId,
      });
      expect(stores.lastMemberListFilter).toEqual({
        organization: organization._id,
      });
    },
  );

  it('requires authentication to list organization members', async () => {
    const organization = stores.seedOrganization({
      name: 'Ada Team',
      slug: 'ada-team',
      createdBy: userId,
    });

    const response = await request(app).get(
      `/api/v1/organizations/${organization._id}/members`,
    );

    expect(response.status).toBe(401);
    expect(stores.lastMembershipFilter).toBeNull();
    expect(stores.lastMemberListFilter).toBeNull();
  });

  it('returns 404 when a user requests members of an organization they do not belong to', async () => {
    const organization = stores.seedOrganization({
      name: 'Grace Team',
      slug: 'grace-team',
      createdBy: otherUserId,
    });
    stores.seedMembership({
      organization: organization._id,
      user: otherUserId,
      role: 'owner',
    });

    const response = await request(app)
      .get(`/api/v1/organizations/${organization._id}/members`)
      .set(authenticatedAs());

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(stores.lastMembershipFilter).toEqual({
      organization: String(organization._id),
      user: userId,
    });
    expect(stores.lastMemberListFilter).toBeNull();
  });
});
