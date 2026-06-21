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
    // M2 commerce
    'catalog:read',
    'catalog:write',
    'catalog:read_cost',
    'inventory:read',
    'inventory:write',
    'order:read',
    'order:write',
    'customer:read',
    'customer:write',
    'dashboard:read',
    'dashboard:read_financial',
    'sync:write',
  ],
  MERCHANT_STAFF: [
    'business:read',
    'member:read',
    'settings:read',
    'consent:read',
    'ai:invoke',
    // M2 commerce (no cost/financial split)
    'catalog:read',
    'catalog:write',
    'inventory:read',
    'inventory:write',
    'order:read',
    'order:write',
    'customer:read',
    'customer:write',
    'dashboard:read',
    'sync:write',
  ],
  ADMIN: [
    'platform:business:read',
    'platform:business:suspend',
    'lead:read',
    'lead:update',
    'audit:read',
  ],
  SUPPORT: ['platform:business:read', 'lead:read', 'audit:read'],
  AI_AGENT: [
    'business:read',
    'ai:invoke',
    // M2 read-only
    'catalog:read',
    'inventory:read',
    'order:read',
    'customer:read',
    'dashboard:read',
  ],
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
