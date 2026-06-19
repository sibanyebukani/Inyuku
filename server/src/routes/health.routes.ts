import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { errorEnvelope, okEnvelope } from '../utils/route-helpers.js';

export default async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () =>
    okEnvelope({
      status: 'ok',
      commit: process.env.GIT_COMMIT_SHA ?? 'dev',
      uptime: process.uptime(),
    }),
  );

  app.get('/ready', async (_req, reply) => {
    const checks: { db: boolean; redis: boolean } = { db: false, redis: false };
    let reason = '';

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch (err) {
      reason = `db: ${err instanceof Error ? err.message : String(err)}`;
    }

    try {
      const pong = await redis.ping();
      checks.redis = pong === 'PONG';
    } catch (err) {
      reason += `${reason ? '; ' : ''}redis: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (checks.db && checks.redis) {
      return okEnvelope(checks);
    }

    reply.code(503);
    return errorEnvelope('NOT_READY', `Service unavailable: ${reason || 'dependency down'}`, checks);
  });
}
