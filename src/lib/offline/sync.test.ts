import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runSync } from './sync';
import { enqueue, count } from './outbox';
import { makeRepo } from './repo';
import { openDb } from './db';
import * as authMod from '@/lib/session/authFetch';
import * as client from '@/lib/api-client';
import type { ProductRow, CustomerRow, OrderRow, StockMovementRow, OutboxOp } from './types';

const products = makeRepo<ProductRow>('products');
const customers = makeRepo<CustomerRow>('customers');
const orders = makeRepo<OrderRow>('orders');
const stockMovements = makeRepo<StockMovementRow>('stockMovements');

async function seedProduct(clientId: string): Promise<void> {
  await products.put({
    clientId, name: 'X', sellPriceCents: 100, status: 'ACTIVE',
    _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
  });
  const op: OutboxOp = {
    clientId, entity: 'product', op: 'create',
    occurredAt: '2026-06-21T10:00:00.000Z', payload: { name: 'X', sellPriceCents: 100 },
  };
  await enqueue(op);
}

async function seedCustomer(clientId: string): Promise<void> {
  await customers.put({
    clientId, name: 'Nomsa', phone: '+27821234567',
    _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
  });
  await enqueue({
    clientId, entity: 'customer', op: 'create',
    occurredAt: '2026-06-21T10:00:00.000Z', payload: { name: 'Nomsa', phone: '+27821234567' },
  });
}

async function seedOrder(clientId: string): Promise<void> {
  await orders.put({
    clientId, orderNumber: '0001', status: 'COMPLETED', channel: 'IN_PERSON', paymentState: 'PAID',
    subtotalCents: 100, totalCents: 100, occurredAt: '2026-06-21T10:00:00.000Z', lines: [],
    _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
  });
  await enqueue({
    clientId, entity: 'order', op: 'create',
    occurredAt: '2026-06-21T10:00:00.000Z', payload: { status: 'COMPLETED', lines: [] },
  });
}

async function seedStockMovement(clientId: string): Promise<void> {
  await stockMovements.put({
    clientId, productId: 'prod1', type: 'ADJUSTMENT', qtyDelta: -1, reason: 'breakage',
    occurredAt: '2026-06-21T10:00:00.000Z',
    _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
  });
  await enqueue({
    clientId, entity: 'stock_movement', op: 'create',
    occurredAt: '2026-06-21T10:00:00.000Z', payload: { productId: 'prod1', type: 'ADJUSTMENT', qtyDelta: -1, reason: 'breakage' },
  });
}

function mockAuthFetchSequence(values: unknown[]) {
  let idx = 0;
  return vi.spyOn(authMod, 'authFetch').mockImplementation(async () => {
    const v = values[idx++];
    return v as never;
  });
}

