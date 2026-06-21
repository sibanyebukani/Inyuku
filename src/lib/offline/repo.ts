import { openDb, type StoreName } from './db';

export interface Repo<T> {
  get(clientId: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  put(row: T): Promise<void>;
  remove(clientId: string): Promise<void>;
}

export function makeRepo<T extends { clientId: string }>(store: StoreName): Repo<T> {
  return {
    async get(clientId) {
      const db = await openDb();
      const v = (await db.get(store, clientId)) as T | undefined;
      db.close();
      return v;
    },
    async list() {
      const db = await openDb();
      const v = (await db.getAll(store)) as T[];
      db.close();
      return v;
    },
    async put(rowValue) {
      const db = await openDb();
      await db.put(store, rowValue as never);
      db.close();
    },
    async remove(clientId) {
      const db = await openDb();
      await db.delete(store, clientId);
      db.close();
    },
  };
}
