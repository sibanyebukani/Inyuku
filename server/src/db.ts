import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Append a pooled connection_limit only when DATABASE_URL is present.
// When it's absent (e.g. `next build` page-data collection with no env),
// we must NOT pass `datasources: { db: { url: undefined } }` — the Prisma
// constructor rejects an explicit `undefined` url and throws at import time,
// which crashes the build before any handler ever runs. Omitting `datasources`
// lets Prisma fall back to the schema's `env("DATABASE_URL")` and defer the
// error to first query (which never happens at build time).
const pooledUrl = process.env.DATABASE_URL
  ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=5`
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    ...(pooledUrl ? { datasources: { db: { url: pooledUrl } } } : {}),
  });

globalForPrisma.prisma = prisma;
export default prisma;