describe('runSync', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('customers');
    await db.clear('orders');
    await db.clear('stockMovements');
    await db.clear('outbox');
    db.close();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a zeroed summary when the outbox is empty', async () => {
    expect(await runSync('biz1')).toEqual({ applied: 0, duplicate: 0, conflict: 0, rejected: 0 });
  });

  it('APPLIED maps serverId, marks synced, drains the op', async () => {
    await seedProduct('p1');
    mockAuthFetchSequence([{ results: [{ clientId: 'p1', status: 'APPLIED', serverId: 'srv_1' }] }]);
    const summary = await runSync('biz1');
    expect(summary.applied).toBe(1);
    const row = await products.get('p1');
    expect(row?.serverId).toBe('srv_1');
    expect(row?._syncState).toBe('synced');
    expect(await count()).toBe(0);
  });

  it('APPLIED drains a product update op and leaves the locally-edited row synced', async () => {
    await products.put({
      clientId: 'pU', name: 'New', sellPriceCents: 200, status: 'ACTIVE',
      _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    await enqueue({
      clientId: 'pU', entity: 'product', op: 'update',
      occurredAt: '2026-06-21T10:00:00.000Z', payload: { name: 'New', sellPriceCents: 200 },
    });
    mockAuthFetchSequence([{ results: [{ clientId: 'pU', status: 'APPLIED', serverId: 'srv_u' }] }]);
    const summary = await runSync('biz1');
    expect(summary.applied).toBe(1);
    const row = await products.get('pU');
    expect(row?._syncState).toBe('synced');
    expect(row?.serverId).toBe('srv_u');
    expect(row?.name).toBe('New');
    expect(await count()).toBe(0);
  });

  it('DUPLICATE is treated as applied and drained', async () => {
    await seedProduct('p2');
    mockAuthFetchSequence([{ results: [{ clientId: 'p2', status: 'DUPLICATE', serverId: 'srv_2' }] }]);
    const summary = await runSync('biz1');
    expect(summary.duplicate).toBe(1);
    expect((await products.get('p2'))?._syncState).toBe('synced');
    expect(await count()).toBe(0);
  });

  it('CONFLICT refetches the server row, marks synced, surfaces a notice, and drains the op', async () => {
    await seedProduct('p3');
    const notices: unknown[] = [];
    mockAuthFetchSequence([
      { results: [{ clientId: 'p3', status: 'CONFLICT', serverId: 'srv_3' }] },
      { product: { name: 'Server X', sellPriceCents: 999, status: 'ACTIVE' } },
    ]);
    const summary = await runSync('biz1', (n) => notices.push(n));
    expect(summary.conflict).toBe(1);
    const row = await products.get('p3');
    expect(row?._syncState).toBe('synced');
    expect(row?.serverId).toBe('srv_3');
    expect(row?.name).toBe('Server X');
    expect(row?.sellPriceCents).toBe(999);
    expect(await count()).toBe(0);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ type: 'conflict', entity: 'product', clientId: 'p3' });
  });

  it('REJECTED marks the row error and KEEPS the op for retry', async () => {
    await seedProduct('p4');
    mockAuthFetchSequence([{ results: [{ clientId: 'p4', status: 'REJECTED', error: { code: 'VALIDATION', message: 'bad' } }] }]);
    const summary = await runSync('biz1');
    expect(summary.rejected).toBe(1);
    expect((await products.get('p4'))?._syncState).toBe('error');
    expect(await count()).toBe(1);
  });

  it('converges a mixed batch and posts to the tenant-scoped endpoint', async () => {
    await seedProduct('a');
    await seedProduct('b');
    await seedProduct('c');
    mockAuthFetchSequence([
      { results: [
        { clientId: 'a', status: 'APPLIED', serverId: 'sa' },
        { clientId: 'b', status: 'CONFLICT', serverId: 'sb' },
        { clientId: 'c', status: 'REJECTED', error: { code: 'X', message: 'y' } },
      ] },
      { product: { name: 'B Server', sellPriceCents: 1, status: 'ACTIVE' } },
    ]);
    const summary = await runSync('biz9');
    expect(summary).toEqual({ applied: 1, duplicate: 0, conflict: 1, rejected: 1 });
    expect(await count()).toBe(1); // only the rejected op remains
    const authSpy = authMod.authFetch as ReturnType<typeof vi.fn>;
    expect(authSpy.mock.calls[0][0]).toContain('/v1/businesses/biz9/sync');
  });

  it('reconciles customer, order, and stock_movement rows', async () => {
    await seedCustomer('c1');
    await seedOrder('o1');
    await seedStockMovement('sm1');
    mockAuthFetchSequence([
      { results: [
        { clientId: 'c1', status: 'APPLIED', serverId: 'srv_c1' },
        { clientId: 'o1', status: 'APPLIED', serverId: 'srv_o1' },
        { clientId: 'sm1', status: 'APPLIED', serverId: 'srv_sm1' },
      ] },
    ]);
    const summary = await runSync('biz1');
    expect(summary.applied).toBe(3);
    expect((await customers.get('c1'))?._syncState).toBe('synced');
    expect((await orders.get('o1'))?._syncState).toBe('synced');
    expect((await stockMovements.get('sm1'))?._syncState).toBe('synced');
  });

  it('handles CONFLICT for customer by refetching', async () => {
    await seedCustomer('c2');
    mockAuthFetchSequence([
      { results: [{ clientId: 'c2', status: 'CONFLICT', serverId: 'srv_c2' }] },
      { customer: { name: 'Server Customer', phone: '+27830000000', notes: 'from server' } },
    ]);
    await runSync('biz1');
    const row = await customers.get('c2');
    expect(row?._syncState).toBe('synced');
    expect(row?.name).toBe('Server Customer');
    expect(row?.notes).toBe('from server');
  });

  it('handles CONFLICT for stock_movement without a refetch endpoint by marking conflict and surfacing notice', async () => {
    await seedStockMovement('sm2');
    const notices: unknown[] = [];
    mockAuthFetchSequence([
      { results: [{ clientId: 'sm2', status: 'CONFLICT', serverId: 'srv_sm2' }] },
    ]);
    await runSync('biz1', (n) => notices.push(n));
    const row = await stockMovements.get('sm2');
    expect(row?._syncState).toBe('conflict');
    expect(row?.serverId).toBe('srv_sm2');
    expect(notices).toHaveLength(1);
  });

  it('on 401 refreshes once and retries via authFetch', async () => {
    await seedProduct('p401');
    const spy = vi.spyOn(client, 'apiFetch');
    // 1st call = sync POST returns 401; authFetch refreshes; 3rd call = retry sync succeeds.
    spy.mockRejectedValueOnce(new client.ApiError('AUTH', 'expired', 401));
    spy.mockResolvedValueOnce({ ok: true }); // refresh
    spy.mockResolvedValueOnce({ results: [{ clientId: 'p401', status: 'APPLIED', serverId: 'srv_401' }] }); // retry
    const summary = await runSync('biz1');
    expect(summary.applied).toBe(1);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[1][0]).toBe('/v1/auth/refresh');
    expect((await products.get('p401'))?.serverId).toBe('srv_401');
  });
});
