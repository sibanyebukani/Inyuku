import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import whatsappWebhookRoutes from '../whatsapp-webhook.routes.js';
import { prisma } from '../../../db.js';
import {
  setSetting,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY,
  WHATSAPP_WEBHOOK_APP_SECRET_KEY,
} from '../../../services/settings.service.js';
import * as rateLimit from '../../../utils/rate-limit.js';

let app: FastifyInstance;
const logs: Record<string, unknown>[] = [];

function sign(body: string | Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function samplePayload(phoneNumberId: string, messageId: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '+27821234567' },
              messages: [
                {
                  id: messageId,
                  from: '27821234567',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Hello from the test' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('whatsapp webhook routes', () => {
  beforeAll(async () => {
    app = Fastify({
      logger: {
        level: 'info',
        stream: { write: (msg: string) => logs.push(JSON.parse(msg)) },
      },
    });
    await app.register(whatsappWebhookRoutes);
    await app.ready();
    await setSetting(WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, 'correct-token', { isSecret: true });
    await setSetting(WHATSAPP_WEBHOOK_APP_SECRET_KEY, 'test-app-secret', { isSecret: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    logs.length = 0;
    await prisma.whatsAppInboundEvent.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { entity: 'whatsapp_webhook' } });
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({
      where: {
        key: { in: [WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, WHATSAPP_WEBHOOK_APP_SECRET_KEY] },
        businessId: 'platform',
      },
    });
    await app.close();
  });

  describe('GET /v1/webhooks/whatsapp', () => {
    it('echoes hub.challenge as text/plain when verify token matches', async () => {
      const r = await app.inject({
        method: 'GET',
        url: '/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'correct-token',
          'hub.challenge': 'challenge-string-123',
        },
      });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('text/plain');
      expect(r.body).toBe('challenge-string-123');
    });

    it('returns 403 when verify token is wrong', async () => {
      const r = await app.inject({
        method: 'GET',
        url: '/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge-string-123',
        },
      });
      expect(r.statusCode).toBe(403);
    });

    it('returns 403 when hub.mode is not subscribe', async () => {
      const r = await app.inject({
        method: 'GET',
        url: '/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'unsubscribe',
          'hub.verify_token': 'correct-token',
          'hub.challenge': 'x',
        },
      });
      expect(r.statusCode).toBe(403);
    });

    it('does not return a JSON envelope on success', async () => {
      const r = await app.inject({
        method: 'GET',
        url: '/v1/webhooks/whatsapp',
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'correct-token',
          'hub.challenge': '1234',
        },
      });
      expect(r.body).not.toContain('{');
      expect(r.body).toBe('1234');
    });
  });

  describe('POST /v1/webhooks/whatsapp', () => {
    it('accepts a valid signed event and persists a PENDING WhatsAppInboundEvent', async () => {
      const phoneNumberId = 'phone-id-1';
      const messageId = 'wamid.valid1';
      const payload = samplePayload(phoneNumberId, messageId);
      const body = JSON.stringify(payload);

      const r = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': sign(body, 'test-app-secret'), 'content-type': 'application/json' },
        payload: body,
      });

      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ ok: true, data: { ok: true } });

      const rows = await prisma.whatsAppInboundEvent.findMany({});
      expect(rows).toHaveLength(1);
      expect(rows[0].providerEventId).toBe(messageId);
      expect(rows[0].phoneNumberId).toBe(phoneNumberId);
      expect(rows[0].status).toBe('PENDING');
      expect(rows[0].signatureVerified).toBe(true);
    });

    it('rejects an invalid signature with 401 and audits VERIFY_FAILED, no DB write', async () => {
      const payload = samplePayload('phone-id', 'wamid.invalid');
      const body = JSON.stringify(payload);

      const r = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': 'sha256=deadbeef', 'content-type': 'application/json' },
        payload: body,
      });

      expect(r.statusCode).toBe(401);
      const events = await prisma.whatsAppInboundEvent.findMany({});
      expect(events).toHaveLength(0);
      const audits = await prisma.auditLog.findMany({ where: { entity: 'whatsapp_webhook', action: 'VERIFY_FAILED' } });
      expect(audits).toHaveLength(1);
    });

    it('is idempotent on duplicate providerEventId', async () => {
      const payload = samplePayload('phone-id-2', 'wamid.duplicate');
      const body = JSON.stringify(payload);
      const header = sign(body, 'test-app-secret');

      const r1 = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': header, 'content-type': 'application/json' },
        payload: body,
      });
      expect(r1.statusCode).toBe(200);

      const r2 = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': header, 'content-type': 'application/json' },
        payload: body,
      });
      expect(r2.statusCode).toBe(200);

      const rows = await prisma.whatsAppInboundEvent.findMany({ where: { providerEventId: 'wamid.duplicate' } });
      expect(rows).toHaveLength(1);
    });

    it('returns 429 when the edge rate-limit is exceeded', async () => {
      vi.spyOn(rateLimit, 'checkRateLimit').mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60000,
      });

      const payload = samplePayload('phone-id', 'wamid.ratelimit');
      const body = JSON.stringify(payload);
      const r = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': sign(body, 'test-app-secret'), 'content-type': 'application/json' },
        payload: body,
      });

      expect(r.statusCode).toBe(429);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });
    });

    it('does not log raw body or customer phone numbers', async () => {
      const payload = samplePayload('phone-id-log', 'wamid.log');
      const body = JSON.stringify(payload);
      await app.inject({
        method: 'POST',
        url: '/v1/webhooks/whatsapp',
        headers: { 'x-hub-signature-256': sign(body, 'test-app-secret'), 'content-type': 'application/json' },
        payload: body,
      });

      const logText = JSON.stringify(logs);
      expect(logText).not.toContain('Hello from the test');
      expect(logText).not.toContain('27821234567');
    });
  });
});
