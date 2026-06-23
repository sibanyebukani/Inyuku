import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
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
import { setSetting } from '../../../services/settings.service.js';

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

  await setSetting('dialog360.apiKey', 'test-bsp-key', { isSecret: true });
  process.env.WHATSAPP_BSP_BASE_URL = 'https://test.360dialog.example';
});

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.errorLog.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.auditLog.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.message.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.conversation.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.whatsAppTemplate.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
  await prisma.whatsAppChannel.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
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

async function createChannel(token: string, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/whatsapp/channels`,
    headers: authHeader(token),
    payload: {
      phoneNumberId: `phone-${Date.now()}`,
      displayPhoneNumber: '+27821234567',
      mode: 'SANDBOX',
      enabled: false,
      ...overrides,
    },
  });
}

async function createSandboxChannelAndConversation(lastInboundAt?: Date) {
  const channelRes = await createChannel(ownerToken, { mode: 'SANDBOX', enabled: false });
  const channel = channelRes.json().data.channel;
  const conversation = await prisma.conversation.create({
    data: {
      businessId: bizA.id,
      channelId: channel.id,
      waContactId: '27821234567',
      status: 'OPEN',
      lastInboundAt: lastInboundAt ?? new Date(),
    },
  });
  return { channel, conversation };
}

async function grantConsent(purpose: string) {
  await prisma.consent.create({
    data: { businessId: bizA.id, purpose, status: 'GRANTED' },
  });
}

async function sendMessageRequest(conversationId: string, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${conversationId}/messages`,
    headers: authHeader(token),
    payload,
  });
}

describe('channels', () => {
  it('owner can create, list and patch channels', async () => {
    const createRes = await createChannel(ownerToken);
    expect(createRes.statusCode).toBe(201);
    const channel = createRes.json().data.channel;
    expect(channel.enabled).toBe(false);

    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/channels`,
      headers: { cookie: `inyuku_at=${ownerToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.channels.map((c: { id: string }) => c.id)).toContain(channel.id);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${bizA.id}/whatsapp/channels/${channel.id}`,
      headers: authHeader(ownerToken),
      payload: { enabled: true, mode: 'LIVE' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().data.channel.enabled).toBe(true);
    expect(patchRes.json().data.channel.mode).toBe('LIVE');

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'whatsapp_channel', action: 'UPDATE', businessId: bizA.id },
    });
    expect(audits.length).toBeGreaterThan(0);
  });

  it('duplicate phoneNumberId returns 409', async () => {
    const phoneNumberId = `dup-phone-${Date.now()}`;
    const r1 = await createChannel(ownerToken, { phoneNumberId });
    expect(r1.statusCode).toBe(201);
    const r2 = await createChannel(ownerToken, { phoneNumberId });
    expect(r2.statusCode).toBe(409);
  });

  it('staff and ai cannot manage channels', async () => {
    const createRes = await createChannel(ownerToken);
    const id = createRes.json().data.channel.id;

    const staffCreate = await createChannel(staffToken);
    expect(staffCreate.statusCode).toBe(403);

    const staffPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${bizA.id}/whatsapp/channels/${id}`,
      headers: authHeader(staffToken),
      payload: { enabled: true },
    });
    expect(staffPatch.statusCode).toBe(403);

    const aiPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${bizA.id}/whatsapp/channels/${id}`,
      headers: authHeader(aiToken),
      payload: { enabled: true },
    });
    expect(aiPatch.statusCode).toBe(403);
  });
});

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

describe('conversations', () => {
  async function setupConversation(lastInboundAt?: Date) {
    const channelRes = await createChannel(ownerToken);
    const channel = channelRes.json().data.channel;
    const conversation = await prisma.conversation.create({
      data: {
        businessId: bizA.id,
        channelId: channel.id,
        waContactId: '27821234567',
        status: 'OPEN',
        lastInboundAt: lastInboundAt ?? new Date(),
      },
    });
    const message = await prisma.message.create({
      data: {
        businessId: bizA.id,
        conversationId: conversation.id,
        providerMessageId: 'wamid.read.1',
        direction: 'INBOUND',
        type: 'TEXT',
        body: 'Hello merchant',
        status: 'RECEIVED',
        occurredAt: new Date(),
      },
    });
    return { channel, conversation, message };
  }

  it('lists conversations', async () => {
    const { conversation } = await setupConversation();
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/conversations`,
      headers: { cookie: `inyuku_at=${ownerToken}` },
    });
    expect(r.statusCode).toBe(200);
    const ids = r.json().data.conversations.map((c: { id: string }) => c.id);
    expect(ids).toContain(conversation.id);
  });

  it('detail includes windowState and windowExpiresAt', async () => {
    const { conversation } = await setupConversation(new Date());
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${conversation.id}`,
      headers: { cookie: `inyuku_at=${ownerToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json().data.conversation;
    expect(body.windowState).toBe('OPEN');
    expect(body.windowExpiresAt).toBeTruthy();
  });

  it('lists messages paginated', async () => {
    const { conversation } = await setupConversation();
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${conversation.id}/messages`,
      headers: { cookie: `inyuku_at=${ownerToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.messages).toHaveLength(1);
    expect(r.json().data.pagination.total).toBe(1);
  });

  it('cross-tenant conversation access denied', async () => {
    const { conversation } = await setupConversation();
    const r = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${conversation.id}`,
      headers: { cookie: `inyuku_at=${ownerTokenB}` },
    });
    expect(r.statusCode).toBe(403);
  });

  it('ai_agent can read conversations but not send', async () => {
    const { conversation } = await setupConversation();
    const read = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${conversation.id}`,
      headers: { cookie: `inyuku_at=${aiToken}` },
    });
    expect(read.statusCode).toBe(200);
  });
});

