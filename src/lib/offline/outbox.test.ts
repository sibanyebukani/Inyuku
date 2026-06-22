import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, listBatch, remove, count } from './outbox';
import { openDb } from './db';
import type { OutboxOp } from './types';

const op = (clientId: string, occurredAt: string): OutboxOp => ({
  clientId, entity: 'product', op: 'create', occurredAt, payload: {},
});

describe('outbox', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('outbox');
    db.close();
  });

  it('lists ops sorted ascending by occurredAt', async () => {
    await enqueue(op('c', '2026-06-21T03:00:00.000Z'));
    await enqueue(op('a', '2026-06-21T01:00:00.000Z'));
    await enqueue(op('b', '2026-06-21T02:00:00.000Z'));
    expect((await listBatch()).map((o) => o.clientId)).toEqual(['a', 'b', 'c']);
  });

  it('caps the batch at 100', async () => {
    for (let i = 0; i < 105; i++) {
      await enqueue(op(`k${i}`, `2026-06-21T00:00:${String(i % 60).padStart(2, '0')}.000Z`));
    }
    expect((await listBatch()).length).toBe(100);
    expect(await count()).toBe(105);
  });

  it('removes an op by its seq key', async () => {
    const seq = await enqueue(op('a', '2026-06-21T01:00:00.000Z'));
    await remove(seq);
    expect(await count()).toBe(0);
  });

  it('keeps multiple ops for the same clientId until each seq is removed', async () => {
    const seq1 = await enqueue(op('a', '2026-06-21T01:00:00.000Z'));
    await enqueue(op('a', '2026-06-21T01:00:01.000Z'));
    await remove(seq1);
    expect(await count()).toBe(1);
  });
});
