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

export interface OutboxOp {
  clientId: string;
  entity: EntityName;
  op: 'create' | 'update' | 'delete';
  occurredAt: string;
  payload: Record<string, unknown>;
}
