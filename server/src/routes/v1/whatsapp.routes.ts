import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildAuditContext } from '../../auth/auth.service.js';
import { auditLog } from '../../utils/audit-logger.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../services/whatsapp-template.service.js';

type BizParams = { businessId: string };
type TemplateParams = { businessId: string; id: string };

const TemplateCategoryEnum = z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']);
const TemplateStatusEnum = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED']);

const ParamSpec = z.object({
  name: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean']),
});

const CreateTemplateBody = z.object({
  name: z.string().min(1).max(200),
  language: z.string().min(1).max(10),
  category: TemplateCategoryEnum,
  status: TemplateStatusEnum,
  bodyText: z.string().min(1),
  paramSchema: z.array(ParamSpec).default([]),
  providerTemplateId: z.string().optional(),
});

const UpdateTemplateBody = z.object({
  category: TemplateCategoryEnum.optional(),
  status: TemplateStatusEnum.optional(),
  bodyText: z.string().min(1).optional(),
  paramSchema: z.array(ParamSpec).optional(),
  providerTemplateId: z.string().optional().nullable(),
});

export default async function whatsappRoutes(app: FastifyInstance) {
  // ─── Templates ──────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/whatsapp/templates',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:read' })] },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const templates = await listTemplates(businessId);
      return okEnvelope({ templates });
    },
  );

  app.post(
    '/v1/businesses/:businessId/whatsapp/templates',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_channel' })],
      schema: { body: CreateTemplateBody },
    },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof CreateTemplateBody>;
      const template = await createTemplate(businessId, {
        ...body,
        providerTemplateId: body.providerTemplateId ?? null,
      });
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'whatsapp_template',
        action: 'CREATE',
        entityId: template.id,
        changes: { name: { old: null, new: template.name } },
      });
      void reply.code(201);
      return okEnvelope({ template });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/whatsapp/templates/:id',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_channel' })],
      schema: { body: UpdateTemplateBody },
    },
    async (req) => {
      const { businessId, id } = req.params as TemplateParams;
      const body = req.body as z.infer<typeof UpdateTemplateBody>;
      const template = await updateTemplate(businessId, id, body);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'whatsapp_template',
        action: 'UPDATE',
        entityId: template.id,
        changes: { update: { old: null, new: body } },
      });
      return okEnvelope({ template });
    },
  );

  app.delete(
    '/v1/businesses/:businessId/whatsapp/templates/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_channel' })] },
    async (req) => {
      const { businessId, id } = req.params as TemplateParams;
      const template = await deleteTemplate(businessId, id);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'whatsapp_template',
        action: 'DELETE',
        entityId: template.id,
        changes: { name: { old: template.name, new: null } },
      });
      return okEnvelope({ template });
    },
  );
}
