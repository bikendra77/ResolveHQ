// Centralized RBAC permission definitions and checker, following Section 6.12
// of ResolveHQ_Architecture_Technical_Blueprint.pdf.

export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(['*']),
  admin: Object.freeze([
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
  ]),
  member: Object.freeze([
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
  ]),
  viewer: Object.freeze([
    'member:read',
    'project:read',
    'activity:project',
    'analytics:read',
  ]),
});

// Keep checks fail-closed even for the owner's global grant. Add new concrete
// permissions here when introducing them to the authorization model.
const KNOWN_PERMISSIONS = new Set([
  'org:update',
  'member:read',
  'member:invite',
  'member:role',
  'member:remove',
  'project:create',
  'project:update',
  'project:archive',
  'project:delete',
  'project:read',
  'projectMember:manage',
  'task:create',
  'task:update',
  'task:move',
  'task:assign',
  'task:delete',
  'task:delete:own',
  'issue:create',
  'issue:update',
  'issue:move',
  'issue:assign',
  'issue:delete',
  'issue:delete:own',
  'comment:create',
  'comment:update',
  'comment:update:own',
  'comment:delete',
  'comment:delete:own',
  'activity:project',
  'activity:org',
  'analytics:read',
]);

function matchesGrant(grant, permission) {
  if (grant === '*' || grant === permission) return true;
  if (!grant.endsWith(':*')) return false;

  const prefix = grant.slice(0, -1);
  return permission.startsWith(prefix) && permission.length > prefix.length;
}

/**
 * Checks whether a role grants a known, concrete permission.
 * Ownership qualifiers describe a permission scope only; services must still
 * load the resource and verify its owner before allowing an operation.
 *
 * @param {string} role - One of the keys in ROLE_PERMISSIONS.
 * @param {string} permission - A known permission, e.g. "project:read".
 * @returns {boolean} true if the role allows the permission, false otherwise.
 */
export function can(role, permission) {
  if (
    typeof role !== 'string' ||
    typeof permission !== 'string' ||
    !Object.hasOwn(ROLE_PERMISSIONS, role) ||
    !KNOWN_PERMISSIONS.has(permission)
  ) {
    return false;
  }

  return ROLE_PERMISSIONS[role].some((grant) =>
    matchesGrant(grant, permission),
  );
}
