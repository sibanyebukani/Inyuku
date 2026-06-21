# M2-B1: Merchant PWA Foundation, Offline Engine & Products Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the merchant PWA foundation — an installable, cold-start-offline Next.js app with a custom thin local-first data + sync engine driving the M2 backend's batch `/sync`, proven end-to-end by a Products vertical slice (list/create/edit/archive/image, with RBAC cost-split).

**Architecture:** Four layers — UI (React/next-intl/Tailwind) → Zustand store → IndexedDB persistence (`idb`) + append-only outbox → sync-replay engine (`POST /sync`). A Serwist Service Worker caches the app shell for cold-start offline. Reads come from IndexedDB; writes are local-first (mutate IDB + enqueue outbox op) and the engine reconciles against the backend, which owns convergence (idempotent `clientId`, LWW on `occurredAt`, commutative stock ledger).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.9, Vitest 4, Zustand, `idb`, `ulid`, Zod, React Hook Form + `@hookform/resolvers`, `@serwist/next` + `serwist`, Tailwind, next-intl. Test infra: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `fake-indexeddb`.

## Global Constraints

- **Integer ZAR cents end-to-end** — never floats; display via formatter only.
- **Tenant scoping** — every commerce call is under `/v1/businesses/:businessId/*`; `activeBusinessId` always present.
- **RBAC cost-split by HIDING, not zeroing** — `costPriceCents`/financial fields are absent for `MERCHANT_STAFF`/`AI_AGENT`; UI must never render a cost field without `catalog:read_cost`.
- **Convergence is the backend's** — client only mints `clientId` (ULID), replays ops, trusts server results.
- **Offline = P0** — the app opens and operates with zero connectivity from a cold start; writes never block on the network.
- **TDD; both gates green** — `npm run lint`, `npm run typecheck`, `npm test` all pass before every commit; follow M1-C frontend patterns.
- **Path alias** `@/*` → `./src/*`. **Refresh endpoint** is `POST /v1/auth/refresh`.
- **Repo root** is `/home/sibnaye/Development/Inyuku` (frontend lives at root; backend under `server/`). Work on branch `feature/m2b1-merchant-pwa` off `main`.
- Seed/dev data only (EA-ADR-015 prod-PII gate).

## Scope amendment (2026-06-21, post-implementation)

Final whole-branch review surfaced that the **edit/archive/image** capabilities were built and
unit-tested at the engine/store layer but have **no UI callers**, and the deferred-image retry loop
(run a queued upload once a product row receives its `serverId`) is never closed. Founder decision:
**descope the edit/archive/image UI wiring + the post-sync image retry loop to M2-B2.** B1 ships the
offline **engine** + the **create/list** Products slice (with RBAC cost-split) as the convergence
de-risking proof; the unused engine code is retained and tested.

Also deferred to B2 (logged, non-blocking for B1):
- The non-atomic `repo.put`-then-`outbox.enqueue` in the store create path (a thrown `enqueue` could
  strand a `pending` row with no outbox op); an atomic fix needs a cross-store IDB transaction.
- `runSync()` uses raw `postJson` rather than `authFetch`, so a mid-session 401 during background sync
  gets no refresh-retry.

---

## File Structure

**Offline engine — `src/lib/offline/`** (one responsibility per file):
- `db.ts` — IndexedDB schema + typed `openDb()`; object stores `products`, `customers`, `orders`, `stockMovements`, `outbox`, `meta`.
- `ids.ts` — `newClientId()` (ULID).
- `money.ts` — `centsToZAR()` / `zarToCents()`.
- `repo.ts` — generic typed repository (`get`/`list`/`put`/`remove`) over a store.
- `outbox.ts` — `enqueue`/`list`(sorted, cap 100)/`remove`.
- `sync.ts` — `runSync()`: drain outbox → `POST /sync` → apply per-op results, map `clientId`→`serverId`.
- `triggers.ts` — `registerSyncTriggers()` (online event, focus, manual).
- `useOnline.ts` — connectivity hook for the UI.
- `types.ts` — shared row/op/result types.

**Session — `src/lib/session/`:**
- `authFetch.ts` — `apiFetch` wrapped with 401→refresh→retry-once.
- `SessionProvider.tsx` — context: `{user, memberships, activeBusinessId}`, `hasPerm()`, route guard.

**Products slice — `src/lib/products/` + `src/app/(merchant)/`:**
- `src/lib/products/store.ts` — Zustand store + optimistic mutations over repo+outbox.
- `src/lib/products/schema.ts` — Zod schema for the product form.
- `src/app/(merchant)/layout.tsx` — authenticated shell (SessionProvider, online indicator, triggers, nav).
- `src/app/(merchant)/products/page.tsx` — list + per-row sync badge.
- `src/app/(merchant)/products/ProductForm.tsx` — create/edit form (RHF+Zod), cost field gated.

**PWA:** `src/app/manifest.ts`, `app/sw.ts` (Serwist worker), `next.config` wiring, `public/` icons.

**Test infra:** `vitest.setup.ts` (imports `fake-indexeddb/auto`).

---

### Task 1: Test infra + dependencies

**Files:**
- Modify: `package.json` (deps + devDeps)
- Create: `vitest.setup.ts`
- Modify: `vitest.config.ts`
- Create: `src/lib/offline/__smoke__.test.ts` (temporary smoke test, deleted at end of task)

**Interfaces:**
- Produces: a Vitest config that supports IndexedDB (via `fake-indexeddb`) globally and jsdom per-file via pragma; installed runtime libs `zustand`, `idb`, `ulid`, `zod`, `react-hook-form`, `@hookform/resolvers`, `@serwist/next`, `serwist`.

- [ ] **Step 1: Install runtime + test deps**

```bash
cd /home/sibnaye/Development/Inyuku
git checkout -b feature/m2b1-merchant-pwa
npm install zustand idb ulid zod react-hook-form @hookform/resolvers @serwist/next serwist
npm install -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb
```
Expected: `package.json` gains the dependencies; install succeeds.

- [ ] **Step 2: Create the global test setup**

`vitest.setup.ts`:
```ts
// Global Vitest setup for the frontend.
// fake-indexeddb/auto installs a working `indexedDB` into the global scope so
// the offline engine's idb code runs in tests (node + jsdom).
import 'fake-indexeddb/auto';
```

- [ ] **Step 3: Wire setupFiles into vitest config**

`vitest.config.ts` (add `setupFiles`; keep `environment: 'node'` default — component tests opt into jsdom per-file):
```ts
import { defineConfig } from 'vitest/config';

// Frontend (Next.js) test scope only — the backend has its own vitest config under server/.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'server', '.next', 'dist'],
  },
});
```

- [ ] **Step 4: Smoke-test that IndexedDB is available**

