import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { prisma } from '../../db.js';
import { createOrder } from '../order.service.js';
import { createTestBusiness } from '../../test-helpers.js';

describe('createOrder tenant validation', () => {
  let bizA: { id: string };
  let bizB: { id: string };
  let productA: { id: string };

  beforeAll(async () => {
    bizA = await createTestBusiness({ name: 'Order Svc Biz A' });
    bizB = await createTestBusiness({ name: 'Order Svc Biz B' });
    productA = await prisma.product.create({
      data: { businessId: bizA.id, clientId: `p-${Date.now()}`, name: 'Widget', sellPriceCents: 5000, status: 'ACTIVE' },
    });
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId: bizA.id } });
    await prisma.orderLine.deleteMany({ where: { businessId: bizA.id } });
    await prisma.order.deleteMany({ where: { businessId: bizA.id } });
  });

  it('rejects a customerId from another tenant (finding #3)', async () => {
    const foreignCustomer = await prisma.customer.create({
      data: { businessId: bizB.id, clientId: `c-${Date.now()}`, name: 'Foreign' },
    });
    await expect(
      createOrder({
        businessId: bizA.id,
        clientId: `o-${Date.now()}`,
        customerId: foreignCustomer.id,
        lines: [{ productId: productA.id, qty: 1 }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects a conversationId from another tenant (Condition 1)', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizB.id, phoneNumberId: `pn-${Date.now()}`, displayPhoneNumber: '+27820000000', mode: 'SANDBOX', enabled: false } as any,
    });
    const foreignConv = await prisma.conversation.create({
      data: { businessId: bizB.id, channelId: channel.id, waContactId: '27820000000' },
    });
    await expect(
      createOrder({
        businessId: bizA.id,
        clientId: `o2-${Date.now()}`,
        conversationId: foreignConv.id,
        lines: [{ productId: productA.id, qty: 1 }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('persists conversationId on a same-tenant capture', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizA.id, phoneNumberId: `pn2-${Date.now()}`, displayPhoneNumber: '+27820001111', mode: 'SANDBOX', enabled: false } as any,
    });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '27820001111' },
    });
    const { order } = await createOrder({
      businessId: bizA.id,
      clientId: `o3-${Date.now()}`,
      channel: 'WHATSAPP',
      conversationId: conv.id,
      lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.conversationId).toBe(conv.id);
    expect(order.channel).toBe('WHATSAPP');
  });
});
