export type SyncState = 'pending' | 'synced' | 'conflict' | 'error';
export type EntityName = 'product' | 'customer' | 'order' | 'stock_movement';

export interface BaseRow {
  clientId: string;
  serverId?: string;
  _syncState: SyncState;
  updatedAtLocal: string;
}

export interface ProductRow extends BaseRow {
  name: string;
  sellPriceCents: number;
  costPriceCents?: number;
  lowStockThreshold?: number;
  status: 'ACTIVE' | 'ARCHIVED';
  imageUrl?: string;
  /** True when a product was created offline and an image upload is deferred. */
  pendingImage?: boolean;
}

export interface CustomerRow extends BaseRow {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** GA-gated: nullable until the compliance ruling; no consent-capture UI in this phase. */
  consentId?: string;
}

export interface OrderLineRow {
  productId?: string;
  nameSnapshot: string;
  unitPriceCents: number;
  qty: number;
  lineTotalCents: number;
}

export interface OrderRow extends BaseRow {
  orderNumber?: string;
  customerId?: string;
  status: 'DRAFT' | 'COMPLETED' | 'VOID';
  channel: 'IN_PERSON' | 'WHATSAPP' | 'ONLINE';
  paymentState: 'PAID' | 'UNPAID';
  subtotalCents: number;
  totalCents: number;
  occurredAt: string;
  lines: OrderLineRow[];
}

export interface StockMovementRow extends BaseRow {
  productId: string;
  type: 'OPENING' | 'ADJUSTMENT' | 'SALE' | 'SALE_REVERSAL' | 'RECEIVE';
  qtyDelta: number;
  reason?: string;
  orderId?: string;
  occurredAt: string;
}

export interface OutboxOp {
  /** Auto-incremented by the outbox object store; undefined until persisted. */
  seq?: number;
  clientId: string;
  entity: EntityName;
  op: 'create' | 'update' | 'delete';
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface SyncNotice {
  type: 'conflict';
  entity: EntityName;
  clientId: string;
  message: string;
}
