// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore } from './store';
import { useProductStore } from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';
import { listBatch } from '@/lib/offline/outbox';
import { makeRepo } from '@/lib/offline/repo';
import type { ProductRow, StockMovementRow } from '@/lib/offline/types';

describe('useInventoryStore', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('stockMovements');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
    useInventoryStore.setState({ items: [] });
  });

  it('records a positive receive movement offline-first and enqueues a stock_movement create op', async () => {
    const products = makeRepo<ProductRow>('products');
    await products.put({
      clientId: 'p1',
      name: 'Sugar',
      sellPriceCents: 1200,
      status: 'ACTIVE',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });

    const clientId = await useInventoryStore
      .getState()
      .adjust({ productId: 'p1', type: 'RECEIVE', qtyDelta: 12 });

    const items = useInventoryStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      clientId,
      productId: 'p1',
      type: 'RECEIVE',
      qtyDelta: 12,
      _syncState: 'pending',
    });

    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      clientId,
      entity: 'stock_movement',
      op: 'create',
    });
    expect(ops[0].payload).toMatchObject({
      productId: 'p1',
      type: 'RECEIVE',
      qtyDelta: 12,
    });
    expect(ops[0].payload).not.toHaveProperty('_syncState');
  });

  it('records a negative adjustment and does not block it', async () => {
    const products = makeRepo<ProductRow>('products');
    await products.put({
      clientId: 'p1',
      name: 'Flour',
      sellPriceCents: 900,
      status: 'ACTIVE',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });

    const clientId = await useInventoryStore
      .getState()
      .adjust({ productId: 'p1', type: 'ADJUSTMENT', qtyDelta: -5, reason: 'breakage' });

    const row = useInventoryStore.getState().items[0];
    expect(row.qtyDelta).toBe(-5);
    expect(row.reason).toBe('breakage');

    const ops = await listBatch();
    expect(ops[0].payload).toMatchObject({ qtyDelta: -5, reason: 'breakage' });
  });

  it('load hydrates movements from IndexedDB', async () => {
    const repo = makeRepo<StockMovementRow>('stockMovements');
    await repo.put({
      clientId: 'sm1',
      productId: 'p1',
      type: 'ADJUSTMENT',
      qtyDelta: -1,
      reason: 'spoilage',
      occurredAt: '2026-06-21T10:00:00.000Z',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });

    await useInventoryStore.getState().load();
    expect(useInventoryStore.getState().items).toHaveLength(1);
    expect(useInventoryStore.getState().items[0].reason).toBe('spoilage');
  });
});
