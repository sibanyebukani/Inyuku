import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '../../db.js';
import {
  createTestBusiness,
} from '../../test-helpers.js';
import {
  processInboundEvent,
  markInboundEventFailed,
  MAX_RETRY_ATTEMPTS,
} from '../whatsapp-ingest.service.js';
import { claimPendingRows } from '../whatsapp-drainer.js';
import * as rateLimit from '../../utils/rate-limit.js';

let businessId: string;
let channelId: string;
let conversationId: string;

function sampleInboundPayload(phoneNumberId: string, messageId: string, from = '27821234567') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '+27821234567' },
              contacts: [{ wa_id: from, profile: { name: 'Test Customer' } }],
              messages: [
                {
                  id: messageId,
                  from,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Hello from test' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function sampleStatusPayload(phoneNumberId: string, messageId: string, status: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId, display_phone_number: '+27821234567' },
              statuses: [{ id: messageId, status, timestamp: String(Math.floor(Date.now() / 1000)) }],
            },
          },
        ],
      },
    ],
  };
}

describe('whatsapp ingest service', () => {
  beforeAll(async () => {
    const business = await createTestBusiness({ name: 'WhatsApp Ingest Test Biz' });
    businessId = business.id;
    await prisma.whatsAppInboundEvent.deleteMany({
      where: { OR: [{ businessId }, { businessId: null }] },
    });
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.conversation.deleteMany({ where: { businessId } });
    await prisma.whatsAppChannel.deleteMany({ where: { businessId } });
    const channel = await prisma.whatsAppChannel.create({
      data: {
        businessId,
        phoneNumberId: 'phone-id-ingest',
        displayPhoneNumber: '+27821234567',
        mode: 'SANDBOX',
        enabled: false,
      },
    });
    channelId = channel.id;
    const conversation = await prisma.conversation.create({
      data: {
        businessId,
        channelId,
        waContactId: '27821234567',
        status: 'OPEN',
      },
    });
    conversationId = conversation.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.conversation.deleteMany({ where: { businessId } });
    await prisma.whatsAppInboundEvent.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    // Recreate the base conversation for status tests.
    const existing = await prisma.conversation.findUnique({
      where: { businessId_channelId_waContactId: { businessId, channelId, waContactId: '27821234567' } },
    });
    if (!existing) {
      const c = await prisma.conversation.create({
        data: { businessId, channelId, waContactId: '27821234567', status: 'OPEN' },
      });
      conversationId = c.id;
    } else {
      conversationId = existing.id;
    }
  });

  afterAll(async () => {
    await prisma.whatsAppChannel.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it('mapped channel → upserts conversation (lastInboundAt set) + persists Message RECEIVED', async () => {
    const payload = sampleInboundPayload('phone-id-ingest', 'wamid.mapped');
    const event = await prisma.whatsAppInboundEvent.create({
      data: {
        providerEventId: 'evt-mapped',
        phoneNumberId: 'phone-id-ingest',
        rawPayload: payload,
        signatureVerified: true,
        status: 'PENDING',
      },
    });

    const result = await processInboundEvent(event.id, payload, 'phone-id-ingest');

    expect(result.status).toBe('PROCESSED');
    expect(result.businessId).toBe(businessId);

    const conversation = await prisma.conversation.findUnique({
      where: { businessId_channelId_waContactId: { businessId, channelId, waContactId: '27821234567' } },
    });
    expect(conversation).not.toBeNull();
    expect(conversation!.lastInboundAt).not.toBeNull();

    const messages = await prisma.message.findMany({ where: { businessId } });
    expect(messages).toHaveLength(1);
    expect(messages[0].providerMessageId).toBe('wamid.mapped');
    expect(messages[0].status).toBe('RECEIVED');
    expect(messages[0].direction).toBe('INBOUND');

    const audits = await prisma.auditLog.findMany({ where: { entity: 'whatsapp_message', action: 'RECEIVE' } });
    expect(audits).toHaveLength(1);
  });

  it('unmapped phoneNumberId → UNROUTED + audited, no conversation/message', async () => {
    const payload = sampleInboundPayload('phone-id-unknown', 'wamid.unmapped');
    const event = await prisma.whatsAppInboundEvent.create({
      data: {
        providerEventId: 'evt-unmapped',
        phoneNumberId: 'phone-id-unknown',
        rawPayload: payload,
        signatureVerified: true,
        status: 'PENDING',
      },
    });

    const result = await processInboundEvent(event.id, payload, 'phone-id-unknown');

    expect(result.status).toBe('UNROUTED');
    const messages = await prisma.message.findMany({ where: { businessId } });
    expect(messages).toHaveLength(0);
    const audits = await prisma.auditLog.findMany({ where: { entity: 'whatsapp_webhook', action: 'UNROUTED' } });
    expect(audits).toHaveLength(1);
  });

  it('duplicate providerMessageId → single Message', async () => {
    const payload = sampleInboundPayload('phone-id-ingest', 'wamid.duplicate-msg');
    const event1 = await prisma.whatsAppInboundEvent.create({
      data: { providerEventId: 'evt-dup-1', phoneNumberId: 'phone-id-ingest', rawPayload: payload, signatureVerified: true, status: 'PENDING' },
    });
    const event2 = await prisma.whatsAppInboundEvent.create({
      data: { providerEventId: 'evt-dup-2', phoneNumberId: 'phone-id-ingest', rawPayload: payload, signatureVerified: true, status: 'PENDING' },
    });

    await processInboundEvent(event1.id, payload, 'phone-id-ingest');
    await processInboundEvent(event2.id, payload, 'phone-id-ingest');

    const messages = await prisma.message.findMany({ where: { providerMessageId: 'wamid.duplicate-msg' } });
    expect(messages).toHaveLength(1);
  });

  it('status callback advances Message.status', async () => {
    await prisma.message.create({
      data: {
        businessId,
        conversationId,
        providerMessageId: 'wamid.status-outbound',
        direction: 'OUTBOUND',
        type: 'TEXT',
        body: 'Outbound',
        status: 'SENT',
        occurredAt: new Date(),
      },
    });

    const payload = sampleStatusPayload('phone-id-ingest', 'wamid.status-outbound', 'delivered');
    const event = await prisma.whatsAppInboundEvent.create({
      data: { providerEventId: 'evt-status', phoneNumberId: 'phone-id-ingest', rawPayload: payload, signatureVerified: true, status: 'PENDING' },
    });

    await processInboundEvent(event.id, payload, 'phone-id-ingest');

    const message = await prisma.message.findUnique({
      where: { businessId_providerMessageId: { businessId, providerMessageId: 'wamid.status-outbound' } },
    });
    expect(message?.status).toBe('DELIVERED');
  });

  it('bounded retry: failed rows are retried then marked FAILED', async () => {
    const event = await prisma.whatsAppInboundEvent.create({
      data: { providerEventId: 'evt-retry', phoneNumberId: 'phone-id-ingest', rawPayload: {}, signatureVerified: true, status: 'PENDING' },
    });

    for (let i = 1; i <= MAX_RETRY_ATTEMPTS; i += 1) {
      await markInboundEventFailed(event.id, i, 'boom');
      const row = await prisma.whatsAppInboundEvent.findUnique({ where: { id: event.id } });
      expect(row?.attempts).toBe(i);
      expect(row?.lastError).toBe('boom');
      expect(row?.status).toBe(i >= MAX_RETRY_ATTEMPTS ? 'FAILED' : 'PENDING');
    }
  });

  it('processing error is surfaced and can be retried', async () => {
    vi.spyOn(rateLimit, 'checkRateLimit').mockRejectedValue(new Error('rate-limit-service-down'));

    const payload = sampleInboundPayload('phone-id-ingest', 'wamid.error');
    const event = await prisma.whatsAppInboundEvent.create({
      data: { providerEventId: 'evt-error', phoneNumberId: 'phone-id-ingest', rawPayload: payload, signatureVerified: true, status: 'PENDING' },
    });

    await expect(processInboundEvent(event.id, payload, 'phone-id-ingest')).rejects.toThrow(
      'rate-limit-service-down',
    );
  });

  it('concurrent claim respects SKIP LOCKED (second worker skips locked row)', async () => {
    const payload = sampleInboundPayload('phone-id-ingest', 'wamid.skip-locked');
    const event = await prisma.whatsAppInboundEvent.create({
      data: { providerEventId: 'evt-skip-locked', phoneNumberId: 'phone-id-ingest', rawPayload: payload, signatureVerified: true, status: 'PENDING' },
    });

    await prisma.$transaction(async (tx) => {
      // Lock the row in this transaction.
      await tx.$queryRaw`SELECT id FROM whatsapp_inbound_events WHERE id = ${event.id} FOR UPDATE`;
      // A concurrent SKIP LOCKED claim must see zero rows.
      const claimed = await claimPendingRows(10);
      expect(claimed.some((r) => r.id === event.id)).toBe(false);
    });
  });
});
