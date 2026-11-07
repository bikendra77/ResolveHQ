import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Invitation } from '../../src/modules/organizations/models/invitation.model.js';
import { Membership } from '../../src/modules/organizations/models/membership.model.js';
import { Organization } from '../../src/modules/organizations/models/organization.model.js';

const objectId = () => new mongoose.Types.ObjectId();
const validHash = 'a'.repeat(64);

function indexFor(schema, fields) {
  return schema.indexes().find(([indexFields]) =>
    Object.entries(fields).every(([field, direction]) => {
      return indexFields[field] === direction;
    }),
  );
}

async function expectValidationError(document, path) {
  const error = await document.validate().catch((validationError) => {
    return validationError;
  });

  expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
  expect(error.errors[path]).toBeDefined();
}

describe('Organization model', () => {
  it('trims and validates names, normalizes URL-safe slugs, and references User', async () => {
    const organization = new Organization({
      name: '  ResolveHQ Team  ',
      slug: ' ResolveHQ-Team ',
      createdBy: objectId(),
    });

    expect(organization.name).toBe('ResolveHQ Team');
    expect(organization.slug).toBe('resolvehq-team');
    expect(Organization.schema.path('createdBy').options.ref).toBe('User');
    await expect(organization.validate()).resolves.toBeUndefined();
  });

  it('uses timestamps and a unique slug index', () => {
    expect(Organization.schema.options.timestamps).toBe(true);
    expect(indexFor(Organization.schema, { slug: 1 })[1].unique).toBe(true);
  });

  it('rejects missing or invalid required data', async () => {
    await expectValidationError(new Organization(), 'name');
    await expectValidationError(
      new Organization({
        name: 'Team',
        slug: 'bad_slug',
        createdBy: objectId(),
      }),
      'slug',
    );
    await expectValidationError(
      new Organization({ name: 'Team', slug: 'team' }),
      'createdBy',
    );
  });
});

describe('Membership model', () => {
  it.each(['owner', 'admin', 'member', 'viewer'])(
    'accepts the %s role and makes invitedBy optional',
    async (role) => {
      const membership = new Membership({
        organization: objectId(),
        user: objectId(),
        role,
      });

      expect(membership.invitedBy).toBeUndefined();
      expect(Membership.schema.path('organization').options.ref).toBe(
        'Organization',
      );
      expect(Membership.schema.path('user').options.ref).toBe('User');
      expect(Membership.schema.path('invitedBy').options.ref).toBe('User');
      await expect(membership.validate()).resolves.toBeUndefined();
    },
  );

  it('uses timestamps and the blueprint membership indexes', () => {
    expect(Membership.schema.options.timestamps).toBe(true);
    expect(
      indexFor(Membership.schema, { organization: 1, user: 1 })[1].unique,
    ).toBe(true);
    expect(indexFor(Membership.schema, { user: 1 })).toBeDefined();
    expect(
      indexFor(Membership.schema, { organization: 1, role: 1 }),
    ).toBeDefined();
  });

  it('rejects invalid roles and missing membership references', async () => {
    await expectValidationError(
      new Membership({
        organization: objectId(),
        user: objectId(),
        role: 'owner-admin',
      }),
      'role',
    );
    await expectValidationError(new Membership({ role: 'member' }), 'user');
  });
});

describe('Invitation model', () => {
  it('normalizes email and defaults a pending invitation with no project assignments', async () => {
    const now = Date.now();
    const invitation = new Invitation({
      organization: objectId(),
      email: '  PERSON@EXAMPLE.COM ',
      role: 'member',
      tokenHash: validHash,
    });

    expect(invitation.email).toBe('person@example.com');
    expect(invitation.status).toBe('pending');
    expect(invitation.projects).toEqual([]);
    expect(invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(
      now + 7 * 24 * 60 * 60 * 1000,
    );
    expect(invitation.expiresAt.getTime()).toBeLessThan(
      now + 7 * 24 * 60 * 60 * 1000 + 1000,
    );
    await expect(invitation.validate()).resolves.toBeUndefined();
  });

  it.each(['admin', 'member', 'viewer'])(
    'accepts the %s invitation role',
    async (role) => {
      const invitation = new Invitation({
        organization: objectId(),
        email: 'person@example.com',
        role,
        tokenHash: validHash,
      });

      await expect(invitation.validate()).resolves.toBeUndefined();
    },
  );

  it('references organization, projects, and inviter/acceptor users', () => {
    expect(Invitation.schema.path('organization').options.ref).toBe(
      'Organization',
    );
    expect(
      Invitation.schema.path('projects').embeddedSchemaType.options.ref,
    ).toBe('Project');
    expect(Invitation.schema.path('invitedBy').options.ref).toBe('User');
    expect(Invitation.schema.path('acceptedBy').options.ref).toBe('User');
    expect(Invitation.schema.options.timestamps).toBe(true);
  });

  it('stores no raw-token path and validates SHA-256 token hashes', async () => {
    expect(Invitation.schema.path('token')).toBeUndefined();
    expect(Invitation.schema.path('rawToken')).toBeUndefined();

    const invitation = new Invitation({ rawToken: 'plaintext-test-token' });
    expect(invitation.toObject()).not.toHaveProperty('rawToken');

    await expectValidationError(
      new Invitation({
        organization: objectId(),
        email: 'person@example.com',
        role: 'member',
        tokenHash: 'raw-invitation-token',
      }),
      'tokenHash',
    );
  });

  it('limits roles, emails, project assignments, and statuses', async () => {
    await expectValidationError(
      new Invitation({
        organization: objectId(),
        email: 'person@example.com',
        role: 'owner',
        tokenHash: validHash,
      }),
      'role',
    );
    await expectValidationError(
      new Invitation({
        organization: objectId(),
        email: 'not-an-email',
        role: 'viewer',
        tokenHash: validHash,
      }),
      'email',
    );
    await expectValidationError(
      new Invitation({
        organization: objectId(),
        email: 'person@example.com',
        role: 'viewer',
        tokenHash: validHash,
        status: 'active',
        projects: Array.from({ length: 21 }, objectId),
      }),
      'status',
    );
    await expectValidationError(
      new Invitation({
        organization: objectId(),
        email: 'person@example.com',
        role: 'viewer',
        tokenHash: validHash,
        projects: Array.from({ length: 21 }, objectId),
      }),
      'projects',
    );
  });

  it('requires the tenant, email, role, and token hash fields', async () => {
    await expectValidationError(
      new Invitation({
        email: 'person@example.com',
        role: 'member',
        tokenHash: validHash,
      }),
      'organization',
    );
    await expectValidationError(
      new Invitation({
        organization: objectId(),
        role: 'member',
        tokenHash: validHash,
      }),
      'email',
    );
    await expectValidationError(
      new Invitation({
        organization: objectId(),
        email: 'person@example.com',
        role: 'member',
      }),
      'tokenHash',
    );
  });

  it('uses unique token, organization/email/status, and delayed TTL indexes', () => {
    expect(indexFor(Invitation.schema, { tokenHash: 1 })[1].unique).toBe(true);
    expect(
      indexFor(Invitation.schema, {
        organization: 1,
        email: 1,
        status: 1,
      }),
    ).toBeDefined();
    expect(indexFor(Invitation.schema, { expiresAt: 1 })[1]).toMatchObject({
      expireAfterSeconds: 30 * 24 * 60 * 60,
    });
  });
});
