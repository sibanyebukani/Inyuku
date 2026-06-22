import { create as createStore } from 'zustand';
import { makeRepo } from '@/lib/offline/repo';
import { atomicPutAndEnqueue } from '@/lib/offline/mutate';
import { newClientId } from '@/lib/offline/ids';
import { authFetch } from '@/lib/session/authFetch';
import type { OrderRow, OrderLineRow } from '@/lib/offline/types';

const repo = makeRepo<OrderRow>('orders');

export interface OrderCreateInput {
  customerId?: string;
  paymentState: 'PAID' | 'UNPAID';
  status: 'DRAFT' | 'COMPLETED';
  channel: 'IN_PERSON' | 'WHATSAPP' | 'ONLINE';
  lines: OrderLineRow[];
  subtotalCents: number;
  totalCents: number;
  occurredAt?: string;
}

interface OrderState {
  items: OrderRow[];
  load: () => Promise<void>;
  create: (input: OrderCreateInput) => Promise<string>;
  get: (clientId: string) => Promise<OrderRow | undefined>;
  complete: (clientId: string, businessId: string) => Promise<void>;
  void: (clientId: string, businessId: string) => Promise<void>;
  setPayment: (clientId: string, businessId: string, paymentState: 'PAID' | 'UNPAID') => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function serverOrderToRow(serverOrder: Record<string, unknown>, clientId: string): OrderRow {
  return {
    clientId,
    serverId: (serverOrder.id as string | undefined) ?? undefined,
    orderNumber: (serverOrder.orderNumber as string | undefined) ?? undefined,
    customerId: (serverOrder.customerId as string | undefined) ?? undefined,
    status: serverOrder.status as OrderRow['status'],
    channel: serverOrder.channel as OrderRow['channel'],
    paymentState: serverOrder.paymentState as OrderRow['paymentState'],
    subtotalCents: Number(serverOrder.subtotalCents ?? 0),
    totalCents: Number(serverOrder.totalCents ?? 0),
    occurredAt: (serverOrder.occurredAt as string) ?? nowIso(),
    lines: (serverOrder.lines as OrderLineRow[] | undefined) ?? [],
    _syncState: 'synced',
    updatedAtLocal: nowIso(),
  };
}

export const useOrderStore = createStore<OrderState>((set) => ({
  items: [],

  async load() {
    const all = await repo.list();
    all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    set({ items: all });
  },

  async create(input) {
    const clientId = newClientId();
    const occurredAt = input.occurredAt ?? nowIso();
    const row: OrderRow = {
      clientId,
      customerId: input.customerId,
      status: input.status,
      channel: input.channel,
      paymentState: input.paymentState,
      subtotalCents: input.subtotalCents,
      totalCents: input.totalCents,
      occurredAt,
      lines: input.lines,
      _syncState: 'pending',
      updatedAtLocal: occurredAt,
    };
    await atomicPutAndEnqueue({
      store: 'orders',
      row,
      op: {
        clientId,
        entity: 'order',
        op: 'create',
        occurredAt,
        payload: {
          customerId: input.customerId,
          status: input.status,
          paymentState: input.paymentState,
          lines: input.lines.map((line) => ({ productId: line.productId!, qty: line.qty })),
        },
      },
    });
    set({ items: await repo.list() });
    return clientId;
  },

  async get(clientId) {
    return repo.get(clientId);
  },

  async complete(clientId, businessId) {
    const row = await repo.get(clientId);
    if (!row?.serverId) throw new Error('Order must be synced before completing');
    const { order } = await authFetch<{ order: Record<string, unknown> }>(
      `/v1/businesses/${businessId}/orders/${row.serverId}/complete`,
      { method: 'POST' },
    );
    await repo.put(serverOrderToRow(order, clientId));
    set({ items: await repo.list() });
  },

  async void(clientId, businessId) {
    const row = await repo.get(clientId);
    if (!row?.serverId) throw new Error('Order must be synced before voiding');
    const { order } = await authFetch<{ order: Record<string, unknown> }>(
      `/v1/businesses/${businessId}/orders/${row.serverId}/void`,
      { method: 'POST' },
    );
    await repo.put(serverOrderToRow(order, clientId));
    set({ items: await repo.list() });
  },

  async setPayment(clientId, businessId, paymentState) {
    const row = await repo.get(clientId);
    if (!row?.serverId) throw new Error('Order must be synced before updating payment');
    const { order } = await authFetch<{ order: Record<string, unknown> }>(
      `/v1/businesses/${businessId}/orders/${row.serverId}/payment`,
      { method: 'PATCH', body: JSON.stringify({ paymentState }) },
    );
    await repo.put(serverOrderToRow(order, clientId));
    set({ items: await repo.list() });
  },
}));
