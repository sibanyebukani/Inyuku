import { describe, it, expect } from 'vitest';
import { prisma } from '../db.js';

describe('schema', () => {
  it('exposes baseline models', () => {
    for (const m of [
      'user',
      'refreshToken',
      'passwordResetToken',
      'phoneOtp',
      'business',
      'membership',
      'permission',
      'auditLog',
      'errorLog',
      'setting',
      'consent',
      'consentRevocation',
      'aiUsage',
      'lead',
    ]) {
      expect((prisma as unknown as Record<string, unknown>)[m]).toBeDefined();
    }
  });
});
