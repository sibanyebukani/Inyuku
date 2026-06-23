import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../db.js';
import { applySyncOp } from '../sync.service.js';
import { createTestBusiness } from '../../test-helpers.js';
import type { Membership } from '@prisma/client';

describe('applySyncOp order-create validation (Condition 8 / finding #4)', () => {
  let bizA: { id: string };
  let productA: { id: string };
  const ownerMembership = { role: 'MERCHANT_OWNER', permissions: [] } as unknown as Membership;

  beforeAll(async () => {
    bizA = await createTestBusiness({ name: 'Sync Biz A' });
    productA = await prisma.product.create({
      data: { businessId: bizA.id, clientId: `p-sync-${Date.now()}`, name: 'Widget', sellPriceCents: 5000, status: 'ACTIVE' },
    });
  });

  it('rejects a malformed order payload without failing the batch', async () => {
    const res = await applySyncOp(
      { clientId: `bad-${Date.now()}`, entity: 'order', op: 'create', occurredAt: new Date().toISOString(), payload: { lines: 'not-an-array' } as any },
      bizA.id,
      ownerMembership,
    );
    expect(res.status).toBe('REJECTED');
    expect(res.error).toBe('VALIDATION');
  });

  it('applies a valid WHATSAPP order via sync with conversationId', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizA.id, phoneNumberId: `pn-sync-${Date.now()}`, displayPhoneNumber: '+27826660000', mode: 'SANDBOX', enabled: false } as any,
    });
    const conv = await prisma.conversation.create({ data: { businessId: bizA.id, channelId: channel.id, waContactId: '27826660000' } });
    const res = await applySyncOp(
      {
        clientId: `ok-${Date.now()}`,
        entity: 'order',
        op: 'create',
        occurredAt: new Date().toISOString(),
        payload: { channel: 'WHATSAPP', conversationId: conv.id, status: 'COMPLETED', lines: [{ productId: productA.id, qty: 1 }] },
      },
      bizA.id,
      ownerMembership,
    );
    expect(res.status).toBe('APPLIED');
    const order = await prisma.order.findUnique({ where: { businessId_clientId: { businessId: bizA.id, clientId: res.clientId } } });
    expect(order!.conversationId).toBe(conv.id);
  });
});
