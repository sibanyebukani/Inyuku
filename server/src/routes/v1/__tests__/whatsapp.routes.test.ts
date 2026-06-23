import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../db.js';
import {
  createTestUser,
  createTestBusiness,
  createTestMembership,
  mintAccessToken,
  cleanupTestUsers,
  cleanupTestBusinesses,
} from '../../../test-helpers.js';
import whatsappRoutes from '../whatsapp.routes.js';

let app: FastifyInstance;
let ownerUser: Awaited<ReturnType<typeof createTestUser>>;
let staffUser: Awaited<ReturnType<typeof createTestUser>>;
let aiUser: Awaited<ReturnType<typeof createTestUser>>;
let ownerUserB: Awaited<ReturnType<typeof createTestUser>>;
let bizA: Awaited<ReturnType<typeof createTestBusiness>>;
let bizB: Awaited<ReturnType<typeof createTestBusiness>>;
let ownerToken: string;
let staffToken: string;
let aiToken: string;
let ownerTokenB: string;

beforeAll(async () => {
  app = buildApp();
  await app.register(whatsappRoutes);
  await app.ready();

  await cleanupTestUsers([
    'whatsapp-owner@inyuku.test',
    'whatsapp-staff@inyuku.test',
    'whatsapp-ai@inyuku.test',
    'whatsapp-owner-b@inyuku.test',
  ]);
  await cleanupTestBusinesses(['WhatsApp Test Biz A', 'WhatsApp Test Biz B']);

  ownerUser = await createTestUser({ email: 'whatsapp-owner@inyuku.test' });
  staffUser = await createTestUser({ email: 'whatsapp-staff@inyuku.test' });
  aiUser = await createTestUser({ email: 'whatsapp-ai@inyuku.test' });
  ownerUserB = await createTestUser({ email: 'whatsapp-owner-b@inyuku.test' });

  bizA = await createTestBusiness({ name: 'WhatsApp Test Biz A' });
  bizB = await createTestBusiness({ name: 'WhatsApp Test Biz B' });

  await createTestMembership({ userId: ownerUser.id, businessId: bizA.id, role: 'MERCHANT_OWNER' });
  await createTestMembership({ userId: staffUser.id, businessId: bizA.id, role: 'MERCHANT_STAFF' });
  await createTestMembership({ userId: aiUser.id, businessId: bizA.id, role: 'AI_AGENT' });
  await createTestMembership({ userId: ownerUserB.id, businessId: bizB.id, role: 'MERCHANT_OWNER' });

  ownerToken = await mintAccessToken({
    userId: ownerUser.id,
    email: ownerUser.email,
    memberships: [{ businessId: bizA.id, role: 'MERCHANT_OWNER', permissions: [] }],
  });
  staffToken = await mintAccessToken({
    userId: staffUser.id,
    email: staffUser.email,
    memberships: [{ businessId: bizA.id, role: 'MERCHANT_STAFF', permissions: [] }],
  });
  aiToken = await mintAccessToken({
    userId: aiUser.id,
    email: aiUser.email,
    memberships: [{ businessId: bizA.id, role: 'AI_AGENT', permissions: [] }],
  });
  ownerTokenB = await mintAccessToken({
    userId: ownerUserB.id,
    email: ownerUserB.email,
    memberships: [{ businessId: bizB.id, role: 'MERCHANT_OWNER', permissions: [] }],
  });
});

afterEach(async () => {
  await prisma.whatsAppTemplate.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
});

function authHeader(token: string) {
  return { cookie: `inyuku_at=${token}`, 'content-type': 'application/json' };
}

async function createTemplate(token: string, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/whatsapp/templates`,
    headers: authHeader(token),
    payload: {
      name: `test-template-${Date.now()}`,
      language: 'en',
      category: 'UTILITY',
      status: 'APPROVED',
      bodyText: 'Hello {{1}}',
      paramSchema: [{ name: '1', type: 'string' }],
      ...overrides,
    },
  });
}

describe('templates', () => {
  it('owner can create and list templates', async () => {
    const createRes = await createTemplate(ownerToken, { name: `owner-create-${Date.now()}` });
    expect(createRes.statusCode).toBe(201);
    const template = createRes.json().data.template;
    expect(template.name).toContain('owner-create');

    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/templates`,
      headers: { cookie: `inyuku_at=${ownerToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.templates.map((t: { id: string }) => t.id)).toContain(template.id);
  });

  it('staff can read templates but cannot create', async () => {
    const createRes = await createTemplate(staffToken, { name: `staff-create-${Date.now()}` });
    expect(createRes.statusCode).toBe(403);

    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/templates`,
      headers: { cookie: `inyuku_at=${staffToken}` },
    });
    expect(listRes.statusCode).toBe(200);
  });

  it('ai_agent can read templates only', async () => {
    const createRes = await createTemplate(aiToken, { name: `ai-create-${Date.now()}` });
    expect(createRes.statusCode).toBe(403);

    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/templates`,
      headers: { cookie: `inyuku_at=${aiToken}` },
    });
    expect(listRes.statusCode).toBe(200);
  });

  it('duplicate name+language returns 409', async () => {
    const name = `dup-template-${Date.now()}`;
    const r1 = await createTemplate(ownerToken, { name });
    expect(r1.statusCode).toBe(201);
    const r2 = await createTemplate(ownerToken, { name });
    expect(r2.statusCode).toBe(409);
  });

  it('patch and delete templates require manage_channel', async () => {
    const createRes = await createTemplate(ownerToken, { name: `patch-del-${Date.now()}` });
    const id = createRes.json().data.template.id;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${bizA.id}/whatsapp/templates/${id}`,
      headers: authHeader(staffToken),
      payload: { status: 'DISABLED' },
    });
    expect(patchRes.statusCode).toBe(403);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/businesses/${bizA.id}/whatsapp/templates/${id}`,
      headers: { cookie: `inyuku_at=${staffToken}` },
    });
    expect(delRes.statusCode).toBe(403);
  });

  it('cross-tenant access denied', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/templates`,
      headers: { cookie: `inyuku_at=${ownerTokenB}` },
    });
    expect(r.statusCode).toBe(403);
  });
});
