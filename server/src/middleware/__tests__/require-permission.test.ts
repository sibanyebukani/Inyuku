import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import {
  createTestUser,
  createTestBusiness,
  createTestMembership,
  mintAccessToken,
  cleanupTestUsers,
  cleanupTestBusinesses,
} from '../../test-helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  app.register(async (app) => {
    app.get('/__test/businesses/:businessId', {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'business:read' })],
    }, async (req) => {
      return { ok: true, businessId: req.params.businessId, membership: req.membership?.id };
    });
    app.patch('/__test/businesses/:businessId', {
      preHandler: [app.authenticate, app.requirePermission({ permission: 'business:update' })],
    }, async () => ({ ok: true }));
  });
  await app.ready();
});

afterEach(async () => {
  await cleanupTestUsers([
    'owner-a@inyuku.test',
    'owner-b@inyuku.test',
    'staff-a@inyuku.test',
  ]);
  await cleanupTestBusinesses(['Business A', 'Business B']);
});

describe('requirePermission + tenant isolation', () => {
  it('allows owner to read their own business', async () => {
    const user = await createTestUser({ email: 'owner-a@inyuku.test' });
    const business = await createTestBusiness({ name: 'Business A' });
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
    const user = await createTestUser({ email: 'owner-a@inyuku.test' });
    const businessA = await createTestBusiness({ name: 'Business A' });
    const businessB = await createTestBusiness({ name: 'Business B' });
    await createTestMembership({ userId: user.id, businessId: businessA.id, role: 'MERCHANT_OWNER' });
    await createTestMembership({
      userId: (await createTestUser({ email: 'owner-b@inyuku.test' })).id,
      businessId: businessB.id,
      role: 'MERCHANT_OWNER',
    });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: businessA.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'GET',
      url: `/__test/businesses/${businessB.id}`,
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('returns 403 when staff lacks permission', async () => {
    const user = await createTestUser({ email: 'staff-a@inyuku.test' });
    const business = await createTestBusiness({ name: 'Business A' });
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
