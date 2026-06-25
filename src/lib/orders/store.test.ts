// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOrderStore } from './store';
import { openDb } from '@/lib/offline/db';
import { listBatch } from '@/lib/offline/outbox';
import { makeRepo } from '@/lib/offline/repo';
import * as authMod from '@/lib/session/authFetch';
import type { OrderRow, ProductRow } from '@/lib/offline/types';

async function seedProduct(row: Partial<ProductRow> & { clientId: string }) {
  const full: ProductRow = {
    name: 'P',
    sellPriceCents: 100,
    status: 'ACTIVE',
    _syncState: 'synced',
    updatedAtLocal: '2026-06-21T10:00:00.000Z',
    ...row,
  } as ProductRow;
  await makeRepo<ProductRow>('products').put(full);
  return full;
}

describe('useOrderStore', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('orders');
    await db.clear('outbox');
    await db.clear('products');
    db.close();
    useOrderStore.setState({ items: [] });
    vi.restoreAllMocks();
  });

  it('creates a completed order offline with integer-cent totals and enqueues a create op', async () => {
    await seedProduct({ clientId: 'p1', serverId: 'srv1', name: 'Bread', sellPriceCents: 1500 });
    const clientId = await useOrderStore.getState().create({
      paymentState: 'PAID',
      status: 'COMPLETED',
      channel: 'IN_PERSON',
      lines: [
        { productId: 'srv1', nameSnapshot: 'Bread', unitPriceCents: 1500, qty: 2, lineTotalCents: 3000 },
      ],
      subtotalCents: 3000,
      totalCents: 3000,
    });

    const items = useOrderStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      clientId,
      status: 'COMPLETED',
      paymentState: 'PAID',
      channel: 'IN_PERSON',
      subtotalCents: 3000,
      totalCents: 3000,
      _syncState: 'pending',
    });
    expect(items[0].lines).toHaveLength(1);
    expect(items[0].lines[0]).toMatchObject({ productId: 'srv1', qty: 2, lineTotalCents: 3000 });

    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ clientId, entity: 'order', op: 'create' });
    expect(ops[0].payload).toMatchObject({
      status: 'COMPLETED',
      paymentState: 'PAID',
      lines: [{ productId: 'srv1', qty: 2 }],
    });
  });

  it('forwards channel + conversationId into the outbox op for a WHATSAPP capture (TASK-7)', async () => {
    await seedProduct({ clientId: 'p1', serverId: 'srv1', name: 'Bread', sellPriceCents: 1500 });
    const clientId = await useOrderStore.getState().create({
      customerId: 'cust1',
      conversationId: 'conv-9',
      paymentState: 'UNPAID',
      status: 'COMPLETED',
      channel: 'WHATSAPP',
      lines: [
        { productId: 'srv1', nameSnapshot: 'Bread', unitPriceCents: 1500, qty: 1, lineTotalCents: 1500 },
      ],
      subtotalCents: 1500,
      totalCents: 1500,
    });

    // (b) offline WHATSAPP order includes both after sync flush — the op payload
    // is what the sync flush forwards verbatim.
    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toMatchObject({
      channel: 'WHATSAPP',
      conversationId: 'conv-9',
      customerId: 'cust1',
      status: 'COMPLETED',
      paymentState: 'UNPAID',
    });

    // conversationId round-trips onto the OrderRow.
    const row = await useOrderStore.getState().get(clientId);
    expect(row?.conversationId).toBe('conv-9');
    expect(row?.channel).toBe('WHATSAPP');
  });

  it('an IN_PERSON order carries channel but no conversationId (regression)', async () => {
    await seedProduct({ clientId: 'p1', serverId: 'srv1', name: 'Bread', sellPriceCents: 1500 });
    await useOrderStore.getState().create({
      paymentState: 'PAID',
      status: 'COMPLETED',
      channel: 'IN_PERSON',
      lines: [
        { productId: 'srv1', nameSnapshot: 'Bread', unitPriceCents: 1500, qty: 1, lineTotalCents: 1500 },
      ],
      subtotalCents: 1500,
      totalCents: 1500,
    });
    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toMatchObject({ channel: 'IN_PERSON' });
    expect(ops[0].payload.conversationId).toBeUndefined();
  });

  it('loads orders sorted by occurredAt descending', async () => {
    const repo = makeRepo<OrderRow>('orders');
    await repo.put({
      clientId: 'o1',
      status: 'COMPLETED',
      channel: 'IN_PERSON',
      paymentState: 'PAID',
      subtotalCents: 100,
      totalCents: 100,
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [],
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    await repo.put({
      clientId: 'o2',
      status: 'COMPLETED',
      channel: 'IN_PERSON',
      paymentState: 'PAID',
      subtotalCents: 200,
      totalCents: 200,
      occurredAt: '2026-06-21T12:00:00.000Z',
      lines: [],
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T12:00:00.000Z',
    });
    await useOrderStore.getState().load();
    expect(useOrderStore.getState().items.map((o) => o.clientId)).toEqual(['o2', 'o1']);
  });

  it('voids a synced order online and updates the local row', async () => {
    const repo = makeRepo<OrderRow>('orders');
    await repo.put({
      clientId: 'o1',
      serverId: 'srv-o1',
      status: 'COMPLETED',
      channel: 'IN_PERSON',
      paymentState: 'PAID',
      subtotalCents: 500,
      totalCents: 500,
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [],
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({
      order: { id: 'srv-o1', status: 'VOID', paymentState: 'PAID', subtotalCents: 500, totalCents: 500, occurredAt: '2026-06-21T10:00:00.000Z', lines: [] },
    });
    await useOrderStore.getState().void('o1', 'biz1');
    const row = await useOrderStore.getState().get('o1');
    expect(row?.status).toBe('VOID');
    expect(authMod.authFetch).toHaveBeenCalledWith(
      '/v1/businesses/biz1/orders/srv-o1/void',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('toggles payment state online and updates the local row', async () => {
    const repo = makeRepo<OrderRow>('orders');
    await repo.put({
      clientId: 'o1',
      serverId: 'srv-o1',
      status: 'COMPLETED',
      channel: 'IN_PERSON',
      paymentState: 'PAID',
      subtotalCents: 500,
      totalCents: 500,
      occurredAt: '2026-06-21T10:00:00.000Z',
      lines: [],
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    vi.spyOn(authMod, 'authFetch').mockResolvedValue({
      order: { id: 'srv-o1', status: 'COMPLETED', paymentState: 'UNPAID', subtotalCents: 500, totalCents: 500, occurredAt: '2026-06-21T10:00:00.000Z', lines: [] },
    });
    await useOrderStore.getState().setPayment('o1', 'biz1', 'UNPAID');
    const row = await useOrderStore.getState().get('o1');
    expect(row?.paymentState).toBe('UNPAID');
    expect(authMod.authFetch).toHaveBeenCalledWith(
      '/v1/businesses/biz1/orders/srv-o1/payment',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ paymentState: 'UNPAID' }) }),
    );
  });
});
