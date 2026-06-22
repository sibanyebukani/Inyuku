import { create as createStore } from 'zustand';
import { makeRepo } from '@/lib/offline/repo';
import { atomicPutAndEnqueue } from '@/lib/offline/mutate';
import { newClientId } from '@/lib/offline/ids';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');

export interface ProductCreateInput {
  name: string;
  sellPriceCents: number;
  costPriceCents?: number;
  lowStockThreshold?: number;
  /** Opening stock is stored on the product create op; the backend appends an OPENING movement. */
  openingStock?: number;
}

interface ProductState {
  items: ProductRow[];
  load: () => Promise<void>;
  create: (input: ProductCreateInput) => Promise<string>;
  update: (clientId: string, patch: Partial<ProductCreateInput>) => Promise<void>;
  archive: (clientId: string) => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useProductStore = createStore<ProductState>((set) => ({
  items: [],

  async load() {
    set({ items: await repo.list() });
  },

  async create(input) {
    const clientId = newClientId();
    const occurredAt = nowIso();
    const row: ProductRow = {
      clientId,
      name: input.name,
      sellPriceCents: input.sellPriceCents,
      costPriceCents: input.costPriceCents,
      lowStockThreshold: input.lowStockThreshold,
      status: 'ACTIVE',
      _syncState: 'pending',
      updatedAtLocal: occurredAt,
    };
    await atomicPutAndEnqueue({
      store: 'products',
      row,
      op: { clientId, entity: 'product', op: 'create', occurredAt, payload: { ...input } },
    });
    set({ items: await repo.list() });
    return clientId;
  },

  async update(clientId, patch) {
    const existing = await repo.get(clientId);
    if (!existing) return;
    const occurredAt = nowIso();
    const row: ProductRow = { ...existing, ...patch, _syncState: 'pending', updatedAtLocal: occurredAt };
    await atomicPutAndEnqueue({
      store: 'products',
      row,
      op: { clientId, entity: 'product', op: 'update', occurredAt, payload: { ...patch } },
    });
    set({ items: await repo.list() });
  },

  async archive(clientId) {
    const existing = await repo.get(clientId);
    if (!existing) return;
    const occurredAt = nowIso();
    const row: ProductRow = {
      ...existing,
      status: 'ARCHIVED',
      _syncState: 'pending',
      updatedAtLocal: occurredAt,
    };
    await atomicPutAndEnqueue({
      store: 'products',
      row,
      op: { clientId, entity: 'product', op: 'update', occurredAt, payload: { status: 'ARCHIVED' } },
    });
    set({ items: await repo.list() });
  },
}));
