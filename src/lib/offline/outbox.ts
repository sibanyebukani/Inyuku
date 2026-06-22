import { openDb } from './db';
import type { OutboxOp } from './types';

const MAX_BATCH = 100;

export async function enqueue(op: OutboxOp): Promise<number> {
  const db = await openDb();
  try {
    const seq = await db.add('outbox', op);
    return seq;
  } finally {
    db.close();
  }
}

export async function listBatch(): Promise<OutboxOp[]> {
  const db = await openDb();
  try {
    const all = (await db.getAll('outbox')) as OutboxOp[];
    all.sort((a, b) => {
      const t = a.occurredAt.localeCompare(b.occurredAt);
      return t !== 0 ? t : (a.seq ?? 0) - (b.seq ?? 0);
    });
    return all.slice(0, MAX_BATCH);
  } finally {
    db.close();
  }
}

export async function remove(seq: number): Promise<void> {
  const db = await openDb();
  try {
    await db.delete('outbox', seq);
  } finally {
    db.close();
  }
}

export async function count(): Promise<number> {
  const db = await openDb();
  try {
    return await db.count('outbox');
  } finally {
    db.close();
  }
}
