import type { AccessClaims } from '../utils/jwt.js';
import type { Membership, Business } from '@prisma/client';
import type { RequirePermissionOptions } from '../middleware/require-permission.js';

export interface AuditContext {
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessClaims;
    auditCtx: AuditContext;
    membership?: Membership & { business: Business };
    /** Set only on the WhatsApp webhook route, where raw-body capture is scoped. */
    rawBody?: Buffer;
  }

  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      opts: RequirePermissionOptions,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
