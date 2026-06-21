import { describe, it, expect } from 'vitest';
import { openDb } from './db';

describe('openDb', () => {
  it('creates all required object stores', async () => {
    const db = await openDb();
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual(
      ['customers', 'meta', 'orders', 'outbox', 'products', 'stockMovements'].sort(),
    );
    db.close();
  });

  it('stores and reads back a product by clientId', async () => {
    const db = await openDb();
    await db.put('products', {
      clientId: 'p1',
      name: 'Bread',
      sellPriceCents: 1500,
      status: 'ACTIVE',
      _syncState: 'pending',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    const row = await db.get('products', 'p1');
    expect(row?.name).toBe('Bread');
    db.close();
  });
});
