import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProductRow, OutboxOp, BaseRow } from './types';

interface InyukuDB extends DBSchema {
  products: { key: string; value: ProductRow };
  customers: { key: string; value: BaseRow & Record<string, unknown> };
  orders: { key: string; value: BaseRow & Record<string, unknown> };
  stockMovements: { key: string; value: BaseRow & Record<string, unknown> };
  outbox: { key: string; value: OutboxOp };
  meta: { key: string; value: unknown };
}

export type InyukuDatabase = IDBPDatabase<InyukuDB>;
export type StoreName = 'products' | 'customers' | 'orders' | 'stockMovements';

const DB_NAME = 'inyuku';
const DB_VERSION = 1;

export function openDb(): Promise<InyukuDatabase> {
  return openDB<InyukuDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('products', { keyPath: 'clientId' });
      db.createObjectStore('customers', { keyPath: 'clientId' });
      db.createObjectStore('orders', { keyPath: 'clientId' });
      db.createObjectStore('stockMovements', { keyPath: 'clientId' });
      db.createObjectStore('outbox', { keyPath: 'clientId' });
      db.createObjectStore('meta');
    },
  });
}
