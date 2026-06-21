// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useProductStore } from './store';
import { openDb } from '@/lib/offline/db';
import { listBatch } from '@/lib/offline/outbox';

describe('useProductStore', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
  });

  it('create writes a pending row and enqueues a create op', async () => {
    const clientId = await useProductStore.getState().create({ name: 'Maize', sellPriceCents: 2500 });
    const items = useProductStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ clientId, name: 'Maize', sellPriceCents: 2500, _syncState: 'pending', status: 'ACTIVE' });
    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ clientId, entity: 'product', op: 'create' });
    expect(ops[0].payload).toMatchObject({ name: 'Maize', sellPriceCents: 2500 });
    expect(ops[0].payload).not.toHaveProperty('_syncState');
  });

  it('update merges fields and enqueues an update op', async () => {
    const clientId = await useProductStore.getState().create({ name: 'Rice', sellPriceCents: 100 });
    await useProductStore.getState().update(clientId, { sellPriceCents: 150 });
    expect(useProductStore.getState().items[0].sellPriceCents).toBe(150);
    expect((await listBatch()).filter((o) => o.op === 'update')).toHaveLength(1);
    // Persistence round-trip: reset in-memory state and reload from IndexedDB
    useProductStore.setState({ items: [] });
    await useProductStore.getState().load();
    const reloaded = useProductStore.getState().items.find((i) => i.clientId === clientId);
    expect(reloaded?.sellPriceCents).toBe(150);
  });

  it('archive flips status and enqueues an update op carrying the archived status', async () => {
    const clientId = await useProductStore.getState().create({ name: 'Soap', sellPriceCents: 999 });
    await useProductStore.getState().archive(clientId);
    expect(useProductStore.getState().items[0].status).toBe('ARCHIVED');
    const archiveOp = (await listBatch()).find((o) => o.payload.status === 'ARCHIVED');
    expect(archiveOp).toBeDefined();
    // Persistence round-trip: reset in-memory state and reload from IndexedDB
    useProductStore.setState({ items: [] });
    await useProductStore.getState().load();
    const reloaded = useProductStore.getState().items.find((i) => i.clientId === clientId);
    expect(reloaded?.status).toBe('ARCHIVED');
  });

  it('load hydrates items from IndexedDB', async () => {
    await useProductStore.getState().create({ name: 'Tea', sellPriceCents: 4000 });
    useProductStore.setState({ items: [] });
    await useProductStore.getState().load();
    expect(useProductStore.getState().items).toHaveLength(1);
  });
});