`src/lib/offline/__smoke__.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('test infra', () => {
  it('provides indexedDB from fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test -- src/lib/offline/__smoke__.test.ts`
Expected: PASS.

- [ ] **Step 6: Delete the smoke test and verify the full suite still passes**

```bash
rm src/lib/offline/__smoke__.test.ts
npm test
```
Expected: existing tests (api-client, auth, i18n) still PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts
git commit -m "chore(m2b1): test infra (fake-indexeddb) + offline/PWA deps"
```

---

### Task 2: Money utilities (ZAR integer cents)

**Files:**
- Create: `src/lib/offline/money.ts`
- Test: `src/lib/offline/money.test.ts`

**Interfaces:**
- Produces: `centsToZAR(cents: number): string`, `zarToCents(input: string): number` (throws `RangeError` on invalid).

- [ ] **Step 1: Write the failing test**

`src/lib/offline/money.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { centsToZAR, zarToCents } from './money';

describe('money', () => {
  it('formats integer cents as ZAR', () => {
    expect(centsToZAR(0)).toBe('R 0.00');
    expect(centsToZAR(1250)).toBe('R 12.50');
    expect(centsToZAR(100000)).toBe('R 1 000.00');
  });

  it('parses ZAR strings to integer cents', () => {
    expect(zarToCents('12.50')).toBe(1250);
    expect(zarToCents('R 12.50')).toBe(1250);
    expect(zarToCents('1 000')).toBe(100000);
    expect(zarToCents('0')).toBe(0);
  });

  it('rejects invalid money input', () => {
    expect(() => zarToCents('abc')).toThrow(RangeError);
    expect(() => zarToCents('12.555')).toThrow(RangeError);
    expect(() => zarToCents('-5')).toThrow(RangeError);
  });

  it('round-trips', () => {
    expect(zarToCents(centsToZAR(98765))).toBe(98765);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/money.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/offline/money.ts`:
```ts
/** Format integer ZAR cents as a display string, e.g. 1250 -> "R 12.50". */
export function centsToZAR(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const rands = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, '0');
  const grouped = rands.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}R ${grouped}.${remainder}`;
}

/** Parse a user-entered ZAR string to integer cents. Throws RangeError on invalid input. */
export function zarToCents(input: string): number {
  const cleaned = input.replace(/[R\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new RangeError(`Invalid ZAR amount: "${input}"`);
  }
  const [rands, frac = ''] = cleaned.split('.');
  const cents = Number(rands) * 100 + Number(frac.padEnd(2, '0'));
  return cents;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/offline/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/money.ts src/lib/offline/money.test.ts
git commit -m "feat(m2b1): ZAR integer-cents money utilities"
```

---

### Task 3: Client IDs (ULID)

**Files:**
- Create: `src/lib/offline/ids.ts`
- Test: `src/lib/offline/ids.test.ts`

**Interfaces:**
- Produces: `newClientId(): string` — a 26-char ULID, time-sortable.

- [ ] **Step 1: Write the failing test**

`src/lib/offline/ids.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newClientId } from './ids';

describe('newClientId', () => {
  it('produces 26-char Crockford-base32 ULIDs', () => {
    const id = newClientId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newClientId()));
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/ids.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/offline/ids.ts`:
```ts
import { ulid } from 'ulid';

/** Mint a client-side, time-sortable, collision-safe id for offline-created entities. */
export function newClientId(): string {
  return ulid();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/offline/ids.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/ids.ts src/lib/offline/ids.test.ts
git commit -m "feat(m2b1): ULID client-id minting"
```

---

### Task 4: IndexedDB schema + shared types

**Files:**
- Create: `src/lib/offline/types.ts`
- Create: `src/lib/offline/db.ts`
- Test: `src/lib/offline/db.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `SyncState = 'pending' | 'synced' | 'conflict' | 'error'`; `EntityName = 'product' | 'customer' | 'order' | 'stock_movement'`; `BaseRow { clientId: string; serverId?: string; _syncState: SyncState; updatedAtLocal: string }`; `ProductRow extends BaseRow { name: string; sellPriceCents: number; costPriceCents?: number; lowStockThreshold?: number; status: 'ACTIVE' | 'ARCHIVED'; imageUrl?: string; pendingImage?: boolean }`; `OutboxOp { clientId: string; entity: EntityName; op: 'create' | 'update' | 'delete'; occurredAt: string; payload: Record<string, unknown> }`.
  - `db.ts`: `openDb(): Promise<IDBPDatabase<InyukuDB>>`; `StoreName` union; the `InyukuDB` schema type. Store keyPath is `clientId` for entity stores and `outbox`; `meta` is a key-value store.

- [ ] **Step 1: Write the failing test**

`src/lib/offline/db.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { openDb } from './db';

describe('openDb', () => {
  it('creates all required object stores', async () => {
    const db = await openDb();
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual(
      ['customers', 'meta', 'orders', 'outbox', 'products', 'stockMovements'].sort(),
    );
    db.close();
  });

  it('stores and reads back a product by clientId', async () => {
    const db = await openDb();
    await db.put('products', {
      clientId: 'p1',
      name: 'Bread',
      sellPriceCents: 1500,
      status: 'ACTIVE',
      _syncState: 'pending',
      updatedAtLocal: '2026-06-21T10:00:00.000Z',
    });
    const row = await db.get('products', 'p1');
    expect(row?.name).toBe('Bread');
    db.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/db.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the types**

`src/lib/offline/types.ts`:
```ts
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
```

- [ ] **Step 4: Implement the db**

`src/lib/offline/db.ts`:
```ts
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
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- src/lib/offline/db.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/types.ts src/lib/offline/db.ts src/lib/offline/db.test.ts
git commit -m "feat(m2b1): IndexedDB schema + offline row/op types"
```

---

### Task 5: Generic repository

**Files:**
- Create: `src/lib/offline/repo.ts`
- Test: `src/lib/offline/repo.test.ts`

**Interfaces:**
- Consumes: `openDb`, `StoreName`, `ProductRow` (Task 4).
- Produces: `makeRepo<T extends { clientId: string }>(store: StoreName)` returning `{ get(clientId): Promise<T | undefined>; list(): Promise<T[]>; put(row: T): Promise<void>; remove(clientId): Promise<void> }`.

- [ ] **Step 1: Write the failing test**

`src/lib/offline/repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeRepo } from './repo';
import { openDb } from './db';
import type { ProductRow } from './types';

const row = (clientId: string, name: string): ProductRow => ({
  clientId, name, sellPriceCents: 100, status: 'ACTIVE',
  _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
});

describe('makeRepo', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    db.close();
  });

  it('puts, gets, lists and removes rows', async () => {
    const repo = makeRepo<ProductRow>('products');
    await repo.put(row('a', 'Apple'));
    await repo.put(row('b', 'Bread'));
    expect((await repo.get('a'))?.name).toBe('Apple');
    expect((await repo.list()).map((r) => r.clientId).sort()).toEqual(['a', 'b']);
    await repo.remove('a');
    expect(await repo.get('a')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/repo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/offline/repo.ts`:
```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/offline/repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/repo.ts src/lib/offline/repo.test.ts
git commit -m "feat(m2b1): generic IndexedDB repository"
```

---

### Task 6: Outbox queue

**Files:**
- Create: `src/lib/offline/outbox.ts`
- Test: `src/lib/offline/outbox.test.ts`

**Interfaces:**
- Consumes: `openDb` (Task 4), `OutboxOp` (Task 4).
- Produces: `enqueue(op: OutboxOp): Promise<void>`; `listBatch(): Promise<OutboxOp[]>` (sorted ascending by `occurredAt`, capped at 100); `remove(clientId: string): Promise<void>`; `count(): Promise<number>`.

- [ ] **Step 1: Write the failing test**

`src/lib/offline/outbox.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, listBatch, remove, count } from './outbox';
import { openDb } from './db';
import type { OutboxOp } from './types';

const op = (clientId: string, occurredAt: string): OutboxOp => ({
  clientId, entity: 'product', op: 'create', occurredAt, payload: {},
});

describe('outbox', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('outbox');
    db.close();
  });

  it('lists ops sorted ascending by occurredAt', async () => {
    await enqueue(op('c', '2026-06-21T03:00:00.000Z'));
    await enqueue(op('a', '2026-06-21T01:00:00.000Z'));
    await enqueue(op('b', '2026-06-21T02:00:00.000Z'));
    expect((await listBatch()).map((o) => o.clientId)).toEqual(['a', 'b', 'c']);
  });

  it('caps the batch at 100', async () => {
    for (let i = 0; i < 105; i++) {
      await enqueue(op(`k${i}`, `2026-06-21T00:00:${String(i % 60).padStart(2, '0')}.000Z`));
    }
    expect((await listBatch()).length).toBe(100);
    expect(await count()).toBe(105);
  });

  it('removes an op by clientId', async () => {
    await enqueue(op('a', '2026-06-21T01:00:00.000Z'));
    await remove('a');
    expect(await count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/outbox.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/offline/outbox.ts`:
```ts
import { openDb } from './db';
import type { OutboxOp } from './types';

const MAX_BATCH = 100;

export async function enqueue(op: OutboxOp): Promise<void> {
  const db = await openDb();
  await db.put('outbox', op);
  db.close();
}

export async function listBatch(): Promise<OutboxOp[]> {
  const db = await openDb();
  const all = (await db.getAll('outbox')) as OutboxOp[];
  db.close();
  all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return all.slice(0, MAX_BATCH);
}

export async function remove(clientId: string): Promise<void> {
  const db = await openDb();
  await db.delete('outbox', clientId);
  db.close();
}

export async function count(): Promise<number> {
  const db = await openDb();
  const n = await db.count('outbox');
  db.close();
  return n;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/offline/outbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/outbox.ts src/lib/offline/outbox.test.ts
git commit -m "feat(m2b1): append-only sync outbox"
```

---

### Task 7: Sync engine (the convergence core)

**Files:**
- Create: `src/lib/offline/sync.ts`
- Test: `src/lib/offline/sync.test.ts`

**Interfaces:**
- Consumes: `listBatch`/`remove` (Task 6), `makeRepo` (Task 5), `postJson` from `@/lib/api-client`, `ProductRow`/`OutboxOp` (Task 4).
- Produces:
  - `SyncOpResult { clientId: string; status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED'; serverId?: string; error?: { code: string; message: string } }`
  - `SyncSummary { applied: number; duplicate: number; conflict: number; rejected: number }`
  - `runSync(businessId: string): Promise<SyncSummary>` — posts `{ ops }` to `/v1/businesses/${businessId}/sync`, then for each result updates the matching `products` row and drains the outbox op. APPLIED/DUPLICATE → set `serverId`, `_syncState:'synced'`, remove op. CONFLICT → set `_syncState:'conflict'`, remove op (server is authoritative; refetch is a later concern). REJECTED → set `_syncState:'error'`, **keep** the op. Returns counts. No-op (returns zeroed summary) when the outbox is empty.

- [ ] **Step 1: Write the failing test**

`src/lib/offline/sync.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { runSync } from './sync';
import { enqueue, count } from './outbox';
import { makeRepo } from './repo';
import { openDb } from './db';
import type { ProductRow, OutboxOp } from './types';

const products = makeRepo<ProductRow>('products');

async function seedProduct(clientId: string): Promise<void> {
  await products.put({
    clientId, name: 'X', sellPriceCents: 100, status: 'ACTIVE',
    _syncState: 'pending', updatedAtLocal: '2026-06-21T10:00:00.000Z',
  });
  const op: OutboxOp = {
    clientId, entity: 'product', op: 'create',
    occurredAt: '2026-06-21T10:00:00.000Z', payload: { name: 'X', sellPriceCents: 100 },
  };
  await enqueue(op);
}

function mockSync(results: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ ok: true, data: { results } }),
  }));
}

describe('runSync', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns a zeroed summary when the outbox is empty', async () => {
    expect(await runSync('biz1')).toEqual({ applied: 0, duplicate: 0, conflict: 0, rejected: 0 });
  });

  it('APPLIED maps serverId, marks synced, drains the op', async () => {
    await seedProduct('p1');
    mockSync([{ clientId: 'p1', status: 'APPLIED', serverId: 'srv_1' }]);
    const summary = await runSync('biz1');
    expect(summary.applied).toBe(1);
    const row = await products.get('p1');
    expect(row?.serverId).toBe('srv_1');
    expect(row?._syncState).toBe('synced');
    expect(await count()).toBe(0);
  });

  it('DUPLICATE is treated as applied and drained', async () => {
    await seedProduct('p2');
    mockSync([{ clientId: 'p2', status: 'DUPLICATE', serverId: 'srv_2' }]);
    const summary = await runSync('biz1');
    expect(summary.duplicate).toBe(1);
    expect((await products.get('p2'))?._syncState).toBe('synced');
    expect(await count()).toBe(0);
  });

  it('CONFLICT marks the row conflict and drains the op (server wins)', async () => {
    await seedProduct('p3');
    mockSync([{ clientId: 'p3', status: 'CONFLICT', serverId: 'srv_3' }]);
    const summary = await runSync('biz1');
    expect(summary.conflict).toBe(1);
    expect((await products.get('p3'))?._syncState).toBe('conflict');
    expect(await count()).toBe(0);
  });

  it('REJECTED marks the row error and KEEPS the op for retry', async () => {
    await seedProduct('p4');
    mockSync([{ clientId: 'p4', status: 'REJECTED', error: { code: 'VALIDATION', message: 'bad' } }]);
    const summary = await runSync('biz1');
    expect(summary.rejected).toBe(1);
    expect((await products.get('p4'))?._syncState).toBe('error');
    expect(await count()).toBe(1);
  });

  it('converges a mixed batch and posts to the tenant-scoped endpoint', async () => {
    await seedProduct('a');
    await seedProduct('b');
    await seedProduct('c');
    mockSync([
      { clientId: 'a', status: 'APPLIED', serverId: 'sa' },
      { clientId: 'b', status: 'CONFLICT', serverId: 'sb' },
      { clientId: 'c', status: 'REJECTED', error: { code: 'X', message: 'y' } },
    ]);
    const summary = await runSync('biz9');
    expect(summary).toEqual({ applied: 1, duplicate: 0, conflict: 1, rejected: 1 });
    expect(await count()).toBe(1); // only the rejected op remains
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/businesses/biz9/sync');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/sync.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/offline/sync.ts`:
```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/offline/sync.test.ts`
Expected: PASS (all 6 cases incl. the mixed-batch convergence test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/sync.ts src/lib/offline/sync.test.ts
git commit -m "feat(m2b1): sync-replay engine (per-op convergence over /sync)"
```

---

### Task 8: authFetch (401 → refresh → retry once)

**Files:**
- Create: `src/lib/session/authFetch.ts`
- Test: `src/lib/session/authFetch.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` from `@/lib/api-client`.
- Produces: `authFetch<T>(path: string, opts?: RequestInit): Promise<T>` — calls `apiFetch`; on `ApiError` with `status === 401`, calls `POST /v1/auth/refresh` once and retries the original call once; if refresh fails, rethrows the original 401.

- [ ] **Step 1: Write the failing test**

`src/lib/session/authFetch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFetch } from './authFetch';
import * as client from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';

describe('authFetch', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns data when the first call succeeds', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValueOnce({ id: 'x' });
    expect(await authFetch('/v1/foo')).toEqual({ id: 'x' });
  });

  it('on 401 refreshes once then retries successfully', async () => {
    const spy = vi.spyOn(client, 'apiFetch');
    spy.mockRejectedValueOnce(new ApiError('AUTH', 'expired', 401)); // original
    spy.mockResolvedValueOnce({ ok: true });                         // refresh
    spy.mockResolvedValueOnce({ id: 'y' });                          // retry
    expect(await authFetch('/v1/foo')).toEqual({ id: 'y' });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[1][0]).toBe('/v1/auth/refresh');
  });

  it('rethrows the original 401 when refresh fails', async () => {
    const spy = vi.spyOn(client, 'apiFetch');
    spy.mockRejectedValueOnce(new ApiError('AUTH', 'expired', 401)); // original
    spy.mockRejectedValueOnce(new ApiError('AUTH', 'no refresh', 401)); // refresh fails
    await expect(authFetch('/v1/foo')).rejects.toMatchObject({ status: 401 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not refresh on non-401 errors', async () => {
    const spy = vi.spyOn(client, 'apiFetch');
    spy.mockRejectedValueOnce(new ApiError('VALIDATION', 'bad', 400));
    await expect(authFetch('/v1/foo')).rejects.toMatchObject({ status: 400 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/session/authFetch.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/session/authFetch.ts`:
```ts
import { apiFetch, ApiError } from '@/lib/api-client';

/** apiFetch with a single transparent refresh-and-retry on a 401. */
export async function authFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      try {
        await apiFetch('/v1/auth/refresh', { method: 'POST' });
      } catch {
        throw err; // refresh failed — surface the original 401
      }
      return await apiFetch<T>(path, opts);
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/session/authFetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session/authFetch.ts src/lib/session/authFetch.test.ts
git commit -m "feat(m2b1): authFetch with 401 refresh-and-retry"
```

---

### Task 9: SessionProvider + hasPerm

**Files:**
- Create: `src/lib/session/SessionProvider.tsx`
- Test: `src/lib/session/SessionProvider.test.tsx`

**Interfaces:**
- Consumes: `getMe`, `MeResponse` from `@/lib/auth`.
- Produces:
  - `SessionProvider` (client component) — on mount calls `getMe()`; while loading renders a fallback; on success provides context; on failure calls `onUnauthenticated?.()`.
  - `useSession(): { user; memberships; activeBusinessId } ` (throws if used outside provider).
  - `hasPerm(permission: string): boolean` from the active membership's `permissions`.
  - `activeBusinessId` = the single membership's `businessId` (first membership when multiple — multi-business switching is a B2 concern).

- [ ] **Step 1: Write the failing test**

`src/lib/session/SessionProvider.test.tsx`:
```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionProvider';
import * as auth from '@/lib/auth';

const ME = {
  user: { id: 'u1', email: 'a@b.c', name: 'Nomsa', phone: null, status: 'ACTIVE' },
  memberships: [{ businessId: 'biz1', role: 'MERCHANT_OWNER', permissions: ['catalog:read', 'catalog:read_cost'] }],
};

function Probe() {
  const { activeBusinessId, hasPerm } = useSession();
  return (
    <div>
      <span>biz:{activeBusinessId}</span>
      <span>cost:{String(hasPerm('catalog:read_cost'))}</span>
      <span>write:{String(hasPerm('catalog:write'))}</span>
    </div>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('loads the session and exposes activeBusinessId + hasPerm', async () => {
    vi.spyOn(auth, 'getMe').mockResolvedValueOnce(ME);
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByText('biz:biz1')).toBeInTheDocument());
    expect(screen.getByText('cost:true')).toBeInTheDocument();
    expect(screen.getByText('write:false')).toBeInTheDocument();
  });

  it('invokes onUnauthenticated when getMe fails', async () => {
    vi.spyOn(auth, 'getMe').mockRejectedValueOnce(new Error('401'));
    const onUnauth = vi.fn();
    render(<SessionProvider onUnauthenticated={onUnauth}><Probe /></SessionProvider>);
    await waitFor(() => expect(onUnauth).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/session/SessionProvider.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/session/SessionProvider.tsx`:
```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, type MeResponse } from '@/lib/auth';

interface SessionValue {
  user: MeResponse['user'];
  memberships: MeResponse['memberships'];
  activeBusinessId: string;
  hasPerm: (permission: string) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

export function SessionProvider({
  children,
  onUnauthenticated,
  fallback = null,
}: {
  children: ReactNode;
  onUnauthenticated?: () => void;
  fallback?: ReactNode;
}) {
  const [value, setValue] = useState<SessionValue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        const active = me.memberships[0];
        const perms = new Set(active?.permissions ?? []);
        setValue({
          user: me.user,
          memberships: me.memberships,
          activeBusinessId: active?.businessId ?? '',
          hasPerm: (p) => perms.has(p),
        });
      })
      .catch(() => {
        if (!cancelled) onUnauthenticated?.();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onUnauthenticated]);

  if (loading || !value) return <>{fallback}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/session/SessionProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session/SessionProvider.tsx src/lib/session/SessionProvider.test.tsx
git commit -m "feat(m2b1): SessionProvider + hasPerm (RBAC context)"
```

---

### Task 10: Products store (optimistic, local-first)

**Files:**
- Create: `src/lib/products/store.ts`
- Test: `src/lib/products/store.test.ts`

**Interfaces:**
- Consumes: `makeRepo` (Task 5), `enqueue` (Task 6), `newClientId` (Task 3), `ProductRow` (Task 4).
- Produces: a Zustand store `useProductStore` with state `{ items: ProductRow[] }` and actions:
  - `load(): Promise<void>` — hydrate `items` from the repo (ACTIVE + ARCHIVED both stored; UI filters).
  - `create(input: { name; sellPriceCents; costPriceCents?; lowStockThreshold? }): Promise<string>` — mint clientId, write `_syncState:'pending'` row, enqueue a `product/create` op, refresh `items`, return clientId.
  - `update(clientId, patch): Promise<void>` — merge patch, set `_syncState:'pending'`, enqueue a `product/update` op, refresh.
  - `archive(clientId): Promise<void>` — set `status:'ARCHIVED'`, `_syncState:'pending'`, enqueue an `update` op carrying `{ status: 'ARCHIVED' }`, refresh.
- Note: `occurredAt` on every op = current ISO timestamp; `payload` carries only server-relevant fields (never `_syncState`).

- [ ] **Step 1: Write the failing test**

`src/lib/products/store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useProductStore } from './store';
import { openDb } from '@/lib/offline/db';
import { listBatch } from '@/lib/offline/outbox';

describe('useProductStore', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
  });

  it('create writes a pending row and enqueues a create op', async () => {
    const clientId = await useProductStore.getState().create({ name: 'Maize', sellPriceCents: 2500 });
    const items = useProductStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ clientId, name: 'Maize', sellPriceCents: 2500, _syncState: 'pending', status: 'ACTIVE' });
    const ops = await listBatch();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ clientId, entity: 'product', op: 'create' });
    expect(ops[0].payload).toMatchObject({ name: 'Maize', sellPriceCents: 2500 });
    expect(ops[0].payload).not.toHaveProperty('_syncState');
  });

  it('update merges fields and enqueues an update op', async () => {
    const clientId = await useProductStore.getState().create({ name: 'Rice', sellPriceCents: 100 });
    await useProductStore.getState().update(clientId, { sellPriceCents: 150 });
    expect(useProductStore.getState().items[0].sellPriceCents).toBe(150);
    expect((await listBatch()).filter((o) => o.op === 'update')).toHaveLength(1);
  });

  it('archive flips status and enqueues an update op carrying the archived status', async () => {
    const clientId = await useProductStore.getState().create({ name: 'Soap', sellPriceCents: 999 });
    await useProductStore.getState().archive(clientId);
    expect(useProductStore.getState().items[0].status).toBe('ARCHIVED');
    const archiveOp = (await listBatch()).find((o) => o.payload.status === 'ARCHIVED');
    expect(archiveOp).toBeDefined();
  });

  it('load hydrates items from IndexedDB', async () => {
    await useProductStore.getState().create({ name: 'Tea', sellPriceCents: 4000 });
    useProductStore.setState({ items: [] });
    await useProductStore.getState().load();
    expect(useProductStore.getState().items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/products/store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/products/store.ts`:
```ts
import { create as createStore } from 'zustand';
import { makeRepo } from '@/lib/offline/repo';
import { enqueue } from '@/lib/offline/outbox';
import { newClientId } from '@/lib/offline/ids';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');

export interface ProductCreateInput {
  name: string;
  sellPriceCents: number;
  costPriceCents?: number;
  lowStockThreshold?: number;
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
    await repo.put(row);
    await enqueue({ clientId, entity: 'product', op: 'create', occurredAt, payload: { ...input } });
    set({ items: await repo.list() });
    return clientId;
  },

  async update(clientId, patch) {
    const existing = await repo.get(clientId);
    if (!existing) return;
    const occurredAt = nowIso();
    await repo.put({ ...existing, ...patch, _syncState: 'pending', updatedAtLocal: occurredAt });
    await enqueue({ clientId, entity: 'product', op: 'update', occurredAt, payload: { ...patch } });
    set({ items: await repo.list() });
  },

  async archive(clientId) {
    const existing = await repo.get(clientId);
    if (!existing) return;
    const occurredAt = nowIso();
    await repo.put({ ...existing, status: 'ARCHIVED', _syncState: 'pending', updatedAtLocal: occurredAt });
    await enqueue({ clientId, entity: 'product', op: 'update', occurredAt, payload: { status: 'ARCHIVED' } });
    set({ items: await repo.list() });
  },
}));
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/products/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/products/store.ts src/lib/products/store.test.ts
git commit -m "feat(m2b1): optimistic local-first products store"
```

---

### Task 11: Connectivity hook + sync triggers

**Files:**
- Create: `src/lib/offline/useOnline.ts`
- Create: `src/lib/offline/triggers.ts`
- Test: `src/lib/offline/triggers.test.ts`

**Interfaces:**
- Consumes: `runSync` (Task 7).
- Produces:
  - `useOnline(): boolean` — React hook tracking `navigator.onLine` + `online`/`offline` events.
  - `registerSyncTriggers(businessId: string, onSummary?: (s) => void): () => void` — attaches an `online`-event listener and a `visibilitychange`→visible listener that each call `runSync(businessId)`; returns an unsubscribe function. Guards against concurrent runs with an in-flight flag.

- [ ] **Step 1: Write the failing test**

`src/lib/offline/triggers.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerSyncTriggers } from './triggers';
import * as sync from './sync';

describe('registerSyncTriggers', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('runs sync on the online event and stops after unsubscribe', async () => {
    const spy = vi.spyOn(sync, 'runSync').mockResolvedValue({ applied: 0, duplicate: 0, conflict: 0, rejected: 0 });
    const unsub = registerSyncTriggers('biz1');
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(spy).toHaveBeenCalledWith('biz1');
    spy.mockClear();
    unsub();
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/offline/triggers.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

`src/lib/offline/useOnline.ts`:
```ts
'use client';

import { useEffect, useState } from 'react';

/** Tracks browser connectivity for the offline/online UI indicator. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
```

- [ ] **Step 4: Implement the triggers**

`src/lib/offline/triggers.ts`:
```ts
import { runSync, type SyncSummary } from './sync';

/** Attach sync triggers (reconnect + tab-visible). Returns an unsubscribe fn. */
export function registerSyncTriggers(
  businessId: string,
  onSummary?: (s: SyncSummary) => void,
): () => void {
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await runSync(businessId);
      onSummary?.(summary);
    } catch {
      // network/refresh failures are non-fatal; the outbox is retried on the next trigger
    } finally {
      inFlight = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick();
  };

  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- src/lib/offline/triggers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/useOnline.ts src/lib/offline/triggers.ts src/lib/offline/triggers.test.ts
git commit -m "feat(m2b1): connectivity hook + sync triggers"
```

---

### Task 12: Products form (React Hook Form + Zod, cost-split)

**Files:**
- Create: `src/lib/products/schema.ts`
- Create: `src/app/(merchant)/products/ProductForm.tsx`
- Test: `src/app/(merchant)/products/ProductForm.test.tsx`

**Interfaces:**
- Consumes: `useSession` (Task 9), `useProductStore` (Task 10), `zarToCents` (Task 2).
- Produces:
  - `schema.ts`: `productFormSchema` (Zod) with `name` (min 1), `sellPrice` (string, parsed via `zarToCents`), optional `costPrice`; `ProductFormValues` type.
  - `ProductForm` (client component) props `{ onDone?: () => void }`: renders name + sell-price inputs always; renders the cost-price input **only when** `hasPerm('catalog:read_cost')`; on submit calls `useProductStore.create({ name, sellPriceCents, costPriceCents? })`.

- [ ] **Step 1: Write the failing test**

`src/app/(merchant)/products/ProductForm.test.tsx`:
```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductForm } from './ProductForm';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: (p: string) => perms.includes(p),
  });
}

describe('ProductForm', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('hides the cost field for staff (no catalog:read_cost)', () => {
    mockSession(['catalog:write']);
    render(<ProductForm />);
    expect(screen.queryByLabelText(/cost price/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/sell price/i)).toBeInTheDocument();
  });

  it('shows the cost field for owners and creates with parsed cents', async () => {
    mockSession(['catalog:write', 'catalog:read_cost']);
    const createSpy = vi.spyOn(useProductStore.getState(), 'create').mockResolvedValue('cid');
    render(<ProductForm />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Bread');
    await userEvent.type(screen.getByLabelText(/sell price/i), '15.00');
    await userEvent.type(screen.getByLabelText(/cost price/i), '9.50');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 950 }),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "src/app/(merchant)/products/ProductForm.test.tsx"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the schema**

`src/lib/products/schema.ts`:
```ts
import { z } from 'zod';

export const productFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sellPrice: z.string().min(1, 'Sell price is required'),
  costPrice: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
```

- [ ] **Step 4: Implement the form**

`src/app/(merchant)/products/ProductForm.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { zarToCents } from '@/lib/offline/money';
import { productFormSchema, type ProductFormValues } from '@/lib/products/schema';

export function ProductForm({ onDone }: { onDone?: () => void }) {
  const { hasPerm } = useSession();
  const canSeeCost = hasPerm('catalog:read_cost');
  const create = useProductStore((s) => s.create);
  const { register, handleSubmit, reset, formState } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
  });

  async function onSubmit(values: ProductFormValues) {
    await create({
      name: values.name,
      sellPriceCents: zarToCents(values.sellPrice),
      ...(canSeeCost && values.costPrice ? { costPriceCents: zarToCents(values.costPrice) } : {}),
    });
    reset();
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">Name</label>
        <input id="name" {...register('name')} className="mt-1 w-full rounded border px-3 py-2" />
        {formState.errors.name && <p className="text-sm text-red-600">{formState.errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="sellPrice" className="block text-sm font-medium">Sell price (R)</label>
        <input id="sellPrice" inputMode="decimal" {...register('sellPrice')} className="mt-1 w-full rounded border px-3 py-2" />
        {formState.errors.sellPrice && <p className="text-sm text-red-600">{formState.errors.sellPrice.message}</p>}
      </div>
      {canSeeCost && (
        <div>
          <label htmlFor="costPrice" className="block text-sm font-medium">Cost price (R)</label>
          <input id="costPrice" inputMode="decimal" {...register('costPrice')} className="mt-1 w-full rounded border px-3 py-2" />
        </div>
      )}
      <button type="submit" disabled={formState.isSubmitting} className="rounded bg-emerald-600 px-4 py-2 text-white">
        Save
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- "src/app/(merchant)/products/ProductForm.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/lib/products/schema.ts" "src/app/(merchant)/products/ProductForm.tsx" "src/app/(merchant)/products/ProductForm.test.tsx"
git commit -m "feat(m2b1): product form (RHF+Zod) with cost-split"
```

---

### Task 13: Products list page + sync badge + merchant layout

**Files:**
- Create: `src/lib/products/SyncBadge.tsx`
- Create: `src/app/(merchant)/products/page.tsx`
- Create: `src/app/(merchant)/layout.tsx`
- Test: `src/app/(merchant)/products/page.test.tsx`

**Interfaces:**
- Consumes: `useProductStore` (Task 10), `useSession` (Task 9), `useOnline`/`registerSyncTriggers` (Task 11), `centsToZAR` (Task 2), `ProductRow._syncState` (Task 4).
- Produces:
  - `SyncBadge({ state }: { state: SyncState })` — small status pill (`pending`/`synced`/`conflict`/`error`).
  - `ProductsPage` (client) — calls `load()` on mount; renders ACTIVE products with name, `centsToZAR(sellPriceCents)`, a sync badge, and cost (`centsToZAR(costPriceCents)`) only when `hasPerm('catalog:read_cost')` and present; embeds `<ProductForm>`.
  - `MerchantLayout` — wraps children in `<SessionProvider>` (redirect to `/login` on unauth), registers sync triggers for `activeBusinessId`, shows an online/offline indicator.

- [ ] **Step 1: Write the failing test**

`src/app/(merchant)/products/page.test.tsx`:
```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProductsPage from './page';
import * as sessionMod from '@/lib/session/SessionProvider';
import { useProductStore } from '@/lib/products/store';
import { openDb } from '@/lib/offline/db';

function mockSession(perms: string[]) {
  vi.spyOn(sessionMod, 'useSession').mockReturnValue({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [], activeBusinessId: 'biz1', hasPerm: (p: string) => perms.includes(p),
  });
}

describe('ProductsPage', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    await db.clear('outbox');
    db.close();
    useProductStore.setState({ items: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders active products with ZAR prices; hides cost for staff', async () => {
    mockSession(['catalog:read', 'catalog:write']);
    await useProductStore.getState().create({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 900 });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());
    expect(screen.getByText('R 15.00')).toBeInTheDocument();
    expect(screen.queryByText('R 9.00')).not.toBeInTheDocument(); // cost hidden for staff
  });

  it('shows cost for owners', async () => {
    mockSession(['catalog:read', 'catalog:write', 'catalog:read_cost']);
    await useProductStore.getState().create({ name: 'Bread', sellPriceCents: 1500, costPriceCents: 900 });
    render(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('R 9.00')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- "src/app/(merchant)/products/page.test.tsx"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the sync badge**

`src/lib/products/SyncBadge.tsx`:
```tsx
import type { SyncState } from '@/lib/offline/types';

const LABEL: Record<SyncState, string> = {
  pending: 'Pending', synced: 'Synced', conflict: 'Conflict', error: 'Failed',
};
const COLOR: Record<SyncState, string> = {
  pending: 'bg-amber-100 text-amber-800',
  synced: 'bg-emerald-100 text-emerald-800',
  conflict: 'bg-orange-100 text-orange-800',
  error: 'bg-red-100 text-red-800',
};

export function SyncBadge({ state }: { state: SyncState }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${COLOR[state]}`}>{LABEL[state]}</span>;
}
```

- [ ] **Step 4: Implement the products page**

`src/app/(merchant)/products/page.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import { useProductStore } from '@/lib/products/store';
import { useSession } from '@/lib/session/SessionProvider';
import { centsToZAR } from '@/lib/offline/money';
import { SyncBadge } from '@/lib/products/SyncBadge';
import { ProductForm } from './ProductForm';

export default function ProductsPage() {
  const { hasPerm } = useSession();
  const items = useProductStore((s) => s.items);
  const load = useProductStore((s) => s.load);
  const canSeeCost = hasPerm('catalog:read_cost');

  useEffect(() => {
    void load();
  }, [load]);

  const active = items.filter((p) => p.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Products</h1>
      <ProductForm />
      <ul className="divide-y rounded border">
        {active.map((p) => (
          <li key={p.clientId} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-gray-600">
                {centsToZAR(p.sellPriceCents)}
                {canSeeCost && p.costPriceCents != null && (
                  <span className="ml-2 text-gray-400">cost {centsToZAR(p.costPriceCents)}</span>
                )}
              </p>
            </div>
            <SyncBadge state={p._syncState} />
          </li>
        ))}
        {active.length === 0 && <li className="px-4 py-6 text-center text-gray-500">No products yet</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Implement the merchant layout**

`src/app/(merchant)/layout.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SessionProvider, useSession } from '@/lib/session/SessionProvider';
import { registerSyncTriggers } from '@/lib/offline/triggers';
import { useOnline } from '@/lib/offline/useOnline';

function MerchantShell({ children }: { children: React.ReactNode }) {
  const { activeBusinessId } = useSession();
  const online = useOnline();

  useEffect(() => {
    if (!activeBusinessId) return;
    return registerSyncTriggers(activeBusinessId);
  }, [activeBusinessId]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className={`mb-4 rounded px-3 py-1 text-sm ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
        {online ? 'Online' : 'Offline — changes will sync when you reconnect'}
      </div>
      {children}
    </div>
  );
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <SessionProvider
      onUnauthenticated={() => router.push('/login')}
      fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}
    >
      <MerchantShell>{children}</MerchantShell>
    </SessionProvider>
  );
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- "src/app/(merchant)/products/page.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/lib/products/SyncBadge.tsx" "src/app/(merchant)/products/page.tsx" "src/app/(merchant)/layout.tsx" "src/app/(merchant)/products/page.test.tsx"
git commit -m "feat(m2b1): products list page + sync badge + merchant layout"
```

---

### Task 14: Deferred image upload (online-only)

**Files:**
- Create: `src/lib/products/image.ts`
- Test: `src/lib/products/image.test.ts`

**Interfaces:**
- Consumes: `makeRepo` (Task 5), `authFetch` (Task 8), `ProductRow` (Task 4).
- Produces: `uploadProductImage(clientId: string, file: File, businessId: string): Promise<{ uploaded: boolean }>` — if the product row has no `serverId` (not yet synced) **or** `navigator.onLine === false`, mark `pendingImage: true` and return `{ uploaded: false }` (defer). Otherwise POST multipart to `/v1/businesses/${businessId}/products/${serverId}/image`, store the returned `imageUrl`, clear `pendingImage`, return `{ uploaded: true }`.

- [ ] **Step 1: Write the failing test**

`src/lib/products/image.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadProductImage } from './image';
import { makeRepo } from '@/lib/offline/repo';
import { openDb } from '@/lib/offline/db';
import * as authMod from '@/lib/session/authFetch';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');
const file = new File(['x'], 'a.png', { type: 'image/png' });

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function put(row: Partial<ProductRow> & { clientId: string }) {
  await repo.put({ name: 'P', sellPriceCents: 1, status: 'ACTIVE', _syncState: 'synced', updatedAtLocal: 'x', ...row });
}

describe('uploadProductImage', () => {
  beforeEach(async () => {
    const db = await openDb();
    await db.clear('products');
    db.close();
    setOnline(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('defers when the product is not yet synced (no serverId)', async () => {
    await put({ clientId: 'p1' });
    const res = await uploadProductImage('p1', file, 'biz1');
    expect(res).toEqual({ uploaded: false });
    expect((await repo.get('p1'))?.pendingImage).toBe(true);
  });

  it('defers when offline', async () => {
    await put({ clientId: 'p2', serverId: 'srv2' });
    setOnline(false);
    const res = await uploadProductImage('p2', file, 'biz1');
    expect(res).toEqual({ uploaded: false });
    expect((await repo.get('p2'))?.pendingImage).toBe(true);
  });

  it('uploads when synced and online, storing imageUrl', async () => {
    await put({ clientId: 'p3', serverId: 'srv3', pendingImage: true });
    const spy = vi.spyOn(authMod, 'authFetch').mockResolvedValue({ imageUrl: 'https://cdn/x.png' });
    const res = await uploadProductImage('p3', file, 'biz1');
    expect(res).toEqual({ uploaded: true });
    expect(spy.mock.calls[0][0]).toBe('/v1/businesses/biz1/products/srv3/image');
    const row = await repo.get('p3');
    expect(row?.imageUrl).toBe('https://cdn/x.png');
    expect(row?.pendingImage).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/products/image.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/products/image.ts`:
```ts
import { makeRepo } from '@/lib/offline/repo';
import { authFetch } from '@/lib/session/authFetch';
import type { ProductRow } from '@/lib/offline/types';

const repo = makeRepo<ProductRow>('products');

/** Upload a product image when the product is synced and the device is online; otherwise defer. */
export async function uploadProductImage(
  clientId: string,
  file: File,
  businessId: string,
): Promise<{ uploaded: boolean }> {
  const row = await repo.get(clientId);
  if (!row) return { uploaded: false };

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!row.serverId || offline) {
    await repo.put({ ...row, pendingImage: true });
    return { uploaded: false };
  }

  const form = new FormData();
  form.append('file', file);
  const { imageUrl } = await authFetch<{ imageUrl: string }>(
    `/v1/businesses/${businessId}/products/${row.serverId}/image`,
    { method: 'POST', body: form },
  );
  await repo.put({ ...row, imageUrl, pendingImage: false });
  return { uploaded: true };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/products/image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/products/image.ts src/lib/products/image.test.ts
git commit -m "feat(m2b1): deferred (online-only) product image upload"
```

---

### Task 15: PWA shell — manifest + Serwist Service Worker

**Files:**
- Create: `src/app/manifest.ts`
- Create: `src/app/sw.ts`
- Modify: `next.config.ts` (wrap with `@serwist/next`)
- Test: `src/app/manifest.test.ts`

**Interfaces:**
- Produces: a Next.js metadata-route `manifest()` (installable: `name`, `short_name`, `start_url`, `display: 'standalone'`, `theme_color`, icons), a Serwist service worker entry caching the app shell + static assets, and `next.config` wired so `next build` emits `public/sw.js`.

- [ ] **Step 1: Write the failing test**

`src/app/manifest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import manifest from './manifest';

describe('web app manifest', () => {
  it('is installable (standalone, start_url, icons)', () => {
    const m = manifest();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/products');
    expect(m.name).toMatch(/Inyuku/i);
    expect((m.icons ?? []).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/app/manifest.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the manifest**

`src/app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Inyuku Merchant',
    short_name: 'Inyuku',
    description: 'Run your shop — catalog, stock, orders, offline.',
    start_url: '/products',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#059669',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

- [ ] **Step 4: Add placeholder PWA icons**

```bash
mkdir -p public/icons
# Use any existing brand PNG as the source; these two sizes are required for installability.
# If no source exists, generate solid-colour placeholders so the build succeeds:
node -e "const fs=require('fs');const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');fs.writeFileSync('public/icons/icon-192.png',b);fs.writeFileSync('public/icons/icon-512.png',b);"
```
Expected: `public/icons/icon-192.png` and `icon-512.png` exist. (Replace with real branded icons before GA.)

- [ ] **Step 5: Implement the service worker**

`src/app/sw.ts`:
```ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: ReadonlyArray<{ url: string; revision: string | null }> };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 6: Wire next.config**

`next.config.ts` (wrap the existing config; preserve the current Sentry/next-intl wrapping order — Serwist is the innermost wrapper around the base config, applied before `withSentryConfig`):
```ts
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

// Apply withSerwist to the existing base config object, keeping the established
// next-intl + Sentry wrappers in their current order.
```
Implementation note: locate the current default export in `next.config.ts`, wrap the base config object with `withSerwist(...)` before it is passed to the existing `withNextIntl` / `withSentryConfig` wrappers, and add `sw.js` + `swe-worker-*.js` to `.gitignore` (generated artifacts under `public/`).

- [ ] **Step 7: Run the manifest test + verify a production build emits the SW**

```bash
npm test -- src/app/manifest.test.ts
npm run build
ls public/sw.js
```
Expected: manifest test PASS; `npm run build` succeeds; `public/sw.js` exists.

- [ ] **Step 8: Commit**

```bash
git add "src/app/manifest.ts" "src/app/sw.ts" next.config.ts public/icons .gitignore "src/app/manifest.test.ts"
git commit -m "feat(m2b1): installable PWA shell (manifest + Serwist service worker)"
```

---

### Task 16: Full gate + STOP for validation

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Run the complete frontend gate**

```bash
cd /home/sibnaye/Development/Inyuku
npm run lint
npm run typecheck
npm test
npm run build
```
Expected: lint clean; typecheck clean; **all** tests pass (existing M1-C tests + the new money/ids/db/repo/outbox/sync/authFetch/session/store/triggers/ProductForm/page/image/manifest suites); build succeeds and emits `public/sw.js`.

- [ ] **Step 2: Manual smoke (optional but recommended)**

```bash
npm run dev
# Visit http://localhost:3000/products (after logging in via /login).
# Create a product offline (DevTools → Network → Offline): it appears with a "Pending" badge.
# Go back online: the sync trigger drains the outbox; badge flips to "Synced".
```
Expected: offline create works; reconnect syncs; cost field hidden for staff logins.

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feature/m2b1-merchant-pwa
gh pr create --title "M2-B1: merchant PWA foundation + offline engine + products slice" \
  --body "Implements the M2-B1 design (docs/superpowers/specs/2026-06-21-m2b1-merchant-pwa-foundation-design.md): installable PWA shell, custom thin local-first sync engine over the frozen /sync contract, session/RBAC context, and the products vertical slice with cost-split. Orders/customers/stock/dashboard/onboarding are M2-B2."
```

- [ ] **Step 4: STOP for validation**

Confirm CI goes green on GitHub (check actual PR checks, not just local gates). **Do NOT merge and do NOT start M2-B2** until the user has reviewed. M2-B2 (orders, customers, stock-adjustment, dashboard, onboarding wizard) reuses this engine and gets its own plan.

---

## Self-Review

**1. Spec coverage:**
- PWA shell (SW + manifest) → Task 15 ✓
- Session/RBAC context + 401 refresh → Tasks 8, 9 ✓
- Offline engine (db/repo/outbox/sync/ids/money/triggers/useOnline) → Tasks 2–7, 11 ✓
- Products slice (store, form, list, image) with cost-split → Tasks 10, 12, 13, 14 ✓
- Convergence test (mixed batch, outbox drains) → Task 7 Step 1 ✓
- Cost-split by hiding (form + list) → Tasks 12, 13 ✓
- Integer ZAR cents end-to-end → Task 2 + used in 10/12/13 ✓
- Image upload online-only/deferred → Task 14 ✓
- Tenant-scoped `/sync` and routes → Tasks 7, 14 ✓
- Non-blocking backend follow-ups (pagination) → noted in spec §11; full-list fetch used in Task 13 ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; the only "replace later" is the placeholder PWA icons, which is explicit and non-blocking (real icons before GA).

**3. Type consistency:** `SyncState`, `ProductRow`, `OutboxOp`, `SyncOpResult`, `SyncSummary`, `useProductStore` actions (`load`/`create`/`update`/`archive`), `hasPerm`, `activeBusinessId`, `authFetch`, `runSync(businessId)` are defined once (Tasks 4/7/9/10) and consumed with matching signatures throughout. Store `create` input `{ name, sellPriceCents, costPriceCents?, lowStockThreshold? }` matches the form's call in Task 12 and the test in Task 13.
