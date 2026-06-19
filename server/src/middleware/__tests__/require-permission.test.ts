import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';
import {
  createTestUser,
  createTestBusiness,
  createTestMembership,
  mintAccessToken,
} from '../../test-helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  app.register(async (app) => {
    app.get('/__test/businesses/:businessId', {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'business:read' })],
    }, async (req) => {
      return { ok: true, businessId: (req.params as { businessId: string }).businessId, membership: req.membership?.id };
    });
    app.patch('/__test/businesses/:businessId', {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'business:update' })],
    }, async () => ({ ok: true }));
  });
  await app.ready();
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'perm-' } } });
  await prisma.business.deleteMany({ where: { name: { startsWith: 'Perm ' } } });
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'perm-' } } });
  await prisma.business.deleteMany({ where: { name: { startsWith: 'Perm ' } } });
});

function makeEmails() {
  const suffix = randomUUID().slice(0, 8);
  return {
    ownerA: `perm-owner-a-${suffix}@inyuku.test`,
    ownerB: `perm-owner-b-${suffix}@inyuku.test`,
    staffA: `perm-staff-a-${suffix}@inyuku.test`,
    businessA: `Perm Business A ${suffix}`,
    businessB: `Perm Business B ${suffix}`,
  };
}

describe('requirePermission + tenant isolation', () => {
  it('allows owner to read their own business', async () => {
    const { ownerA, businessA } = makeEmails();
    const user = await createTestUser({ email: ownerA });
    const business = await createTestBusiness({ name: businessA });
    await createTestMembership({ userId: user.id, businessId: business.id, role: 'MERCHANT_OWNER' });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: business.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'GET',
      url: `/__test/businesses/${business.id}`,
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it('returns 403 for cross-tenant access', async () => {
    const { ownerA, ownerB, businessA, businessB } = makeEmails();
    const user = await createTestUser({ email: ownerA });
    const businessA_obj = await createTestBusiness({ name: businessA });
    const businessB_obj = await createTestBusiness({ name: businessB });
    await createTestMembership({ userId: user.id, businessId: businessA_obj.id, role: 'MERCHANT_OWNER' });
    await createTestMembership({
      userId: (await createTestUser({ email: ownerB })).id,
      businessId: businessB_obj.id,
      role: 'MERCHANT_OWNER',
    });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: businessA_obj.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'GET',
      url: `/__test/businesses/${businessB_obj.id}`,
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('returns 403 when staff lacks permission', async () => {
    const { staffA, businessA } = makeEmails();
    const user = await createTestUser({ email: staffA });
    const business = await createTestBusiness({ name: businessA });
    await createTestMembership({ userId: user.id, businessId: business.id, role: 'MERCHANT_STAFF' });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: business.id, role: 'MERCHANT_STAFF', permissions: [] }],
    });
    const r = await app.inject({
      method: 'PATCH',
      url: `/__test/businesses/${business.id}`,
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('returns 401 when unauthenticated', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/__test/businesses/bus_123',
    });
    expect(r.statusCode).toBe(401);
  });
});
