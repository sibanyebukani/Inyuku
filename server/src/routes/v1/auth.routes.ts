import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import {
  signup,
  login,
  refresh,
  logout,
  requestOtp,
  verifyOtp,
  requestPasswordReset,
  confirmPasswordReset,
  buildAuditContext,
  type SignupInput,
  type LoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type PasswordResetConfirmInput,
} from '../../auth/auth.service.js';
import { setAuthCookies, clearAuthCookies } from '../../utils/auth-cookies.js';
import { okEnvelope } from '../../utils/route-helpers.js';
import { AuthError, RateLimitError } from '../../utils/errors.js';
import { checkRateLimit } from '../../utils/rate-limit.js';
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

const OtpRequestBody = z.object({
  phone: z.string().min(1),
  purpose: z.string().optional(),
});

const OtpVerifyBody = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
  purpose: z.string().optional(),
});

const PasswordResetRequestBody = z.object({
  email: z.string().email(),
});

const PasswordResetConfirmBody = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
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

function clientIpKey(req: FastifyRequest): string {
  return req.ip ?? 'unknown';
}

export default async function authRoutes(app: FastifyInstance) {
  const authGlobalLimit = process.env.AUTH_GLOBAL_LIMIT
    ? parseInt(process.env.AUTH_GLOBAL_LIMIT, 10)
    : 30;

  // Defense-in-depth per-IP limit across all auth routes.
  app.addHook("onRequest", async (req) => {
    if (req.method === "POST") {
      await rateLimitOrThrow(`auth-global:${req.ip ?? "unknown"}`, authGlobalLimit, 60_000);
    }
  });

  app.post(
    '/v1/auth/signup',
    {
      bodyLimit: 16 * 1024,
      schema: {
        body: SignupBody,
        response: {
          201: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      await rateLimitOrThrow(`signup:${clientIpKey(req)}`, 5, 60_000);
      const result = await signup(req.body as SignupInput, buildAuditContext(req));
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
      bodyLimit: 16 * 1024,
      schema: {
        body: LoginBody,
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      await rateLimitOrThrow(`login:${clientIpKey(req)}`, 10, 60_000);
      const result = await login(req.body as LoginInput, buildAuditContext(req));
      setAuthCookies(reply, result.tokens);
      return okEnvelope({ user: result.user, memberships: result.memberships });
    },
  );

  app.post(
    '/v1/auth/refresh',
    {
      bodyLimit: 16 * 1024,
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
      bodyLimit: 16 * 1024,
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

  app.post(
    '/v1/auth/otp/request',
    {
      bodyLimit: 16 * 1024,
      schema: {
        body: OtpRequestBody,
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req) => {
      const result = await requestOtp(req.body as OtpRequestInput, buildAuditContext(req));
      return okEnvelope(result);
    },
  );

  app.post(
    '/v1/auth/otp/verify',
    {
      bodyLimit: 16 * 1024,
      schema: {
        body: OtpVerifyBody,
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as OtpVerifyInput;
      await rateLimitOrThrow(`otp-verify:${clientIpKey(req)}:${body.phone}`, 10, 60_000);
      const result = await verifyOtp(body, buildAuditContext(req));
      if (result.tokens) {
        setAuthCookies(reply, result.tokens);
      }
      return okEnvelope({
        verified: result.verified,
        user: result.user,
        memberships: result.memberships,
      });
    },
  );

  app.post(
    '/v1/auth/password/reset-request',
    {
      bodyLimit: 16 * 1024,
      schema: {
        body: PasswordResetRequestBody,
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req) => {
      await rateLimitOrThrow(`reset-request:${clientIpKey(req)}`, 5, 60_000);
      const result = await requestPasswordReset((req.body as { email: string }).email, buildAuditContext(req));
      return okEnvelope(result);
    },
  );

  app.get(
    '/v1/auth/me',
    {
      bodyLimit: 16 * 1024,
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.sub },
        select: { id: true, email: true, name: true, phone: true, status: true },
      });
      const memberships = await prisma.membership.findMany({
        where: { userId: req.user!.sub },
        include: { business: { select: { id: true, name: true, slug: true, status: true } } },
      });
      return okEnvelope({ user, memberships });
    },
  );

  app.post(
    '/v1/auth/password/reset-confirm',
    {
      bodyLimit: 16 * 1024,
      schema: {
        body: PasswordResetConfirmBody,
        response: {
          200: z.object({ ok: z.literal(true), data: z.any() }),
        },
      },
    },
    async (req) => {
      await rateLimitOrThrow(`reset-confirm:${clientIpKey(req)}`, 5, 60_000);
      const result = await confirmPasswordReset(req.body as PasswordResetConfirmInput, buildAuditContext(req));
      return okEnvelope(result);
    },
  );
}
