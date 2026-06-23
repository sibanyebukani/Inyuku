import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Prisma } from '@prisma/client';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AppError } from './utils/errors.js';
import { errorEnvelope } from './utils/route-helpers.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/v1/auth.routes.js';
import businessRoutes from './routes/v1/businesses.routes.js';
import adminRoutes from './routes/v1/admin.routes.js';
import leadsRoutes from './routes/v1/leads.routes.js';
import commerceRoutes from './routes/v1/commerce.routes.js';
import whatsappRoutes from './routes/v1/whatsapp.routes.js';
import whatsappWebhookRoutes from './routes/v1/whatsapp-webhook.routes.js';
import { startWhatsAppDrainer, stopWhatsAppDrainer } from './services/whatsapp-drainer.js';
import * as Sentry from '@sentry/node';
import authMiddleware from './middleware/auth.middleware.js';
import permissionGuard from './middleware/require-permission.js';

export interface BuildAppOptions {
  corsAllowedOrigins?: string[];
}

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const usePretty = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
  const trustProxyHops = process.env.TRUSTED_PROXY_HOPS
    ? parseInt(process.env.TRUSTED_PROXY_HOPS, 10)
    : 0;
  const app = Fastify({
    logger: usePretty
      ? { level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } }
      : { level: process.env.LOG_LEVEL ?? 'info' },
    disableRequestLogging: false,
    trustProxy: trustProxyHops,
    bodyLimit: 60 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const cookieDomain = process.env.COOKIE_DOMAIN;
  void app.register(helmet, { contentSecurityPolicy: false });
  void app.register(cors, {
    origin: opts.corsAllowedOrigins ?? parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS),
    credentials: true,
  });
  void app.register(cookie, {
    parseOptions: {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },
  });
  void app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  void app.register(swagger, {
    openapi: {
      info: { title: 'Inyuku API', version: '1.0.0' },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  void app.register(swaggerUi, {
    routePrefix: '/v1/docs',
    uiConfig: { docExpansion: 'list' },
  });

  void app.register(authMiddleware);
  void app.register(permissionGuard);

  app.addHook('onRequest', async (req) => {
    req.auditCtx = {
      ipAddress: null,
      userAgent: null,
      requestId: req.id,
    };
  });

  // CSRF defense: Origin/Referer allowlist on unsafe methods.
  // Browsers send Origin on cross-site POST/PATCH/DELETE; if the origin is present
  // it must match CORS_ALLOWED_ORIGINS. SameSite=Lax is the primary defense; this is
  // fail-closed hardening for non-GET requests.
  const allowedOrigins = opts.corsAllowedOrigins ?? parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const unsafeMethods = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);
  if (allowedOrigins && Array.isArray(allowedOrigins) && allowedOrigins.length > 0) {
    app.addHook('onRequest', async (req, reply) => {
      if (!unsafeMethods.has(req.method)) return;
      // Webhook edge is server-to-server and exempt from the CORS/CSRF lock.
      if (req.url.startsWith('/v1/webhooks/whatsapp')) return;
      const origin = req.headers.origin;
      const referer = req.headers.referer;
      const value = origin ?? referer;
      if (!value) return;
      if (!isOriginAllowed(value, allowedOrigins)) {
        void reply.code(403).send(errorEnvelope('FORBIDDEN', 'Cross-site request rejected'));
        return reply;
      }
    });
  }

  void app.register(healthRoutes);
  void app.register(authRoutes, { prefix: '' });
  void app.register(businessRoutes, { prefix: '' });
  void app.register(adminRoutes, { prefix: '' });
  void app.register(leadsRoutes, { prefix: '' });
  void app.register(commerceRoutes, { prefix: '' });
  void app.register(whatsappWebhookRoutes, { prefix: '' });
  void app.register(whatsappRoutes, { prefix: '' });

  // Start the inbound outbox drainer unless explicitly disabled or in tests.
  if (process.env.NODE_ENV !== 'test' && process.env.WHATSAPP_DRAINER_DISABLED !== 'true') {
    startWhatsAppDrainer(app);
  }

  app.addHook('onClose', async () => {
    stopWhatsAppDrainer(app);
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send(errorEnvelope('NOT_FOUND', 'Route not found'));
  });

  app.setErrorHandler((err, _req, reply) => {
    Sentry.captureException(err);

    if (err instanceof AppError) {
      reply.code(err.statusCode).send(errorEnvelope(err.code, err.message, err.details));
      return;
    }

    const validation = (err as { validation?: unknown }).validation;
    if (validation) {
      reply.code(400).send(
        errorEnvelope('VALIDATION_ERROR', (err as Error).message, validation),
      );
      return;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        reply.code(409).send(
          errorEnvelope('CONFLICT', 'Resource already exists or violates a uniqueness constraint'),
        );
        return;
      }
      if (err.code === 'P2025') {
        reply.code(404).send(errorEnvelope('NOT_FOUND', 'Record not found'));
        return;
      }
      if (err.code === 'P2003') {
        reply.code(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid reference'));
        return;
      }
    }

    reply.code(500).send(errorEnvelope('INTERNAL_ERROR', 'Internal server error'));
  });

  return app;
}

function parseCorsOrigins(raw?: string): boolean | Array<string | RegExp> {
  if (!raw) return false;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return false;
  return list.map((origin) => {
    if (origin.includes('*')) {
      // Fastify cors supports RegExp for wildcard origins.
      return new RegExp(
        '^' +
          origin
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*') +
          '$',
      );
    }
    return origin;
  });
}

function isOriginAllowed(value: string, allowed: Array<string | RegExp>): boolean {
  try {
    const url = new URL(value);
    const origin = `${url.protocol}//${url.host}`;
    return allowed.some((a) => (typeof a === 'string' ? a === origin : a.test(origin)));
  } catch {
    return allowed.some((a) => (typeof a === 'string' ? a === value : a.test(value)));
  }
}
