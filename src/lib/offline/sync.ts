import { postJson } from '@/lib/api-client';
import { listBatch, remove } from './outbox';
import { makeRepo } from './repo';
import type { ProductRow, EntityName } from './types';

export interface SyncOpResult {
  clientId: string;
  status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
  serverId?: string;
  error?: { code: string; message: string };
}

export interface SyncSummary {
  applied: number;
  duplicate: number;
  conflict: number;
  rejected: number;
}

const products = makeRepo<ProductRow>('products');

/** Drain the outbox once: POST the batch, then reconcile local rows against per-op results. */
export async function runSync(businessId: string): Promise<SyncSummary> {
  const summary: SyncSummary = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
  const ops = await listBatch();
  if (ops.length === 0) return summary;

  const { results } = await postJson<{ results: SyncOpResult[] }>(
    `/v1/businesses/${businessId}/sync`,
    { ops },
  );

  const byEntity = new Map(ops.map((o) => [o.clientId, o.entity] as [string, EntityName]));

  for (const r of results) {
    const entity = byEntity.get(r.clientId);
    if (entity === 'product') {
      const row = await products.get(r.clientId);
      if (row) {
        if (r.status === 'APPLIED' || r.status === 'DUPLICATE') {
          await products.put({ ...row, serverId: r.serverId, _syncState: 'synced' });
        } else if (r.status === 'CONFLICT') {
          await products.put({ ...row, serverId: r.serverId, _syncState: 'conflict' });
        } else {
          await products.put({ ...row, _syncState: 'error' });
        }
      }
    }

    if (r.status === 'REJECTED') {
      summary.rejected += 1; // keep the op for retry
    } else {
      if (r.status === 'APPLIED') summary.applied += 1;
      else if (r.status === 'DUPLICATE') summary.duplicate += 1;
      else summary.conflict += 1;
      await remove(r.clientId);
    }
  }

  return summary;
}
