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
    await prisma.conversation.deleteMany({ where: { businessId: bizA.id } });
    await prisma.customer.deleteMany({ where: { businessId: bizA.id } });
    await prisma.whatsAppChannel.deleteMany({ where: { businessId: bizA.id } });
    await prisma.conversation.deleteMany({ where: { businessId: bizB.id } });
    await prisma.customer.deleteMany({ where: { businessId: bizB.id } });
    await prisma.whatsAppChannel.deleteMany({ where: { businessId: bizB.id } });
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

describe('createOrder customer link/create from conversation (§5.2)', () => {
  let bizA: { id: string };
  let productA: { id: string };

  beforeAll(async () => {
    bizA = await createTestBusiness({ name: 'Order Svc Biz A — Customer Link' });
    productA = await prisma.product.create({
      data: { businessId: bizA.id, clientId: `p2-${Date.now()}`, name: 'Widget', sellPriceCents: 5000, status: 'ACTIVE' },
    });
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId: bizA.id } });
    await prisma.orderLine.deleteMany({ where: { businessId: bizA.id } });
    await prisma.order.deleteMany({ where: { businessId: bizA.id } });
    await prisma.conversation.deleteMany({ where: { businessId: bizA.id } });
    await prisma.customer.deleteMany({ where: { businessId: bizA.id } });
    await prisma.whatsAppChannel.deleteMany({ where: { businessId: bizA.id } });
  });

  it('reuses an already-linked conversation customer', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizA.id, phoneNumberId: `pnl-${Date.now()}`, displayPhoneNumber: '+27820002222', mode: 'SANDBOX', enabled: false } as any,
    });
    const existing = await prisma.customer.create({
      data: { businessId: bizA.id, clientId: `cl-${Date.now()}`, name: 'Linked', phone: '+27820002222' },
    });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '27820002222', customerId: existing.id },
    });
    const { order } = await createOrder({
      businessId: bizA.id, clientId: `o-${Date.now()}`, channel: 'WHATSAPP', conversationId: conv.id,
      lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.customerId).toBe(existing.id);
  });

  it('creates a masked-name customer and back-links the conversation', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizA.id, phoneNumberId: `pnc-${Date.now()}`, displayPhoneNumber: '+27821239999', mode: 'SANDBOX', enabled: false } as any,
    });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '27821239999' },
    });
    const { order } = await createOrder({
      businessId: bizA.id, clientId: `o-${Date.now()}`, channel: 'WHATSAPP', conversationId: conv.id,
      lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.customerId).toBeTruthy();
    const cust = await prisma.customer.findUnique({ where: { id: order.customerId! } });
    expect(cust!.name).toBe('WhatsApp +27•••••9999');
    expect(cust!.consentId).toBeNull();
    expect(cust!.clientId).toBe(`wa:${conv.id}`);
    const reloaded = await prisma.conversation.findUnique({ where: { id: conv.id } });
    expect(reloaded!.customerId).toBe(order.customerId);
  });

  it('does not link a customer when no conversationId is supplied', async () => {
    const { order } = await createOrder({
      businessId: bizA.id, clientId: `o-${Date.now()}`, lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.customerId).toBeNull();
  });

  it('is idempotent when two captures race for the same fresh conversation and stores normalised phone', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizA.id, phoneNumberId: `pn-race-${Date.now()}`, displayPhoneNumber: '+27820004444', mode: 'SANDBOX', enabled: false } as any,
    });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '0820004444' },
    });

    const [first, second] = await Promise.all([
      createOrder({
        businessId: bizA.id, clientId: `race-1-${Date.now()}`, channel: 'WHATSAPP', conversationId: conv.id,
        lines: [{ productId: productA.id, qty: 1 }],
      }),
      createOrder({
        businessId: bizA.id, clientId: `race-2-${Date.now()}`, channel: 'WHATSAPP', conversationId: conv.id,
        lines: [{ productId: productA.id, qty: 1 }],
      }),
    ]);

    const customers = await prisma.customer.findMany({ where: { businessId: bizA.id, clientId: `wa:${conv.id}` } });
    expect(customers).toHaveLength(1);
    expect(first.order.customerId).toBe(customers[0].id);
    expect(second.order.customerId).toBe(customers[0].id);
    expect(customers[0].phone).toBe('+27820004444');
  });
});
