import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permissions.js';

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

  // M2 commerce RBAC cost-split
  it('owner has catalog:read_cost', () => {
    expect(hasPermission('MERCHANT_OWNER', [], 'catalog:read_cost')).toBe(true);
  });

  it('staff lacks catalog:read_cost', () => {
    expect(hasPermission('MERCHANT_STAFF', [], 'catalog:read_cost')).toBe(false);
  });

  it('owner has dashboard:read_financial', () => {
    expect(hasPermission('MERCHANT_OWNER', [], 'dashboard:read_financial')).toBe(true);
  });

  it('staff lacks dashboard:read_financial', () => {
    expect(hasPermission('MERCHANT_STAFF', [], 'dashboard:read_financial')).toBe(false);
  });

  it('ai_agent has no commerce write permissions', () => {
    expect(hasPermission('AI_AGENT', [], 'catalog:write')).toBe(false);
    expect(hasPermission('AI_AGENT', [], 'inventory:write')).toBe(false);
    expect(hasPermission('AI_AGENT', [], 'order:write')).toBe(false);
    expect(hasPermission('AI_AGENT', [], 'customer:write')).toBe(false);
    expect(hasPermission('AI_AGENT', [], 'sync:write')).toBe(false);
    expect(hasPermission('AI_AGENT', [], 'catalog:read_cost')).toBe(false);
    expect(hasPermission('AI_AGENT', [], 'dashboard:read_financial')).toBe(false);
  });

  it('ai_agent has commerce read permissions', () => {
    expect(hasPermission('AI_AGENT', [], 'catalog:read')).toBe(true);
    expect(hasPermission('AI_AGENT', [], 'inventory:read')).toBe(true);
    expect(hasPermission('AI_AGENT', [], 'order:read')).toBe(true);
    expect(hasPermission('AI_AGENT', [], 'customer:read')).toBe(true);
    expect(hasPermission('AI_AGENT', [], 'dashboard:read')).toBe(true);
  });

  it('staff has all operational commerce permissions', () => {
    expect(hasPermission('MERCHANT_STAFF', [], 'catalog:read')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'catalog:write')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'inventory:read')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'inventory:write')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'order:read')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'order:write')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'customer:read')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'customer:write')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'dashboard:read')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'sync:write')).toBe(true);
  });
});
