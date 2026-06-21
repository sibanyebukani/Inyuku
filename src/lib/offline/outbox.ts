import { openDb } from './db';
import type { OutboxOp } from './types';

const MAX_BATCH = 100;

export async function enqueue(op: OutboxOp): Promise<void> {
  const db = await openDb();
  await db.put('outbox', op);
  db.close();
}

export async function listBatch(): Promise<OutboxOp[]> {
  const db = await openDb();
  const all = (await db.getAll('outbox')) as OutboxOp[];
  db.close();
  all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return all.slice(0, MAX_BATCH);
}

export async function remove(clientId: string): Promise<void> {
  const db = await openDb();
  await db.delete('outbox', clientId);
  db.close();
}

export async function count(): Promise<number> {
  const db = await openDb();
  const n = await db.count('outbox');
  db.close();
  return n;
}
