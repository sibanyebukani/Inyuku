export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  MERCHANT_OWNER: [
    'business:read',
    'business:update',
    'business:delete',
    'member:invite',
    'member:read',
    'member:update',
    'member:remove',
    'settings:read',
    'settings:update',
    'audit:read',
    'consent:read',
    'consent:write',
    'ai:invoke',
    'ai:usage:read',
  ],
  MERCHANT_STAFF: [
    'business:read',
    'member:read',
    'settings:read',
    'consent:read',
    'ai:invoke',
  ],
  ADMIN: [
    'platform:business:read',
    'platform:business:suspend',
    'lead:read',
    'lead:update',
    'audit:read',
  ],
  SUPPORT: ['platform:business:read', 'lead:read', 'audit:read'],
  AI_AGENT: ['business:read', 'ai:invoke'],
};

export function effectivePermissions(
  role: string,
  explicitPermissions: string[],
): Set<string> {
  return new Set([
    ...(ROLE_PERMISSIONS[role] ?? []),
    ...explicitPermissions,
  ]);
}

export function hasPermission(
  role: string,
  explicitPermissions: string[],
  required: string,
): boolean {
  return effectivePermissions(role, explicitPermissions).has(required);
}
