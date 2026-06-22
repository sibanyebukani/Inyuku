import { describe, it, expect, beforeEach } from 'vitest';
import { atomicPutAndEnqueue } from './mutate';
import { makeRepo } from './repo';
import { count } from './outbox';
import { openDb } from './db';
import type { ProductRow } from './types';

const repo = makeRepo<ProductRow>('products');

describe('atomicPutAndEnqueue', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
  });

  it('writes the row and the outbox op atomically', async () => {
    const row: ProductRow = {
      clientId: 'p1', name: 'Bread', sellPriceCents: 150, status: 'ACTIVE',
      _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
    };
    await atomicPutAndEnqueue({
      store: 'products',
      row,
      op: {
        clientId: 'p1', entity: 'product', op: 'create',
        occurredAt: '2026-06-21T10:00:00.000Z', payload: { name: 'Bread' },
      },
    });
    expect((await repo.get('p1'))?.name).toBe('Bread');
    expect(await count()).toBe(1);
  });

  it('rolls back the row when the outbox enqueue throws', async () => {
    const row: ProductRow = {
      clientId: 'p2', name: 'Milk', sellPriceCents: 200, status: 'ACTIVE',
      _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
    };
    // A function in the payload makes the structured-clone put throw,
    // which must abort the transaction and leave the products store empty.
    await expect(
      atomicPutAndEnqueue({
        store: 'products',
        row,
        op: {
          clientId: 'p2', entity: 'product', op: 'create',
          occurredAt: '2026-06-21T10:00:00.000Z',
          payload: { fn: (() => {}) as unknown as Record<string, unknown> },
        },
      }),
    ).rejects.toThrow();

    expect(await repo.get('p2')).toBeUndefined();
    expect(await count()).toBe(0);
  });
});
