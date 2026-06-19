import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { ForbiddenError } from '../utils/errors.js';
import { hasPermission } from '../auth/permissions.js';

export interface RequirePermissionOptions {
  permission: string;
  businessId?: string;
}

/**
 * Route-layer permission guard (ADR-INY-010).
 *
 * Resolves the tenant `businessId` from (in order):
 *   1. Explicit `businessId` option (used for platform/admin routes)
 *   2. `req.params.businessId`
 *   3. `req.headers['x-business-id']`
 *   4. `req.body.businessId`
 *
 * Loads the caller's Membership for that tenant and checks the effective
 * permission set = role defaults ∪ explicit Membership.permissions.
 * Cross-tenant access (no membership) returns 403.
 */
export default fp(async function permissionGuard(app: FastifyInstance) {
  app.decorate(
    'requirePermission',
    function requirePermission(opts: RequirePermissionOptions) {
      return async function guard(req: FastifyRequest, _reply: FastifyReply) {
        if (!req.user) {
          throw new ForbiddenError('Authentication required');
        }

        const resolvedBusinessId =
          opts.businessId ??
          req.params?.businessId ??
          req.headers['x-business-id'] ??
          (req.body as { businessId?: string } | undefined)?.businessId;

        if (!resolvedBusinessId || typeof resolvedBusinessId !== 'string') {
          throw new ForbiddenError('Tenant context required');
        }

        const membership = await prisma.membership.findUnique({
          where: {
            userId_businessId: {
              userId: req.user.sub,
              businessId: resolvedBusinessId,
            },
          },
          include: { business: true },
        });

        if (!membership) {
          throw new ForbiddenError('Insufficient permissions');
        }

        if (
          !hasPermission(
            membership.role,
            membership.permissions ?? [],
            opts.permission,
          )
        ) {
          throw new ForbiddenError('Insufficient permissions');
        }

        req.membership = membership;
      };
    },
  );
});
