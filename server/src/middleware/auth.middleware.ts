import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';
import { AuthError } from '../utils/errors.js';
import { getClientIpFromHeaders } from '../utils/client-ip.js';
import type { AuditContext } from '../types/fastify.d.js';

export default fp(async function authMiddleware(app: FastifyInstance) {
  app.decorate(
    'authenticate',
    async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
      const token =
        req.cookies.inyuku_at ?? extractBearer(req.headers.authorization);

      if (!token) {
        throw new AuthError('AUTH_MISSING_BEARER', 'Authentication required');
      }

      let user;
      try {
        user = await verifyAccessToken(token);
      } catch {
        throw new AuthError('AUTH_INVALID_TOKEN', 'Invalid access token');
      }

      if (user.status !== 'ACTIVE') {
        throw new AuthError(
          'AUTH_ACCOUNT_INACTIVE',
          'Account is not active',
          403,
        );
      }

      req.user = user;
      req.auditCtx = {
        userId: user.sub,
        ipAddress: getClientIpFromHeaders(req.headers),
        userAgent: req.headers['user-agent'] ?? null,
        requestId: req.id,
      } satisfies AuditContext;
    },
  );
});

function extractBearer(auth?: string): string | undefined {
  if (!auth) return undefined;
  const [scheme, token] = auth.split(' ');
  if (scheme === 'Bearer' && token) return token;
  return undefined;
}
