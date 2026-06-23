import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildAuditContext } from '../../auth/auth.service.js';
import { auditLog } from '../../utils/audit-logger.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { NotFoundError } from '../../utils/errors.js';
import { prisma } from '../../db.js';
import { windowState } from '../../services/whatsapp-window.js';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../services/whatsapp-template.service.js';
import {
  listChannels,
  createChannel,
  updateChannel,
} from '../../services/whatsapp-channel.service.js';
import { sendWhatsAppMessage } from '../../services/whatsapp-send.service.js';
import { composeCatalogText } from '../../services/whatsapp-catalog-share.service.js';

type BizParams = { businessId: string };
type ChannelParams = { businessId: string; id: string };
type TemplateParams = { businessId: string; id: string };
type ConversationParams = { businessId: string; id: string };
type RuleParams = { businessId: string; id: string };

const ChannelModeEnum = z.enum(['SANDBOX', 'LIVE']);

const CreateChannelBody = z.object({
  phoneNumberId: z.string().min(1),
  displayPhoneNumber: z.string().min(1),
  mode: ChannelModeEnum,
  enabled: z.boolean().default(false),
  wabaId: z.string().optional(),
});

const UpdateChannelBody = z.object({
  displayPhoneNumber: z.string().min(1).optional(),
  mode: ChannelModeEnum.optional(),
  enabled: z.boolean().optional(),
  wabaId: z.string().optional().nullable(),
});

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

const MessageTypeEnum = z.enum(['TEXT', 'TEMPLATE']);
const SendClassEnum = z.enum(['TRANSACTIONAL', 'MARKETING']);

const SendMessageBody = z.object({
  type: MessageTypeEnum,
  sendClass: SendClassEnum,
  body: z.string().optional(),
  templateName: z.string().optional(),
  templateParams: z.record(z.unknown()).optional(),
  language: z.string().optional(),
});

const ShareCatalogBody = z.object({
  productIds: z.array(z.string().min(1)).optional(),
  sendClass: z.enum(['TRANSACTIONAL', 'MARKETING']),
});

const AutoReplyRuleBody = z
  .object({
    channelId: z.string().min(1).nullable().optional(),
    trigger: z.enum(['GREETING', 'KEYWORD', 'OUT_OF_HOURS']),
    enabled: z.boolean().optional(),
    keyword: z.string().min(1).nullable().optional(),
    action: z.enum(['SEND_TEXT', 'SHARE_CATALOG']),
    replyText: z.string().min(1).nullable().optional(),
    hoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    hoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    daysActive: z.array(z.number().int().min(1).max(7)).optional(),
    cooldownMinutes: z.number().int().min(0).optional(),
  })
  .refine((v) => v.trigger !== 'KEYWORD' || !!v.keyword, { message: 'keyword required for KEYWORD trigger', path: ['keyword'] })
  .refine((v) => v.trigger !== 'OUT_OF_HOURS' || (!!v.hoursStart && !!v.hoursEnd), { message: 'hoursStart+hoursEnd required for OUT_OF_HOURS', path: ['hoursStart'] })
  .refine((v) => v.action !== 'SEND_TEXT' || !!v.replyText, { message: 'replyText required for SEND_TEXT', path: ['replyText'] });

const AutoReplyRulePatchBody = z.object({
  channelId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  keyword: z.string().min(1).nullable().optional(),
  replyText: z.string().min(1).nullable().optional(),
  hoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  hoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  daysActive: z.array(z.number().int().min(1).max(7)).optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
});

const ConversationListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function whatsappRoutes(app: FastifyInstance) {
  // ─── Channels ───────────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/whatsapp/channels',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_channel' })] },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const channels = await listChannels(businessId);
      return okEnvelope({ channels });
    },
  );

  app.post(
    '/v1/businesses/:businessId/whatsapp/channels',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_channel' })],
      schema: { body: CreateChannelBody },
    },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof CreateChannelBody>;
      const channel = await createChannel(businessId, {
        ...body,
        wabaId: body.wabaId ?? null,
      });
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'whatsapp_channel',
        action: 'CREATE',
        entityId: channel.id,
        changes: { phoneNumberId: { old: null, new: channel.phoneNumberId } },
      });
      void reply.code(201);
      return okEnvelope({ channel });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/whatsapp/channels/:id',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_channel' })],
      schema: { body: UpdateChannelBody },
    },
    async (req) => {
      const { businessId, id } = req.params as ChannelParams;
      const body = req.body as z.infer<typeof UpdateChannelBody>;
      const oldChannel = await listChannels(businessId).then((list) => list.find((c) => c.id === id));
      const channel = await updateChannel(businessId, id, body);
      await auditLog({
        ...buildAuditContext(req),
        userId: req.user!.sub,
        businessId,
        entity: 'whatsapp_channel',
        action: 'UPDATE',
        entityId: channel.id,
        changes: {
          enabled: { old: oldChannel?.enabled ?? null, new: channel.enabled },
          mode: { old: oldChannel?.mode ?? null, new: channel.mode },
        },
      });
      return okEnvelope({ channel });
    },
  );

  // ─── Conversations / Messages ───────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/whatsapp/conversations',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:read' })],
      schema: { querystring: ConversationListQuery },
    },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const query = req.query as z.infer<typeof ConversationListQuery>;
      const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
          where: { businessId },
          orderBy: { lastInboundAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.conversation.count({ where: { businessId } }),
      ]);
      return okEnvelope({ conversations, pagination: { page: query.page, limit: query.limit, total } });
    },
  );

  app.get(
    '/v1/businesses/:businessId/whatsapp/conversations/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:read' })] },
    async (req) => {
      const { businessId, id } = req.params as ConversationParams;
      const conversation = await prisma.conversation.findUnique({ where: { id } });
      if (!conversation || conversation.businessId !== businessId) {
        throw new NotFoundError('Conversation not found');
      }
      const now = new Date();
      const { state, windowExpiresAt } = windowState(conversation.lastInboundAt, now);
      return okEnvelope({ conversation: { ...conversation, windowState: state, windowExpiresAt } });
    },
  );

  app.get(
    '/v1/businesses/:businessId/whatsapp/conversations/:id/messages',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:read' })],
      schema: { querystring: ConversationListQuery },
    },
    async (req) => {
      const { businessId, id } = req.params as ConversationParams;
      const query = req.query as z.infer<typeof ConversationListQuery>;
      const conversation = await prisma.conversation.findUnique({ where: { id } });
      if (!conversation || conversation.businessId !== businessId) {
        throw new NotFoundError('Conversation not found');
      }
      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: { businessId, conversationId: id },
          orderBy: { occurredAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        prisma.message.count({ where: { businessId, conversationId: id } }),
      ]);
      return okEnvelope({ messages, pagination: { page: query.page, limit: query.limit, total } });
    },
  );

  app.post(
    '/v1/businesses/:businessId/whatsapp/conversations/:id/messages',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:send' })],
      schema: { body: SendMessageBody },
    },
    async (req) => {
      const { businessId, id } = req.params as ConversationParams;
      const body = req.body as z.infer<typeof SendMessageBody>;
      const result = await sendWhatsAppMessage(businessId, id, {
        type: body.type,
        sendClass: body.sendClass,
        body: body.body ?? null,
        templateName: body.templateName ?? null,
        templateParams: body.templateParams ?? null,
        language: body.language ?? null,
      });

      if (result.error) {
        return okEnvelope({ message: result.message, error: result.error });
      }
      return okEnvelope({ message: result.message });
    },
  );

  app.post(
    '/v1/businesses/:businessId/whatsapp/conversations/:id/share-catalog',
    {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:send' })],
      schema: { body: ShareCatalogBody },
    },
    async (req) => {
      const { businessId, id } = req.params as ConversationParams;
      const body = req.body as z.infer<typeof ShareCatalogBody>;
      // tenant-validate the conversation (fail-closed, M3-A pattern)
      const conv = await prisma.conversation.findUnique({ where: { id } });
      if (!conv || conv.businessId !== businessId) throw new NotFoundError('Conversation not found');

      const text = await composeCatalogText(businessId, body.productIds);
      const result = await sendWhatsAppMessage(businessId, id, {
        type: 'TEXT',
        sendClass: body.sendClass,
        body: text,
      });
      if (result.error) return okEnvelope({ message: result.message, error: result.error });
      return okEnvelope({ message: result.message });
    },
  );

  // ─── Auto-Reply Rules ─────────────────────────────────────────────────────────

  app.get(
    '/v1/businesses/:businessId/whatsapp/auto-reply-rules',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:read' })] },
    async (req) => {
      const { businessId } = req.params as BizParams;
      const rules = await prisma.whatsAppAutoReplyRule.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
      return okEnvelope({ rules });
    },
  );

  app.post(
    '/v1/businesses/:businessId/whatsapp/auto-reply-rules',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_autoreply' })], schema: { body: AutoReplyRuleBody } },
    async (req, reply) => {
      const { businessId } = req.params as BizParams;
      const body = req.body as z.infer<typeof AutoReplyRuleBody>;
      const rule = await prisma.whatsAppAutoReplyRule.create({
        data: {
          businessId,
          channelId: body.channelId ?? null,
          trigger: body.trigger,
          enabled: body.enabled ?? false,
          keyword: body.keyword ?? null,
          action: body.action,
          replyText: body.replyText ?? null,
          hoursStart: body.hoursStart ?? null,
          hoursEnd: body.hoursEnd ?? null,
          daysActive: body.daysActive ?? [],
          ...(body.cooldownMinutes !== undefined ? { cooldownMinutes: body.cooldownMinutes } : {}),
        },
      });
      await auditLog({ ...buildAuditContext(req), userId: req.user!.sub, businessId, entity: 'whatsapp_auto_reply_rule', action: 'CREATE', entityId: rule.id, changes: { trigger: { old: null, new: rule.trigger }, action: { old: null, new: rule.action } } });
      void reply.code(201);
      return okEnvelope({ rule });
    },
  );

  app.patch(
    '/v1/businesses/:businessId/whatsapp/auto-reply-rules/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_autoreply' })], schema: { body: AutoReplyRulePatchBody } },
    async (req) => {
      const { businessId, id } = req.params as RuleParams;
      const existing = await prisma.whatsAppAutoReplyRule.findUnique({ where: { id } });
      if (!existing || existing.businessId !== businessId) throw new NotFoundError('Rule not found');
      const body = req.body as z.infer<typeof AutoReplyRulePatchBody>;
      const rule = await prisma.whatsAppAutoReplyRule.update({ where: { id }, data: body });
      await auditLog({ ...buildAuditContext(req), userId: req.user!.sub, businessId, entity: 'whatsapp_auto_reply_rule', action: 'UPDATE', entityId: rule.id, changes: { enabled: { old: existing.enabled, new: rule.enabled } } });
      return okEnvelope({ rule });
    },
  );

  app.delete(
    '/v1/businesses/:businessId/whatsapp/auto-reply-rules/:id',
    { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_autoreply' })] },
    async (req) => {
      const { businessId, id } = req.params as RuleParams;
      const existing = await prisma.whatsAppAutoReplyRule.findUnique({ where: { id } });
      if (!existing || existing.businessId !== businessId) throw new NotFoundError('Rule not found');
      await prisma.whatsAppAutoReplyRule.delete({ where: { id } });
      await auditLog({ ...buildAuditContext(req), userId: req.user!.sub, businessId, entity: 'whatsapp_auto_reply_rule', action: 'DELETE', entityId: id, changes: {} });
      return okEnvelope({ deleted: true });
    },
  );

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
