import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getSecretSetting, WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY } from '../../services/settings.service.js';
import { verifySignature } from '../../utils/whatsapp-signature.js';
import { auditLog } from '../../utils/audit-logger.js';
import { checkRateLimit } from '../../utils/rate-limit.js';
import { getClientIpFromHeaders } from '../../utils/client-ip.js';
import { prisma } from '../../db.js';
import { errorEnvelope, okEnvelope } from '../../utils/route-helpers.js';

/**
 * WhatsApp BSP webhook edge routes.
 *
 * - GET /v1/webhooks/whatsapp  — subscription verify / hub-challenge (public)
 * - POST /v1/webhooks/whatsapp — inbound message/status ingest (public + HMAC)
 *
 * This plugin runs in its own Fastify encapsulation so the raw-body content
 * parser is scoped to this route only. The parser deliberately does **not**
 * expose a parsed JSON body; signature verification happens first, then the
 * route parses `req.rawBody` only after the signature gate passes.
 */

const WEBHOOK_IP_LIMIT = 60; // per IP per minute
const WEBHOOK_GLOBAL_LIMIT = 1000; // whole-edge per minute
const WEBHOOK_WINDOW_MS = 60 * 1000;

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        messages?: Array<{ id?: string; from?: string; timestamp?: string; type?: string }>;
        statuses?: Array<{ id?: string; status?: string; timestamp?: string }>;
      };
    }>;
  }>;
};

export default async function whatsappWebhookRoutes(app: FastifyInstance) {
  // Scoped raw-body capture for the webhook route.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function rawBodyParser(req, body, done) {
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(body as string, 'utf8');
      (req as FastifyRequest).rawBody = raw;
      // Do not parse JSON here: signature verification must run before parsing.
      done(null, undefined);
    },
  );

  // ---------------------------------------------------------------------------
  // Subscription verification (Meta / 360dialog hub-challenge)
  // ---------------------------------------------------------------------------
  app.get('/v1/webhooks/whatsapp', async (req, reply) => {
    const query = req.query as {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    };

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode !== 'subscribe' || !token || !challenge) {
      return reply.code(403).type('text/plain').send('Forbidden');
    }

    const expected = await getSecretSetting(WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY);
    if (!expected) {
      return reply.code(403).type('text/plain').send('Forbidden');
    }

    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(token, 'utf8');
    if (expectedBuf.length !== actualBuf.length) {
      return reply.code(403).type('text/plain').send('Forbidden');
    }

    const ok = timingSafeEqual(expectedBuf, actualBuf);
    if (!ok) {
      return reply.code(403).type('text/plain').send('Forbidden');
    }

    return reply.code(200).type('text/plain').send(challenge);
  });

  // ---------------------------------------------------------------------------
  // Inbound ingest (fast-ack path)
  // ---------------------------------------------------------------------------
  app.post('/v1/webhooks/whatsapp', async (req, reply) => {
    const rawBody = req.rawBody;
    const signatureHeader = req.headers['x-hub-signature-256'];
    const clientIp = req.ip ?? getClientIpFromHeaders(req.headers, 'unknown');

    if (!rawBody || typeof signatureHeader !== 'string') {
      await auditLog({
        entity: 'whatsapp_webhook',
        action: 'VERIFY_FAILED',
        businessId: null,
        changes: { reason: { old: null, new: 'missing body or signature' }, sourceIp: { old: null, new: clientIp } },
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Signature verification failed'));
    }

    const appSecret = await getSecretSetting('whatsapp.webhook.appSecret');
    if (!appSecret || !verifySignature(rawBody, signatureHeader, appSecret)) {
      await auditLog({
        entity: 'whatsapp_webhook',
        action: 'VERIFY_FAILED',
        businessId: null,
        changes: { reason: { old: null, new: 'invalid signature' }, sourceIp: { old: null, new: clientIp } },
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return reply.code(401).send(errorEnvelope('UNAUTHORIZED', 'Signature verification failed'));
    }

    // Edge rate-limit: per IP + global per-edge ceiling.
    const ipKey = `ip:${clientIp}:whatsapp:webhook`;
    const [ipRate, globalRate] = await Promise.all([
      checkRateLimit(ipKey, WEBHOOK_IP_LIMIT, WEBHOOK_WINDOW_MS),
      checkRateLimit('global:whatsapp:webhook', WEBHOOK_GLOBAL_LIMIT, WEBHOOK_WINDOW_MS),
    ]);
    if (!ipRate.allowed || !globalRate.allowed) {
      return reply.code(429).send(errorEnvelope('RATE_LIMIT_EXCEEDED', 'Webhook rate limit exceeded'));
    }

    // Signature passed and rate-limit OK — now safe to parse.
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return reply.code(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid JSON body'));
    }

    const phoneNumberId = extractPhoneNumberId(payload);
    const providerEventId = extractProviderEventId(payload, rawBody);

    await prisma.whatsAppInboundEvent.createMany({
      data: [
        {
          providerEventId,
          phoneNumberId,
          rawPayload: payload as unknown as Prisma.InputJsonValue,
          signatureVerified: true,
          status: 'PENDING',
          receivedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });

    req.log.info({
      event: 'whatsapp_webhook_ingest',
      providerEventId,
      phoneNumberId: phoneNumberId ?? null,
      sourceIp: clientIp,
    });

    return reply.code(200).send(okEnvelope({ ok: true }));
  });
}

function extractPhoneNumberId(payload: WebhookPayload): string | null {
  return payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
}

function extractProviderEventId(payload: WebhookPayload, rawBody: Buffer): string {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  if (value?.messages && value.messages.length > 0 && value.messages[0]?.id) {
    return value.messages[0].id;
  }
  if (value?.statuses && value.statuses.length > 0 && value.statuses[0]?.id) {
    return value.statuses[0].id;
  }
  return createHash('sha256').update(rawBody).digest('hex');
}
