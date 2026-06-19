import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  signup,
  login,
  refresh,
  logout,
  buildAuditContext,
} from '../../auth/auth.service.js';
import { setAuthCookies, clearAuthCookies } from '../../utils/auth-cookies.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { AuthError, RateLimitError } from '../../utils/errors.js';
import { checkRateLimit } from '../../utils/rate-limit.js';
import { getClientIpFromHeaders } from '../../utils/client-ip.js';

const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  phone: z.string().optional().nullable(),
  businessName: z.string().min(1).max(100),
  acceptTerms: z.boolean().refine((v) => v === true, {
    message: 'Terms must be accepted',
  }),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function rateLimitOrThrow(
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const result = await checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimitError('Too many attempts, please try again later');
  }
}

function clientIpKey(req: { headers: Record<string, string | string[] | undefined> }): string {
  return getClientIpFromHeaders(req.headers) ?? 'unknown';
}

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    '/v1/auth/signup',
    {
      schema: {
        body: SignupBody,
        response: {
          201: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      await rateLimitOrThrow(`signup:${clientIpKey(req)}`, 5, 60_000);
      const result = await signup(req.body, buildAuditContext(req));
      setAuthCookies(reply, result.tokens);
      reply.code(201);
      return okEnvelope({
        user: result.user,
        business: result.business,
        membership: result.membership,
      });
    },
  );

  app.post(
    '/v1/auth/login',
    {
      schema: {
        body: LoginBody,
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      await rateLimitOrThrow(`login:${clientIpKey(req)}`, 10, 60_000);
      const result = await login(req.body, buildAuditContext(req));
      setAuthCookies(reply, result.tokens);
      return okEnvelope({ user: result.user, memberships: result.memberships });
    },
  );

  app.post(
    '/v1/auth/refresh',
    {
      schema: {
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      const rawRefresh = req.cookies.inyuku_rt;
      if (!rawRefresh) {
        throw new AuthError('AUTH_MISSING_BEARER', 'Refresh token required');
      }
      const result = await refresh(rawRefresh, buildAuditContext(req));
      setAuthCookies(reply, result.tokens);
      return okEnvelope({ user: result.user, memberships: result.memberships });
    },
  );

  app.post(
    '/v1/auth/logout',
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      const rawRefresh = req.cookies.inyuku_rt;
      if (rawRefresh) {
        await logout(rawRefresh, buildAuditContext(req));
      }
      clearAuthCookies(reply);
      return okEnvelope({ loggedOut: true });
    },
  );
}
