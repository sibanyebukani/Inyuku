import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { getSecretSetting, WHATSAPP_WEBHOOK_VERIFY_TOKEN_KEY } from '../../services/settings.service.js';

/**
 * WhatsApp BSP webhook edge routes.
 *
 * - GET /v1/webhooks/whatsapp  — subscription verify / hub-challenge (public)
 * - POST /v1/webhooks/whatsapp — inbound message/status ingest (public + HMAC)
 *
 * This plugin runs in its own Fastify encapsulation so the raw-body content
 * parser is scoped to this route only.
 */

export default async function whatsappWebhookRoutes(app: FastifyInstance) {
  // Scoped raw-body capture for the webhook route.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function rawBodyParser(req, body, done) {
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(body as string, 'utf8');
      (req as FastifyRequest).rawBody = raw;
      try {
        const json = JSON.parse(raw.toString('utf8'));
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
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
}
