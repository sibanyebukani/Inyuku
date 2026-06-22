import { authFetch } from '@/lib/session/authFetch';
import { listBatch, remove } from './outbox';
import { makeRepo } from './repo';
import type {
  ProductRow,
  CustomerRow,
  OrderRow,
  StockMovementRow,
  EntityName,
  SyncNotice,
  OutboxOp,
} from './types';

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
const customers = makeRepo<CustomerRow>('customers');
const orders = makeRepo<OrderRow>('orders');
const stockMovements = makeRepo<StockMovementRow>('stockMovements');

const refetchPaths: Record<
  EntityName,
  (businessId: string, serverId: string) => string | undefined
> = {
  product: (businessId, serverId) => `/v1/businesses/${businessId}/products/${serverId}`,
  customer: (businessId, serverId) => `/v1/businesses/${businessId}/customers/${serverId}`,
  order: (businessId, serverId) => `/v1/businesses/${businessId}/orders/${serverId}`,
  stock_movement: () => undefined,
};

const responseKeys: Record<EntityName, string> = {
  product: 'product',
  customer: 'customer',
  order: 'order',
  stock_movement: 'movement',
};

async function reconcile(
  businessId: string,
  entity: EntityName,
  clientId: string,
  result: SyncOpResult,
  onNotice?: (notice: SyncNotice) => void,
): Promise<void> {
  const now = new Date().toISOString();

  if (entity === 'product') {
    const row = await products.get(clientId);
    if (!row) return;
    if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
      await products.put({ ...row, serverId: result.serverId ?? row.serverId, _syncState: 'synced' });
    } else if (result.status === 'CONFLICT') {
      await handleConflict(businessId, 'product', row, result, onNotice, products, now);
    } else {
      await products.put({ ...row, _syncState: 'error' });
    }
    return;
  }

  if (entity === 'customer') {
    const row = await customers.get(clientId);
    if (!row) return;
    if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
      await customers.put({ ...row, serverId: result.serverId ?? row.serverId, _syncState: 'synced' });
    } else if (result.status === 'CONFLICT') {
      await handleConflict(businessId, 'customer', row, result, onNotice, customers, now);
    } else {
      await customers.put({ ...row, _syncState: 'error' });
    }
    return;
  }

  if (entity === 'order') {
    const row = await orders.get(clientId);
    if (!row) return;
    if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
      await orders.put({ ...row, serverId: result.serverId ?? row.serverId, _syncState: 'synced' });
    } else if (result.status === 'CONFLICT') {
      await handleConflict(businessId, 'order', row, result, onNotice, orders, now);
    } else {
      await orders.put({ ...row, _syncState: 'error' });
    }
    return;
  }

  if (entity === 'stock_movement') {
    const row = await stockMovements.get(clientId);
    if (!row) return;
    if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
      await stockMovements.put({ ...row, serverId: result.serverId ?? row.serverId, _syncState: 'synced' });
    } else if (result.status === 'CONFLICT') {
      await handleConflict(businessId, 'stock_movement', row, result, onNotice, stockMovements, now);
    } else {
      await stockMovements.put({ ...row, _syncState: 'error' });
    }
  }
}

async function handleConflict<T extends { clientId: string; _syncState: 'pending' | 'synced' | 'conflict' | 'error' }>(
  businessId: string,
  entity: EntityName,
  row: T,
  result: SyncOpResult,
  onNotice: ((notice: SyncNotice) => void) | undefined,
  repo: { put(row: T): Promise<void> },
  now: string,
): Promise<void> {
  const path = result.serverId ? refetchPaths[entity](businessId, result.serverId) : undefined;
  if (path) {
    try {
      const envelope = await authFetch<Record<string, Record<string, unknown>>>(path);
      const serverData = envelope[responseKeys[entity]] ?? {};
      await repo.put({
        ...row,
        ...serverData,
        clientId: row.clientId,
        serverId: result.serverId ?? (serverData.id as string | undefined),
        _syncState: 'synced',
        updatedAtLocal: now,
      } as T);
    } catch {
      await repo.put({ ...row, serverId: result.serverId, _syncState: 'conflict' } as T);
    }
  } else {
    await repo.put({ ...row, serverId: result.serverId, _syncState: 'conflict' } as T);
  }
  onNotice?.({
    type: 'conflict',
    entity,
    clientId: row.clientId,
    message: `${entity} ${row.clientId} was updated on the server`,
  });
}

/** Drain the outbox once: POST the batch, then reconcile local rows against per-op results. */
export async function runSync(
  businessId: string,
  onNotice?: (notice: SyncNotice) => void,
): Promise<SyncSummary> {
  const summary: SyncSummary = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
  const ops = await listBatch();
  if (ops.length === 0) return summary;

  const { results } = await authFetch<{ results: SyncOpResult[] }>(
    `/v1/businesses/${businessId}/sync`,
    { method: 'POST', body: JSON.stringify({ ops }) },
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const op = ops[i] as OutboxOp | undefined;
    if (!op) continue;

    await reconcile(businessId, op.entity, op.clientId, r, onNotice);

    if (r.status === 'REJECTED') {
      summary.rejected += 1; // keep the op for retry
    } else {
      if (r.status === 'APPLIED') summary.applied += 1;
      else if (r.status === 'DUPLICATE') summary.duplicate += 1;
      else summary.conflict += 1;
      if (op.seq !== undefined) {
        await remove(op.seq);
      }
    }
  }

  return summary;
}
