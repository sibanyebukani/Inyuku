import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import whatsappWebhookRoutes from '../whatsapp-webhook.routes.js';
import { prisma } from '../../../db.js';
import { setSetting, WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY } from '../../../services/settings.service.js';

let app: FastifyInstance;

describe('whatsapp webhook routes', () => {
  beforeAll(async () => {
    app = Fastify();
    await app.register(whatsappWebhookRoutes);
    await app.ready();
    await setSetting(WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, 'correct-token', { isSecret: true });
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY, businessId: 'platform' } });
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
});
