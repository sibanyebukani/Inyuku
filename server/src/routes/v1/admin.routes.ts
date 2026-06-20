import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import { auditLog } from '../../utils/audit-logger.js';
import { buildAuditContext } from '../../auth/auth.service.js';

const PLATFORM_BUSINESS_ID = 'platform';

const LeadQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM']).optional(),
});

const UpdateLeadBody = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM']),
});

export default async function adminRoutes(app: FastifyInstance) {
  app.get(
    '/v1/admin/leads',
    {
      preHandler: [
        app.authenticate,
        app.requirePermission({ permission: 'lead:read', businessId: PLATFORM_BUSINESS_ID }),
      ],
      schema: { querystring: LeadQuery },
    },
    async (req) => {
      const query = req.query as z.infer<typeof LeadQuery>;
      const where = query.status ? { status: query.status } : {};
      const [rows, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.lead.count({ where }),
      ]);
      return okEnvelope({ rows, pagination: { page: query.page, limit: query.limit, total } });
    },
  );

  app.patch(
    '/v1/admin/leads/:id',
    {
      preHandler: [
        app.authenticate,
        app.requirePermission({ permission: 'lead:update', businessId: PLATFORM_BUSINESS_ID }),
      ],
      schema: { body: UpdateLeadBody },
    },
    async (req) => {
      const id = (req.params as { id: string }).id;
      const body = req.body as z.infer<typeof UpdateLeadBody>;
      const existing = await prisma.lead.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Lead not found');

      const updated = await prisma.lead.update({
        where: { id },
        data: { status: body.status },
      });

      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        entity: 'lead',
        action: 'UPDATE',
        entityId: id,
        changes: { status: { old: existing.status, new: updated.status } },
      });

      return okEnvelope({ lead: updated });
    },
  );
}
