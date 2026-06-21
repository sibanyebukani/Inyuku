// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useCustomerStore } from './store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import type { CustomerRow } from '@/lib/offline/types';

describe('useCustomerStore (minimal listing)', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('customers');
    db.close();
    useCustomerStore.setState({ items: [] });
  });

  it('loads customers sorted by name', async () => {
    await makeRepo<CustomerRow>('customers').put({
      clientId: 'c2',
      name: 'Sipho',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    await makeRepo<CustomerRow>('customers').put({
      clientId: 'c1',
      name: 'Nomsa',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    await useCustomerStore.getState().load();
    expect(useCustomerStore.getState().items.map((c) => c.name)).toEqual(['Nomsa', 'Sipho']);
  });
});
