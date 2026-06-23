import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../db.js';
import { createTestBusiness } from '../test-helpers.js';
import { createOrder } from '../services/order.service.js';

describe('Condition 9: WhatsApp capture is idempotent on replay', () => {
  let biz: { id: string };
  let product: { id: string };
  let conv: any;

  beforeAll(async () => {
    biz = await createTestBusiness({ name: 'Replay Biz' });
    product = await prisma.product.create({ data: { businessId: biz.id, clientId: `p-${Date.now()}`, name: 'Bread', sellPriceCents: 1800, status: 'ACTIVE' } });
    const channel = await prisma.whatsAppChannel.create({ data: { businessId: biz.id, phoneNumberId: `pn-replay-${Date.now()}`, displayPhoneNumber: '+27828880000', mode: 'SANDBOX', enabled: false } });
    conv = await prisma.conversation.create({ data: { businessId: biz.id, channelId: channel.id, waContactId: '27828880000' } });
  });

  it('redelivered capture -> exactly one Order, one set of SALE movements', async () => {
    const clientId = `replay-${Date.now()}`;
    const args = { businessId: biz.id, clientId, channel: 'WHATSAPP' as const, conversationId: conv.id, status: 'COMPLETED' as const, lines: [{ productId: product.id, qty: 2 }] };

    const first = await createOrder(args);
    const second = await createOrder(args); // replay

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.order.id).toBe(first.order.id);

    const orders = await prisma.order.findMany({ where: { businessId: biz.id, clientId } });
    expect(orders).toHaveLength(1);

    const sales = await prisma.stockMovement.findMany({ where: { businessId: biz.id, orderId: first.order.id, type: 'SALE' } });
    expect(sales).toHaveLength(1); // one line -> one SALE movement
    expect(sales[0].qtyDelta).toBe(-2);

    // exactly one customer auto-created (deterministic clientId wa:<conversationId>)
    const customers = await prisma.customer.findMany({ where: { businessId: biz.id, clientId: `wa:${conv.id}` } });
    expect(customers).toHaveLength(1);
  });
});
