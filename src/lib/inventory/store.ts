import { create as createStore } from 'zustand';
import { makeRepo } from '@/lib/offline/repo';
import { atomicPutAndEnqueue } from '@/lib/offline/mutate';
import { newClientId } from '@/lib/offline/ids';
import type { StockMovementRow } from '@/lib/offline/types';

const repo = makeRepo<StockMovementRow>('stockMovements');

export interface StockAdjustmentInput {
  productId: string;
  type: 'ADJUSTMENT' | 'RECEIVE';
  qtyDelta: number;
  reason?: string;
}

interface InventoryState {
  items: StockMovementRow[];
  load: () => Promise<void>;
  adjust: (input: StockAdjustmentInput) => Promise<string>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useInventoryStore = createStore<InventoryState>((set) => ({
  items: [],

  async load() {
    set({ items: await repo.list() });
  },

  async adjust(input) {
    const clientId = newClientId();
    const occurredAt = nowIso();
    const row: StockMovementRow = {
      clientId,
      productId: input.productId,
      type: input.type,
      qtyDelta: input.qtyDelta,
      reason: input.reason,
      occurredAt,
      _syncState: 'pending',
      updatedAtLocal: occurredAt,
    };
    await atomicPutAndEnqueue({
      store: 'stockMovements',
      row,
      op: {
        clientId,
        entity: 'stock_movement',
        op: 'create',
        occurredAt,
        payload: {
          productId: input.productId,
          type: input.type,
          qtyDelta: input.qtyDelta,
          reason: input.reason,
        },
      },
    });
    set({ items: await repo.list() });
    return clientId;
  },
}));