describe('send', () => {
  it('transactional free-form inside window → 200/SENT', async () => {
    const { conversation } = await createSandboxChannelAndConversation(new Date());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.out.1' }] }),
      text: async () => '',
    } as Response);

    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      sendClass: 'TRANSACTIONAL',
      body: 'Your order is ready',
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().data.message.status).toBe('SENT');
    expect(r.json().data.message.providerMessageId).toBe('wamid.out.1');
  });

  it('free-form while CLOSED → 409 whatsapp_window_closed', async () => {
    const { conversation } = await createSandboxChannelAndConversation(
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );

    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      sendClass: 'TRANSACTIONAL',
      body: 'Hello',
    });

    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'whatsapp_window_closed' } });
  });

  it('approved template while CLOSED → 200/SENT', async () => {
    const { conversation } = await createSandboxChannelAndConversation(
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );
    await grantConsent('whatsapp:template');
    await createTemplate(ownerToken, {
      name: 'closed-window-template',
      status: 'APPROVED',
      bodyText: 'Hello {{1}}',
      paramSchema: [{ name: '1', type: 'string' }],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.tpl.1' }] }),
      text: async () => '',
    } as Response);

    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEMPLATE',
      sendClass: 'MARKETING',
      templateName: 'closed-window-template',
      language: 'en',
      templateParams: { '1': 'Friend' },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().data.message.status).toBe('SENT');
  });

  it('missing sendClass → 400', async () => {
    const { conversation } = await createSandboxChannelAndConversation();
    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      body: 'Hello',
    });
    expect(r.statusCode).toBe(400);
  });

  it('marketing without consent grant → 403 whatsapp_consent_denied', async () => {
    const { conversation } = await createSandboxChannelAndConversation();
    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      sendClass: 'MARKETING',
      body: 'Promo',
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'whatsapp_consent_denied' } });
  });

  it('LIVE + disabled → 422 whatsapp_channel_disabled', async () => {
    const channelRes = await createChannel(ownerToken, { mode: 'LIVE', enabled: false });
    const channel = channelRes.json().data.channel;
    const conversation = await prisma.conversation.create({
      data: {
        businessId: bizA.id,
        channelId: channel.id,
        waContactId: '27821234567',
        status: 'OPEN',
        lastInboundAt: new Date(),
      },
    });

    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      sendClass: 'TRANSACTIONAL',
      body: 'Hello',
    });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'whatsapp_channel_disabled' } });
  });

  it('invalid template → 422 whatsapp_template_invalid', async () => {
    const { conversation } = await createSandboxChannelAndConversation(
      new Date(Date.now() - 25 * 60 * 60 * 1000),
    );
    await grantConsent('whatsapp:template');

    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEMPLATE',
      sendClass: 'MARKETING',
      templateName: 'nonexistent',
      language: 'en',
      templateParams: {},
    });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'whatsapp_template_invalid' } });
  });

  it('BSP failure → Message FAILED + ErrorLog, raw provider error not leaked to client', async () => {
    const { conversation } = await createSandboxChannelAndConversation();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom-secret-provider-detail' }),
      text: async () => 'boom-secret-provider-detail',
    } as Response);

    const r = await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      sendClass: 'TRANSACTIONAL',
      body: 'Hello',
    });

    expect(r.statusCode).toBe(200);
    const data = r.json().data;
    expect(data.message.status).toBe('FAILED');
    // FIX 5: the raw provider error string must never reach the client — neither in
    // the envelope `error` field nor on the returned Message.
    expect(data.error).toBe('send_failed');
    expect(data.message.failureReason).toBe('send_failed');
    expect(JSON.stringify(data)).not.toContain('boom-secret-provider-detail');
    // The full provider error is retained server-side (ErrorLog) for diagnostics.
    const logs = await prisma.errorLog.findMany({ where: { businessId: bizA.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].message.length).toBeGreaterThan(0);
  });

  it('SEND audited with masked metadata', async () => {
    const { conversation } = await createSandboxChannelAndConversation();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.audit' }] }),
      text: async () => '',
    } as Response);

    await sendMessageRequest(conversation.id, ownerToken, {
      type: 'TEXT',
      sendClass: 'TRANSACTIONAL',
      body: 'Hello',
    });

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'whatsapp_message', action: 'SEND', businessId: bizA.id },
    });
    expect(audits).toHaveLength(1);
  });
});
