import { describe, it, expect } from 'vitest';
import { hasPermission, effectivePermissions, ROLE_PERMISSIONS } from '../permissions.js';

describe('permissions', () => {
  it('owner has business:update', () => {
    expect(hasPermission('MERCHANT_OWNER', [], 'business:update')).toBe(true);
  });

  it('staff lacks business:update', () => {
    expect(hasPermission('MERCHANT_STAFF', [], 'business:update')).toBe(false);
  });

  it('explicit grants are unioned with role defaults', () => {
    expect(hasPermission('MERCHANT_STAFF', ['business:update'], 'business:update')).toBe(true);
  });

  it('admin has platform permissions', () => {
    expect(hasPermission('ADMIN', [], 'lead:read')).toBe(true);
    expect(hasPermission('ADMIN', [], 'business:update')).toBe(false);
  });

  it('AI_AGENT is read + ai:invoke only', () => {
    expect(hasPermission('AI_AGENT', [], 'ai:invoke')).toBe(true);
    expect(hasPermission('AI_AGENT', [], 'business:update')).toBe(false);
  });
});
