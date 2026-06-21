import { describe, it, expect, beforeEach } from 'vitest';
import { makeRepo } from './repo';
import { openDb } from './db';
import type { ProductRow } from './types';

const row = (clientId: string, name: string): ProductRow => ({
  clientId, name, sellPriceCents: 100, status: 'ACTIVE',
  _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
});

describe('makeRepo', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    db.close();
  });

  it('puts, gets, lists and removes rows', async () => {
    const repo = makeRepo<ProductRow>('products');
    await repo.put(row('a', 'Apple'));
    await repo.put(row('b', 'Bread'));
    expect((await repo.get('a'))?.name).toBe('Apple');
    expect((await repo.list()).map((r) => r.clientId).sort()).toEqual(['a', 'b']);
    await repo.remove('a');
    expect(await repo.get('a')).toBeUndefined();
  });
});
