import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runSync } from './sync';
import { enqueue, count } from './outbox';
import { makeRepo } from './repo';
import { openDb } from './db';
import type { ProductRow, OutboxOp } from './types';

const products = makeRepo<ProductRow>('products');

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

function mockSync(results: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ ok: true, data: { results } }),
  }));
}

describe('runSync', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns a zeroed summary when the outbox is empty', async () => {
    expect(await runSync('biz1')).toEqual({ applied: 0, duplicate: 0, conflict: 0, rejected: 0 });
  });

  it('APPLIED maps serverId, marks synced, drains the op', async () => {
    await seedProduct('p1');
    mockSync([{ clientId: 'p1', status: 'APPLIED', serverId: 'srv_1' }]);
    const summary = await runSync('biz1');
    expect(summary.applied).toBe(1);
    const row = await products.get('p1');
    expect(row?.serverId).toBe('srv_1');
    expect(row?._syncState).toBe('synced');
    expect(await count()).toBe(0);
  });

  it('DUPLICATE is treated as applied and drained', async () => {
    await seedProduct('p2');
    mockSync([{ clientId: 'p2', status: 'DUPLICATE', serverId: 'srv_2' }]);
    const summary = await runSync('biz1');
    expect(summary.duplicate).toBe(1);
    expect((await products.get('p2'))?._syncState).toBe('synced');
    expect(await count()).toBe(0);
  });

  it('CONFLICT marks the row conflict and drains the op (server wins)', async () => {
    await seedProduct('p3');
    mockSync([{ clientId: 'p3', status: 'CONFLICT', serverId: 'srv_3' }]);
    const summary = await runSync('biz1');
    expect(summary.conflict).toBe(1);
    expect((await products.get('p3'))?._syncState).toBe('conflict');
    expect(await count()).toBe(0);
  });

  it('REJECTED marks the row error and KEEPS the op for retry', async () => {
    await seedProduct('p4');
    mockSync([{ clientId: 'p4', status: 'REJECTED', error: { code: 'VALIDATION', message: 'bad' } }]);
    const summary = await runSync('biz1');
    expect(summary.rejected).toBe(1);
    expect((await products.get('p4'))?._syncState).toBe('error');
    expect(await count()).toBe(1);
  });

  it('converges a mixed batch and posts to the tenant-scoped endpoint', async () => {
    await seedProduct('a');
    await seedProduct('b');
    await seedProduct('c');
    mockSync([
      { clientId: 'a', status: 'APPLIED', serverId: 'sa' },
      { clientId: 'b', status: 'CONFLICT', serverId: 'sb' },
      { clientId: 'c', status: 'REJECTED', error: { code: 'X', message: 'y' } },
    ]);
    const summary = await runSync('biz9');
    expect(summary).toEqual({ applied: 1, duplicate: 0, conflict: 1, rejected: 1 });
    expect(await count()).toBe(1); // only the rejected op remains
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/businesses/biz9/sync');
  });
});
