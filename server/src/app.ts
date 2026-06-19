import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Prisma } from '@prisma/client';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AppError } from './utils/errors.js';
import { errorEnvelope } from './utils/route-helpers.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/v1/auth.routes.js';
import authMiddleware from './middleware/auth.middleware.js';
import permissionGuard from './middleware/require-permission.js';

export interface BuildAppOptions {
  corsAllowedOrigins?: string[];
}

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const usePretty = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
  const app = Fastify({
    logger: usePretty
      ? { level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } }
      : { level: process.env.LOG_LEVEL ?? 'info' },
    disableRequestLogging: false,
    trustProxy: true,
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

  void app.register(healthRoutes);
  void app.register(authRoutes, { prefix: '' });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send(errorEnvelope('NOT_FOUND', 'Route not found'));
  });

  app.setErrorHandler((err, _req, reply) => {
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
