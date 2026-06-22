// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useCustomerStore } from './store';
import { openDb } from '@/lib/offline/db';
import { makeRepo } from '@/lib/offline/repo';
import { listBatch } from '@/lib/offline/outbox';
import type { CustomerRow } from '@/lib/offline/types';

describe('useCustomerStore', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('customers');
    await db.clear('outbox');
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

  it('create writes a pending row and enqueues a create op', async () => {
    const clientId = await useCustomerStore.getState().create({ name: 'Nomsa', phone: '+27821234567' });
    expect(useCustomerStore.getState().items).toHaveLength(1);
    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ clientId, entity: 'customer', op: 'create' });
    expect(ops[0].payload).toMatchObject({ name: 'Nomsa', phone: '+27821234567' });
  });

  it('update appends an update op and includes server id when the row has synced', async () => {
    await makeRepo<CustomerRow>('customers').put({
      clientId: 'cU',
      name: 'Nomsa',
      phone: '+27821234567',
      serverId: 'srv_cU',
      _syncState: 'synced',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    await useCustomerStore.getState().update('cU', { name: 'Nomsa M' });
    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ clientId: 'cU', entity: 'customer', op: 'update' });
    expect(ops[0].payload).toMatchObject({ name: 'Nomsa M', id: 'srv_cU' });
  });
});
