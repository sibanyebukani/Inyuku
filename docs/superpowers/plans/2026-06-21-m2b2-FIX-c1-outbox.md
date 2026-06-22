# M2-B2 fix — C1 outbox op-collision (offline create-then-edit data loss)

> **KIMI fix prompt.** Work on PR #8's branch `feature/m2b2-commerce-frontend`. **This time, work in your own git worktree or clone** (`git worktree add ../inyuku-fix feature/m2b2-commerce-frontend`) so your git operations don't collide with the validator's. Validation gate after: Claude Code re-reviews + re-checks actual GitHub CI before merge.

## The bug (CRITICAL — confirmed)

The outbox object store is keyed by `clientId` (`src/lib/offline/db.ts:32`, `keyPath: 'clientId'`) and `enqueue` is a `put` (`src/lib/offline/outbox.ts:8`). So there is **only ever one outbox op per entity instance**. When a record is created **and then edited/archived while offline**, the second op **overwrites** the `create` op. On reconnect the server receives an `update` for a `clientId` it has never seen → the backend `product+update` / `customer+update` branch returns `REJECTED ("… not found")` → the offline-created record is **permanently stranded** (`_syncState:'error'`, op re-rejects forever). This defeats the M2-B2 P0 offline guarantee (plan §Global Constraints: "creating/editing a product MUST work with zero connectivity").

Reproduction (offline): `create({name:'Rice'})` then `update(clientId,{sellPriceCents:150})` → outbox holds **1** op (`update`); the `create` is gone.

Also affected: product create→archive offline; customer create→edit offline.

## The fix (append-only outbox log)

Convert the outbox to a true append-only, ordered log so every op survives and replays in order. This matches the plan's "append-only outbox" language and is robust to N ops per entity. The app is pre-launch (no production data; DB_VERSION currently 1), so a schema change is free.

**`src/lib/offline/db.ts`**
- Bump `DB_VERSION` to 2.
- Change the `outbox` store to an **auto-keyed log**: `db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })` (or keep `clientId` as a field but give the store its own autoIncrement primary key). Add an index on `clientId` if needed for lookups.
- In `upgrade(db, oldVersion)`, handle v1→v2: it's acceptable to delete + recreate the `outbox` store (pre-launch, no real pending ops) — do it guarded on `oldVersion < 2`. Leave the entity stores (`products`/`customers`/`orders`/`stockMovements`, all `keyPath:'clientId'`) unchanged — domain rows stay keyed by clientId.

**`src/lib/offline/types.ts`**
- Add the auto key field to `OutboxOp` (e.g. `seq?: number`).

**`src/lib/offline/outbox.ts`**
- `enqueue`: `db.add('outbox', op)` (append — never overwrite). It must NOT key on clientId.
- `listBatch`: unchanged in spirit — return up to 100 ops **sorted by `occurredAt` then `seq`** (seq breaks ties so create precedes its later update at the same timestamp).
- `remove`: change to remove by the op's own key (`seq`), not by `clientId`. Update all callers.
- `count`: unchanged.

**`src/lib/offline/sync.ts`**
- The replay loop currently removes acked ops by `clientId`; change to remove by the op's `seq` (each result maps back to the op it came from — preserve op identity through the request/response mapping). Ensure ops for the same `clientId` are sent in order (sorted by `occurredAt,seq`) so the server sees `create` before `update`.
- Reconciliation writeback to domain rows still keys by `clientId` (rows are clientId-keyed) — keep that.
- A `create` that returns APPLIED followed by an `update` (APPLIED) for the same clientId must both be acked and removed.

**`src/lib/offline/mutate.ts`**
- `atomicPutAndEnqueue` must `add` (append) the op within the same cross-store transaction, consistent with the new append semantics. (Also add `finally { db.close() }` — see Mn3.)

## Tests (must add — these are the gate)

1. **Convergence test (the missing one):** offline `create` then `update` for one `clientId` → outbox has **2** ops (create then update). Run `runSync` against a mock server that returns APPLIED for `create` (assigning a serverId) and APPLIED for the subsequent `update` → assert: both ops removed from outbox, domain row `_syncState:'synced'` with a serverId, no REJECTED. Add the create→archive variant.
2. **Fix the masking test** `src/lib/products/store.test.ts` (the "update merges fields and enqueues an update op" case): assert the **total** outbox op count and that the `create` op still exists after an update — not just the update-op count.
3. Customer create→edit offline convergence (mirror test 1 for customers).

## Also fold in (cheap, from the same review)

- **Mn1 — stray export:** `src/app/(merchant)/dashboard/page.tsx:10` `export interface DashboardSnapshot` — move it to a sibling `types.ts` (or drop `export`). App Router `page.tsx` should only default-export the component.
- **Mn3 — leaked db handle:** `src/lib/offline/mutate.ts` opens a db connection and never closes it — add `finally { db.close() }`.
- **(optional) customers store test:** add a `create → pending IDB row + outbox op` and `update with serverId → payload.id set` assertion to `src/lib/customers/store.test.ts` to match the orders/inventory store test depth.

## Done criteria

- All new + existing tests green; frontend gates (`typecheck`/`lint`/`test`/`build`) and backend gates (`typecheck`/`lint`/`test`/`build`/`openapi:check`) green **on Node 20** (regenerate `package-lock.json` under Node 20 only if deps changed — none expected here).
- Commit(s) on `feature/m2b2-commerce-frontend` with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer; push to PR #8.
- Do NOT merge — hand back for re-validation.
