import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createLead, type LeadInput } from '../../services/leads.service.js';
import { buildAuditContext } from '../../auth/auth.service.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { RateLimitError } from '../../utils/errors.js';
import { checkRateLimit } from '../../utils/rate-limit.js';

const ContactLeadBody = z.object({
  source: z.literal('contact'),
  name: z.string().min(1).max(200),
  email: z.string().email().max(254),
  message: z.string().min(1).max(10_000),
  consentGiven: z.boolean().optional(),
});

const ImpactReportLeadBody = z.object({
  source: z.literal('impact_report'),
  email: z.string().email().max(254),
  consentGiven: z.boolean().optional(),
});

const ShareStoryLeadBody = z.object({
  source: z.literal('share_story'),
  name: z.string().max(200).optional(),
  email: z.string().email().max(254).optional(),
  consentGiven: z.boolean().optional(),
}).catchall(z.unknown());

const LeadBody = z.discriminatedUnion('source', [
  ContactLeadBody,
  ImpactReportLeadBody,
  ShareStoryLeadBody,
]);

const LeadResponse = z.object({
  ok: z.literal(true),
  data: z.object({
    id: z.string(),
    status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM']),
  }),
});

async function rateLimitOrThrow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const result = await checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimitError('Too many submissions, please try again later');
  }
}

export default async function leadsRoutes(app: FastifyInstance) {
  app.post(
    '/v1/leads',
    {
      bodyLimit: 32 * 1024,
      schema: {
        body: LeadBody,
        response: { 201: LeadResponse },
      },
    },
    async (req, reply) => {
      await rateLimitOrThrow(`leads:${req.ip ?? 'unknown'}`, 10, 60_000);
      const result = await createLead(
        req.body as LeadInput,
        {
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
        buildAuditContext(req),
      );
      reply.code(201);
      return okEnvelope(result);
    },
  );
}
