import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => {
  const invitations = new Map();
  const memberships = [];
  const organizations = new Map();
  const users = new Map();
  const session = Object.freeze({ transactionSession: true });
  let nextId = 1;

  function id() {
    return (nextId++).toString(16).padStart(24, '0');
  }

  function matches(record, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === 'expiresAt' && value?.$gt) {
        return record.expiresAt > value.$gt;
      }
      if (key === 'expiresAt' && value?.$lte) {
        return record.expiresAt <= value.$lte;
      }
      return String(record[key]) === String(value);
    });
  }

  function query(resolve) {
    const pending = {
      select() {
        return pending;
      },
      session() {
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

  class FakeInvitation {
    constructor(fields) {
      this._id = id();
      this.createdAt = new Date();
      this.updatedAt = this.createdAt;
      this.status = 'pending';
      Object.assign(this, fields);
    }

    async save() {
      const duplicate = [...invitations.values()].some(
        (invitation) =>
          invitation.organization.toString() === this.organization.toString() &&
          invitation.email === this.email &&
          invitation.status === 'pending',
      );
      if (duplicate) {
        throw Object.assign(new Error('duplicate invitation'), { code: 11000 });
      }
      invitations.set(String(this._id), this);
      return this;
    }

    static updateMany(filter, update) {
      return query(() => {
        let modifiedCount = 0;
        for (const invitation of invitations.values()) {
          if (matches(invitation, filter)) {
            Object.assign(invitation, update.$set);
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      });
    }

    static findOne(filter) {
      return query(
        () =>
          [...invitations.values()].find((invitation) =>
            matches(invitation, filter),
          ) ?? null,
      );
    }

    static find(filter) {
      return query(() =>
        [...invitations.values()].filter((invitation) =>
          matches(invitation, filter),
        ),
      );
    }

    static findOneAndUpdate(filter, update) {
      return query(() => {
        const invitation = [...invitations.values()].find((candidate) =>
          matches(candidate, filter),
        );
        if (!invitation) return null;
        Object.assign(invitation, update.$set, { updatedAt: new Date() });
        return invitation;
      });
    }
  }

  class FakeMembership {
    static exists(filter) {
      return query(
        () =>
          memberships.find((membership) => matches(membership, filter)) ?? null,
      );
    }

    static findOne(filter) {
      return query(
        () =>
          memberships.find((membership) => matches(membership, filter)) ?? null,
      );
    }

    static async create(records, { session: activeSession }) {
      if (activeSession !== session) {
        throw new Error(
          'Membership write did not receive the transaction session',
        );
      }
      const created = records.map((record) => ({ _id: id(), ...record }));
      memberships.push(...created);
      return created;
    }
  }

  class FakeUser {
    static findById(userId) {
      return { select: async () => users.get(String(userId)) ?? null };
    }

    static findOne(filter) {
      return query(
        () => [...users.values()].find((user) => matches(user, filter)) ?? null,
      );
    }
  }

  async function runTransaction(callback) {
    const invitationSnapshot = new Map(
      [...invitations].map(([key, value]) => [key, { ...value }]),
    );
    const membershipSnapshot = [...memberships];
    try {
      return await callback(session);
    } catch (error) {
      invitations.clear();
      for (const [key, value] of invitationSnapshot) {
        invitations.set(key, value);
      }
      memberships.splice(0, memberships.length, ...membershipSnapshot);
      throw error;
    }
  }

  function reset() {
    invitations.clear();
    memberships.length = 0;
    organizations.clear();
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
    users.set('665f00000000000000000003', {
      _id: '665f00000000000000000003',
      name: 'Katherine Johnson',
      email: 'katherine@example.com',
      tokenVersion: 0,
      status: 'active',
    });
    organizations.set('665f00000000000000000011', {
      _id: '665f00000000000000000011',
      name: 'Ada Team',
      slug: 'ada-team',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    organizations.set('665f00000000000000000012', {
      _id: '665f00000000000000000012',
      name: 'Grace Team',
      slug: 'grace-team',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    memberships.push(
      {
        _id: id(),
        organization: '665f00000000000000000011',
        user: '665f00000000000000000001',
        role: 'owner',
      },
      {
        _id: id(),
        organization: '665f00000000000000000011',
        user: '665f00000000000000000002',
        role: 'admin',
      },
      {
        _id: id(),
        organization: '665f00000000000000000012',
        user: '665f00000000000000000003',
        role: 'admin',
      },
    );
    nextId = 100;
  }

  function seedMembership(fields) {
    const membership = { _id: id(), ...fields };
    memberships.push(membership);
    return membership;
  }

  return {
    FakeInvitation,
    FakeMembership,
    FakeUser,
    invitations,
    memberships,
    organizations,
    reset,
    runTransaction,
    seedMembership,
  };
});

vi.mock('dotenv/config', () => ({}));
vi.mock('../../src/modules/auth/models/user.model.js', () => ({
  User: stores.FakeUser,
}));
vi.mock('../../src/modules/organizations/models/membership.model.js', () => ({
  Membership: stores.FakeMembership,
}));
vi.mock('../../src/modules/organizations/models/organization.model.js', () => ({
  Organization: {
    findById(organizationId) {
      const organization = stores.organizations.get(String(organizationId));
      return { select: async () => organization ?? null };
    },
  },
}));
vi.mock('../../src/modules/organizations/models/invitation.model.js', () => ({
  Invitation: stores.FakeInvitation,
}));
vi.mock('../../src/utils/transaction.js', () => ({
  withTransaction: stores.runTransaction,
}));

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';

const ownerId = '665f00000000000000000001';
const adminId = '665f00000000000000000002';
const otherAdminId = '665f00000000000000000003';
const organizationId = '665f00000000000000000011';
const otherOrganizationId = '665f00000000000000000012';

function accessToken(subject) {
  return jwt.sign({ sub: subject, ver: 0 }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    audience: 'resolvehq-web',
    issuer: 'resolvehq-api',
    expiresIn: '5m',
  });
}

function authenticatedAs(userId) {
  return { Authorization: `Bearer ${accessToken(userId)}` };
}

function invitationToken(response) {
  const url = new URL(response.body.data.acceptUrl);
  return url.pathname.split('/').at(-1);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function createInvitation(userId = ownerId, email = 'new@example.com') {
  return request(app)
    .post(`/api/v1/organizations/${organizationId}/invitations`)
    .set(authenticatedAs(userId))
    .send({ email, role: 'member' });
}

beforeEach(() => {
  stores.reset();
});

describe('organization invitation API', () => {
  it('creates a hashed, expiring invitation for an authorized role', async () => {
    const response = await createInvitation(adminId, '  NEW@EXAMPLE.COM ');

    expect(response.status).toBe(201);
    expect(response.body.data.invitation).toMatchObject({
      email: 'new@example.com',
      role: 'member',
      status: 'pending',
    });
    expect(response.body.data.invitation.expiresAt).toBeDefined();
    const token = invitationToken(response);
    const invitation = [...stores.invitations.values()][0];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitation.tokenHash).toBe(hashToken(token));
    expect(invitation.tokenHash).not.toBe(token);
    expect(invitation).not.toHaveProperty('token');
    expect(response.body.data.acceptUrl).toContain('/invite/');
  });

  it.each([
    ['member', adminId],
    ['viewer', adminId],
  ])('denies %s members from creating invitations', async (role, userId) => {
    stores.memberships.find((membership) => membership.user === userId).role =
      role;

    const response = await createInvitation(userId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(stores.invitations.size).toBe(0);
  });

  it('prevents duplicate pending invitations and invitations for existing members', async () => {
    expect((await createInvitation(ownerId)).status).toBe(201);

    const duplicateInvitation = await createInvitation(
      adminId,
      'NEW@example.com',
    );
    expect(duplicateInvitation.status).toBe(409);

    const duplicateMember = await createInvitation(ownerId, 'ada@example.com');
    expect(duplicateMember.status).toBe(409);
    expect(duplicateMember.body.error.message).toBe(
      'This person is already a member',
    );
    expect(stores.invitations.size).toBe(1);
  });

  it('lists invitations and revokes only invitations in the resolved tenant', async () => {
    const created = await createInvitation();
    const invitationId = created.body.data.invitation.id;

    const listed = await request(app)
      .get(`/api/v1/organizations/${organizationId}/invitations?status=pending`)
      .set(authenticatedAs(adminId));
    expect(listed.status).toBe(200);
    expect(listed.body.data.invitations).toHaveLength(1);
    expect(listed.body.data.invitations[0]).not.toHaveProperty('tokenHash');

    const crossTenantRevoke = await request(app)
      .delete(
        `/api/v1/organizations/${otherOrganizationId}/invitations/${invitationId}`,
      )
      .set(authenticatedAs(otherAdminId));
    expect(crossTenantRevoke.status).toBe(404);
    expect([...stores.invitations.values()][0].status).toBe('pending');

    const revoked = await request(app)
      .delete(
        `/api/v1/organizations/${organizationId}/invitations/${invitationId}`,
      )
      .set(authenticatedAs(ownerId));
    expect(revoked.status).toBe(204);
    expect([...stores.invitations.values()][0].status).toBe('revoked');
  });

  it('denies unauthorized roles from listing or revoking invitations', async () => {
    const created = await createInvitation();
    const invitationId = created.body.data.invitation.id;
    stores.memberships.find((membership) => membership.user === adminId).role =
      'member';

    const listed = await request(app)
      .get(`/api/v1/organizations/${organizationId}/invitations`)
      .set(authenticatedAs(adminId));
    const revoked = await request(app)
      .delete(
        `/api/v1/organizations/${organizationId}/invitations/${invitationId}`,
      )
      .set(authenticatedAs(adminId));

    expect(listed.status).toBe(403);
    expect(revoked.status).toBe(403);
    expect([...stores.invitations.values()][0].status).toBe('pending');
  });

  it('accepts a valid invitation for the matching authenticated email exactly once', async () => {
    const created = await createInvitation(ownerId, 'katherine@example.com');
    const token = invitationToken(created);
    const response = await request(app)
      .post('/api/v1/invitations/accept')
      .set(authenticatedAs('665f00000000000000000003'))
      .send({ token });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      organizationId,
      role: 'member',
    });
    expect(stores.memberships).toContainEqual(
      expect.objectContaining({
        organization: organizationId,
        user: '665f00000000000000000003',
        role: 'member',
        invitedBy: ownerId,
      }),
    );
    expect([...stores.invitations.values()][0]).toMatchObject({
      status: 'accepted',
      acceptedBy: '665f00000000000000000003',
    });

    const replay = await request(app)
      .post('/api/v1/invitations/accept')
      .set(authenticatedAs('665f00000000000000000003'))
      .send({ token });
    expect(replay.status).toBe(404);
  });

  it('rejects invalid, expired, and email-mismatched invitation tokens', async () => {
    const invalid = await request(app)
      .post('/api/v1/invitations/accept')
      .set(authenticatedAs('665f00000000000000000003'))
      .send({ token: 'A'.repeat(43) });
    expect(invalid.status).toBe(404);

    const expiredInvitation = await createInvitation(
      ownerId,
      'katherine@example.com',
    );
    const expiredToken = invitationToken(expiredInvitation);
    [...stores.invitations.values()][0].expiresAt = new Date(Date.now() - 1000);
    const expired = await request(app)
      .post('/api/v1/invitations/accept')
      .set(authenticatedAs('665f00000000000000000003'))
      .send({ token: expiredToken });
    expect(expired.status).toBe(404);

    const mismatchInvitation = await createInvitation(
      ownerId,
      'new@example.com',
    );
    const mismatch = await request(app)
      .post('/api/v1/invitations/accept')
      .set(authenticatedAs(adminId))
      .send({ token: invitationToken(mismatchInvitation) });
    expect(mismatch.status).toBe(403);
    expect([...stores.invitations.values()].at(-1).status).toBe('pending');
  });

  it('prevents accepting an invitation when the user is already a member', async () => {
    const created = await createInvitation(ownerId, 'katherine@example.com');
    stores.seedMembership({
      organization: organizationId,
      user: '665f00000000000000000003',
      role: 'viewer',
    });

    const response = await request(app)
      .post('/api/v1/invitations/accept')
      .set(authenticatedAs('665f00000000000000000003'))
      .send({ token: invitationToken(created) });

    expect(response.status).toBe(409);
    expect(
      stores.memberships.filter(
        (membership) =>
          membership.organization === organizationId &&
          membership.user === '665f00000000000000000003',
      ),
    ).toHaveLength(1);
    expect([...stores.invitations.values()][0].status).toBe('pending');
  });
});
