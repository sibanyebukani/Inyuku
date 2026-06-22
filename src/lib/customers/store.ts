import { create as createStore } from 'zustand';
import { makeRepo } from '@/lib/offline/repo';
import { atomicPutAndEnqueue } from '@/lib/offline/mutate';
import { newClientId } from '@/lib/offline/ids';
import type { CustomerRow } from '@/lib/offline/types';

const repo = makeRepo<CustomerRow>('customers');

export interface CustomerCreateInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

interface CustomerState {
  items: CustomerRow[];
  load: () => Promise<void>;
  create: (input: CustomerCreateInput) => Promise<string>;
  update: (clientId: string, patch: Partial<CustomerCreateInput>) => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useCustomerStore = createStore<CustomerState>((set) => ({
  items: [],

  async load() {
    const all = await repo.list();
    all.sort((a, b) => a.name.localeCompare(b.name));
    set({ items: all });
  },

  async create(input) {
    const clientId = newClientId();
    const occurredAt = nowIso();
    const row: CustomerRow = {
      clientId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
      _syncState: 'pending',
      updatedAtLocal: occurredAt,
    };
    await atomicPutAndEnqueue({
      store: 'customers',
      row,
      op: {
        clientId,
        entity: 'customer',
        op: 'create',
        occurredAt,
        payload: { ...input },
      },
    });
    set({ items: await repo.list() });
    return clientId;
  },

  async update(clientId, patch) {
    const existing = await repo.get(clientId);
    if (!existing) return;
    const occurredAt = nowIso();
    const row: CustomerRow = { ...existing, ...patch, _syncState: 'pending', updatedAtLocal: occurredAt };
    // Sync payload needs the server id when the row has already synced.
    const payload: Record<string, unknown> = { ...patch };
    if (existing.serverId) payload.id = existing.serverId;
    await atomicPutAndEnqueue({
      store: 'customers',
      row,
      op: { clientId, entity: 'customer', op: 'update', occurredAt, payload },
    });
    set({ items: await repo.list() });
  },
}));
