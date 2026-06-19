import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { auditLog } from '../../utils/audit-logger.js';
import { getSetting, getSecretSetting, setSetting } from '../../services/settings.service.js';
import { sendEmail } from '../../utils/email.js';
import { buildAuditContext } from '../../auth/auth.service.js';

const UpdateBusinessBody = z.object({
  name: z.string().min(1).max(100).optional(),
});

const InviteMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(['MERCHANT_OWNER', 'MERCHANT_STAFF', 'AI_AGENT']).default('MERCHANT_STAFF'),
  permissions: z.array(z.string()).default([]),
});

const UpdateSettingsBody = z.object({
  settings: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
      isSecret: z.boolean().default(false),
    }),
  ),
});

const AuditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateConsentBody = z.object({
  purpose: z.string().min(1),
  userId: z.string().optional(),
});

const RevokeConsentBody = z.object({
  reason: z.string().optional(),
});

async function resolveSettings(
  rows: { key: string; value: string; isSecret: boolean }[],
  businessId: string,
  canReadSecret: boolean,
): Promise<{ key: string; value: string; isSecret: boolean }[]> {
  return await Promise.all(
    rows.map(async (row) => {
      if (row.isSecret && canReadSecret) {
        return {
          key: row.key,
          value: (await getSecretSetting(row.key, businessId)) ?? row.value,
          isSecret: true,
        };
      }
      return {
        key: row.key,
        value: (await getSetting(row.key, businessId)) ?? row.value,
        isSecret: row.isSecret,
      };
    }),
  );
}

export default async function businessRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // Business profile
  // ---------------------------------------------------------------------------
  app.get(
    '/v1/businesses/:businessId',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'business:read' })],
    },
    async (req) => {
      const business = await prisma.business.findUnique({
        where: { id: req.params.businessId as string },
      });
      if (!business) throw new NotFoundError('Business not found');
      return okEnvelope({ business });
    },
  );

  app.patch(
    '/v1/businesses/:businessId',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'business:update' })],
      schema: { body: UpdateBusinessBody },
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const existing = await prisma.business.findUnique({ where: { id: businessId } });
      if (!existing) throw new NotFoundError('Business not found');

      const data: { name?: string } = {};
      if (req.body.name !== undefined) data.name = req.body.name;

      const updated = await prisma.business.update({
        where: { id: businessId },
        data,
      });

      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'business',
        action: 'UPDATE',
        entityId: businessId,
        changes: {
          name: { old: existing.name, new: updated.name },
        },
      });

      return okEnvelope({ business: updated });
    },
  );

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------
  app.get(
    '/v1/businesses/:businessId/members',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'member:read' })],
    },
    async (req) => {
      const members = await prisma.membership.findMany({
        where: { businessId: req.params.businessId as string },
        include: { user: { select: { id: true, email: true, name: true, phone: true } } },
      });
      return okEnvelope({ members });
    },
  );

  app.post(
    '/v1/businesses/:businessId/members',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'member:invite' })],
      schema: { body: InviteMemberBody },
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (!business) throw new NotFoundError('Business not found');

      const user = await prisma.user.findUnique({
        where: { email: req.body.email.toLowerCase().trim() },
      });
      if (!user) throw new NotFoundError('User not found');

      try {
        const membership = await prisma.membership.create({
          data: {
            userId: user.id,
            businessId,
            role: req.body.role,
            permissions: req.body.permissions,
          },
        });

        void sendEmail({
          to: user.email,
          subject: `You have been invited to ${business.name}`,
          html: `<p>Hi ${user.name},</p><p>You have been invited to join <strong>${business.name}</strong> on Inyuku.</p>`,
        });

        await auditLog({
          ...buildAuditContext(req),
          userId: req.user!.sub,
          businessId,
          entity: 'member',
          action: 'INVITE',
          entityId: membership.id,
          changes: {
            role: { old: null, new: req.body.role },
            userId: { old: null, new: user.id },
          },
        });

        return okEnvelope({ membership });
      } catch (err) {
        if (err instanceof Error && err.message.includes('Unique constraint')) {
          throw new ValidationError('User is already a member of this business');
        }
        throw err;
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  app.get(
    '/v1/businesses/:businessId/settings',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'settings:read' })],
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const rows = await prisma.setting.findMany({ where: { businessId } });
      const canReadSecret = req.membership
        ? (req.membership.permissions ?? []).includes('settings:read_secret')
        : false;
      const settings = await resolveSettings(rows, businessId, canReadSecret);
      return okEnvelope({ settings });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/settings',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'settings:update' })],
      schema: { body: UpdateSettingsBody },
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const updated: { key: string; value: string; isSecret: boolean }[] = [];
      for (const item of req.body.settings) {
        const setting = await setSetting(item.key, item.value, {
          businessId,
          isSecret: item.isSecret,
          updatedById: req.user!.sub,
        });
        updated.push({ key: setting.key, value: setting.value, isSecret: setting.isSecret });
      }
      return okEnvelope({ settings: updated });
    },
  );

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------
  app.get(
    '/v1/businesses/:businessId/audit',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'audit:read' })],
      schema: { querystring: AuditQuery },
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const page = (req.query as { page: number }).page;
      const limit = (req.query as { limit: number }).limit;
      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.auditLog.count({ where: { businessId } }),
      ]);
      return okEnvelope({ rows, pagination: { page, limit, total } });
    },
  );

  // ---------------------------------------------------------------------------
  // Consents
  // ---------------------------------------------------------------------------
  app.get(
    '/v1/businesses/:businessId/consents',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'consent:read' })],
    },
    async (req) => {
      const consents = await prisma.consent.findMany({
        where: { businessId: req.params.businessId as string },
        include: { revocations: true },
      });
      return okEnvelope({ consents });
    },
  );

  app.post(
    '/v1/businesses/:businessId/consents',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'consent:write' })],
      schema: { body: CreateConsentBody },
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const consent = await prisma.consent.create({
        data: {
          businessId,
          userId: req.body.userId ?? null,
          purpose: req.body.purpose,
        },
      });
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'consent',
        action: 'CREATE',
        entityId: consent.id,
        changes: { purpose: { old: null, new: consent.purpose } },
      });
      return okEnvelope({ consent });
    },
  );

  app.post(
    '/v1/businesses/:businessId/consents/:id/revoke',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'consent:write' })],
      schema: { body: RevokeConsentBody },
    },
    async (req) => {
      const businessId = req.params.businessId as string;
      const id = req.params.id as string;
      const consent = await prisma.consent.findUnique({ where: { id } });
      if (!consent || consent.businessId !== businessId) throw new NotFoundError('Consent not found');

      const revocation = await prisma.consentRevocation.create({
        data: {
          consentId: id,
          reason: req.body.reason ?? null,
        },
      });
      await prisma.consent.update({
        where: { id },
        data: { status: 'REVOKED' },
      });
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'consent',
        action: 'REVOKE',
        entityId: id,
        changes: { status: { old: 'GRANTED', new: 'REVOKED' } },
      });
      return okEnvelope({ revocation });
    },
  );

  // ---------------------------------------------------------------------------
  // AI usage
  // ---------------------------------------------------------------------------
  app.get(
    '/v1/businesses/:businessId/ai-usage',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'ai:usage:read' })],
    },
    async (req) => {
      const rows = await prisma.aiUsage.findMany({
        where: { businessId: req.params.businessId as string },
        orderBy: { createdAt: 'desc' },
      });
      return okEnvelope({ aiUsage: rows });
    },
  );
}
