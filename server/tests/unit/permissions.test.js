import { describe, expect, it } from 'vitest';
import { can, ROLE_PERMISSIONS } from '../../src/utils/permissions.js';

const blueprintRolePermissions = {
  owner: ['*'],
  admin: [
    'org:update',
    'member:read',
    'member:invite',
    'member:role',
    'member:remove',
    'project:create',
    'project:update',
    'project:archive',
    'projectMember:manage',
    'project:read',
    'task:*',
    'issue:*',
    'comment:create',
    'comment:update:own',
    'comment:delete',
    'activity:project',
    'activity:org',
    'analytics:read',
  ],
  member: [
    'member:read',
    'project:read',
    'task:create',
    'task:update',
    'task:move',
    'task:assign',
    'task:delete:own',
    'issue:create',
    'issue:update',
    'issue:move',
    'issue:assign',
    'issue:delete:own',
    'comment:create',
    'comment:update:own',
    'comment:delete:own',
    'activity:project',
    'analytics:read',
  ],
  viewer: ['member:read', 'project:read', 'activity:project', 'analytics:read'],
};

const rolePermissionCases = [
  {
    role: 'owner',
    allowed: [
      'org:update',
      'project:delete',
      'task:delete:own',
      'activity:org',
      'analytics:read',
    ],
    denied: ['billing:manage', 'task:unlisted'],
  },
  {
    role: 'admin',
    allowed: [
      'org:update',
      'member:read',
      'member:role',
      'project:archive',
      'projectMember:manage',
      'task:delete:own',
      'issue:move',
      'comment:update:own',
      'activity:org',
    ],
    denied: ['project:delete', 'comment:delete:own'],
  },
  {
    role: 'member',
    allowed: [
      'member:read',
      'project:read',
      'task:create',
      'task:update',
      'task:move',
      'task:assign',
      'task:delete:own',
      'issue:create',
      'issue:delete:own',
      'comment:create',
      'comment:update:own',
      'comment:delete:own',
      'activity:project',
      'analytics:read',
    ],
    denied: [
      'org:update',
      'project:create',
      'project:archive',
      'task:delete',
      'comment:update',
      'comment:delete',
      'activity:org',
    ],
  },
  {
    role: 'viewer',
    allowed: [
      'member:read',
      'project:read',
      'activity:project',
      'analytics:read',
    ],
    denied: [
      'org:update',
      'project:create',
      'task:create',
      'issue:read',
      'comment:create',
      'activity:org',
    ],
  },
];

describe('RBAC permission engine', () => {
  it('matches the Section 6.12 role matrix exactly', () => {
    expect(ROLE_PERMISSIONS).toEqual(blueprintRolePermissions);
  });

  it.each(rolePermissionCases)(
    '$role allows and denies the blueprint permissions',
    ({ role, allowed, denied }) => {
      for (const permission of allowed) {
        expect(
          can(role, permission),
          `${role} should allow ${permission}`,
        ).toBe(true);
      }

      for (const permission of denied) {
        expect(can(role, permission), `${role} should deny ${permission}`).toBe(
          false,
        );
      }
    },
  );

  it('grants the global wildcard only to the owner', () => {
    const globalWildcardRoles = Object.entries(ROLE_PERMISSIONS)
      .filter(([, permissions]) => permissions.includes('*'))
      .map(([role]) => role);

    expect(globalWildcardRoles).toEqual(['owner']);
    expect(can('owner', 'project:delete')).toBe(true);
    expect(can('admin', 'project:delete')).toBe(false);
  });

  it('matches nested resource wildcards', () => {
    expect(can('admin', 'task:delete:own')).toBe(true);
    expect(can('admin', 'issue:delete:own')).toBe(true);
    expect(can('admin', 'task:unlisted')).toBe(false);
  });

  it('keeps ownership checks in the service layer', () => {
    expect(can('member', 'task:delete:own')).toBe(true);
    expect(can('member', 'task:delete')).toBe(false);
    expect(can('member', 'comment:update:own')).toBe(true);
    expect(can('member', 'comment:update')).toBe(false);
  });

  it('fails closed for unknown permissions, including for the owner', () => {
    for (const role of ['owner', 'admin', 'member', 'viewer']) {
      expect(can(role, 'billing:manage')).toBe(false);
    }
  });

  it('fails closed for empty or wildcard permission requests', () => {
    for (const permission of ['', ' ', '*', 'task:*', 'task::delete']) {
      expect(can('owner', permission)).toBe(false);
      expect(can('admin', permission)).toBe(false);
    }
  });

  it('fails closed for unknown roles', () => {
    expect(can('ghost', 'project:read')).toBe(false);
  });

  it('rejects prototype-inherited role names', () => {
    for (const role of ['constructor', 'toString', '__proto__']) {
      expect(can(role, 'project:read')).toBe(false);
    }
  });

  it('fails closed for null, undefined, and invalid input types', () => {
    for (const role of [null, undefined, 1, {}, []]) {
      expect(can(role, 'project:read')).toBe(false);
    }

    for (const permission of [null, undefined, 1, {}, []]) {
      expect(can('owner', permission)).toBe(false);
    }
  });
});
