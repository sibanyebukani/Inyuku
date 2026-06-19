import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { maskEmail, maskPII, maskPhone, maskSAID } from './pii-mask.js';

export type AuditAction =
  | 'SIGNUP'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REFRESH'
  | 'PASSWORD_RESET'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGE'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VIEW'
  | 'INVITE'
  | 'REMOVE'
  | 'REVOKE'
  | 'SUSPEND'
  | 'INVOKE';

export interface AuditLogInput {
  userId?: string | null;
  businessId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Write an audit log entry. Never throws — audit failures must not break
 * the calling request, but they ARE logged to stderr so they surface in
 * platform logs / alerting.
 *
 * All values inside `changes.*.old` / `changes.*.new` are run through
 * `maskPII` before persistence so we never store raw passwords, tokens,
 * SA IDs, emails or phone numbers in the audit table.
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    // Mask PII inside the `changes` payload
    let maskedChanges:
      | Record<string, { old: unknown; new: unknown }>
      | null = null;

    if (input.changes) {
      maskedChanges = {};
      for (const [field, diff] of Object.entries(input.changes)) {
        maskedChanges[field] = {
          old: maskPII(diff.old, field),
          new: maskPII(diff.new, field),
        };
      }
    }

    // Mask PII in entityId: emails, SA IDs, phone numbers
    let entityId = input.entityId ?? null;
    if (entityId) {
      if (EMAIL_RE.test(entityId)) {
        entityId = maskEmail(entityId);
      } else if (/^\d{13}$/.test(entityId)) {
        entityId = maskSAID(entityId);
      } else if (/^(\+27|0)\d{9,11}$/.test(entityId)) {
        entityId = maskPhone(entityId);
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        businessId: input.businessId ?? null,
        action: input.action,
        entity: input.entity,
        entityId,
        changes:
          (maskedChanges as unknown as Prisma.InputJsonValue) ??
          Prisma.JsonNull,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (e) {
    // Never throw from the audit logger — drop the event but make it loud.
    // Mask the input before logging to avoid leaking raw PII into platform logs.
    console.error('[audit-logger] failed:', {
      event: maskPII(input),
      error: e instanceof Error ? e.message : e,
    });
  }
}

export { maskPII };
