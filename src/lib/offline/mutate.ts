import { openDb, type StoreName } from './db';
import type { BaseRow, OutboxOp } from './types';

export interface AtomicPutInput<T extends BaseRow> {
  store: StoreName;
  row: T;
  op: OutboxOp;
}

/**
 * Write a row to its IndexedDB store and enqueue the matching outbox op in a
 * single readwrite transaction. If either write throws, the whole transaction
 * aborts and neither side lands — preventing orphan pending rows.
 */
export async function atomicPutAndEnqueue<T extends BaseRow>(
  input: AtomicPutInput<T>,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([input.store, 'outbox'], 'readwrite');
  try {
    await tx.objectStore(input.store).put(input.row as never);
    await tx.objectStore('outbox').put(input.op);
    await tx.done;
  } catch (err) {
    // Spec-compliant IndexedDB aborts automatically on request error.
    // fake-indexeddb does not, so we explicitly abort to keep tests honest.
    // In real implementations tx.abort() is a no-op because the transaction
    // is already done; the nested catches prevent unhandled rejections.
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
    try {
      await tx.done;
    } catch {
      /* consume abort/rejection so it is not unhandled */
    }
    throw err;
  }
}
