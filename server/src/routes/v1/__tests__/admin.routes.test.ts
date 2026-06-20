import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../db.js';
import {
  createTestUser,
  createTestMembership,
  mintAccessToken,
  cleanupTestUsers,
} from '../../../test-helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await cleanupTestUsers(['admin@inyuku.test', 'merchant@inyuku.test']);
  await prisma.lead.deleteMany({ where: { email: 'admin-lead@inyuku.test' } });
});

describe('admin routes', () => {
  it('admin can list leads; merchant owner cannot', async () => {
    const admin = await createTestUser({ email: 'admin@inyuku.test' });
    await createTestMembership({
      userId: admin.id,
      businessId: 'platform',
      role: 'ADMIN',
    });
    const merchant = await createTestUser({ email: 'merchant@inyuku.test' });
    await createTestMembership({
      userId: merchant.id,
      businessId: 'platform',
      role: 'MERCHANT_OWNER',
    });

    await prisma.lead.create({
      data: {
        source: 'CONTACT',
        email: 'admin-lead@inyuku.test',
        name: 'Admin Lead',
        message: 'Hello',
      },
    });

    const adminToken = await mintAccessToken({
      userId: admin.id,
      email: admin.email,
      memberships: [{ businessId: 'platform', role: 'ADMIN', permissions: [] }],
    });
    const merchantToken = await mintAccessToken({
      userId: merchant.id,
      email: merchant.email,
      memberships: [{ businessId: 'platform', role: 'MERCHANT_OWNER', permissions: [] }],
    });

    const adminGet = await app.inject({
      method: 'GET',
      url: '/v1/admin/leads',
      cookies: { inyuku_at: adminToken },
    });
    expect(adminGet.statusCode).toBe(200);
    expect(adminGet.json().data.rows.length).toBeGreaterThan(0);

    const merchantGet = await app.inject({
      method: 'GET',
      url: '/v1/admin/leads',
      cookies: { inyuku_at: merchantToken },
    });
    expect(merchantGet.statusCode).toBe(403);
  });
});
