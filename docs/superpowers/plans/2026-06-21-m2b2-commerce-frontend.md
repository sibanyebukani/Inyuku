# M2-B2: Commerce Core Frontend — Orders, Customers, Inventory, Dashboard, Onboarding — Implementation Plan

> **For the build swarm (KIMI):** Build this plan **slice-by-slice in the order given**. Each task ends with an independently testable deliverable; commit per task with all gates green. **Claude Code plans + validates each phase** — after each slice, expect a validation pass (spec compliance + code quality + actual GitHub CI).

**Goal:** Complete the M2 Commerce Core merchant PWA — add the Orders, Customers, Inventory-adjustment, Dashboard, and Onboarding slices on top of the M2-B1 offline engine, and finish the descoped Products edit/archive/image surface — so a merchant can run their whole day (record sales, manage customers, adjust stock, see today's numbers) offline-first.

**Architecture:** Reuse the M2-B1 four-layer local-first engine unchanged where generic (IndexedDB `repo`, append-only `outbox`, `runSync` replay, `SessionProvider`, `authFetch`, Serwist SW). Generalize the two products-only seams (`runSync` reconciliation + typed rows) so every entity rides the same path. Each new slice = typed row + Zustand store + Zod schema + UI page(s), wired through the existing outbox→`/sync` convergence. The M2-A backend already exposes the REST + `/sync` contracts for every slice; one small backend gap (`product`+`update` in `/sync`) is closed here.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.9, Vitest 4, Zustand, `idb`, `ulid`, Zod, React Hook Form + `@hookform/resolvers`, Tailwind, next-intl. Backend: Fastify 5, Prisma 6, Zod (`fastify-type-provider-zod`), Vitest, Postgres 16, Redis 7.

## Global Constraints

- **Integer ZAR cents end-to-end** — never floats; all money (`sellPriceCents`, `unitPriceCents`, line totals, order totals, `revenueTodayCents`) is integer cents; display via the existing `centsToZAR` formatter only; parse via `zarToCents` (Zod-validated ZAR regex first, so it never throws).
- **Tenant scoping** — every commerce call is under `/v1/businesses/:businessId/*`; `activeBusinessId` from `SessionProvider` always present on requests.
- **RBAC cost-split by HIDING, not zeroing** — `costPriceCents` (products) absent without `catalog:read_cost`; `revenueTodayCents` (dashboard) absent without `dashboard:read_financial`. Never render/transmit a gated field without the permission. `MERCHANT_STAFF` has all commerce perms EXCEPT `catalog:read_cost` + `dashboard:read_financial`; `AI_AGENT` is read-only (no `*:write`, no `sync:write`).
- **Offline = P0 for creates** — recording a sale (order create), adding a customer, adjusting stock, and creating/editing a product MUST work with zero connectivity: mutate IndexedDB + enqueue an outbox op; UI updates optimistically; `runSync` reconciles later. Reads fall back to cached IndexedDB. **State transitions that the backend exposes only as dedicated REST endpoints (order complete/void/payment) are online-only in this phase** — disable them when offline; do not silently drop them.
- **Convergence is the backend's** — client mints `clientId` (ULID), replays ops, trusts server results (idempotent `clientId`, LWW on `occurredAt`). Server is the price + stock authority.
- **No production PII** (EA-ADR-015 gate) — seed/dev data only. **PII-masked logs** (POPIA).
- **Customer-directory consent is GA-gated** (bukani-compliance ruling pending) — build the directory with `Customer.consentId` **nullable**; **do NOT add any consent-capture UI** in this phase. Note the gate in code comments where relevant.
- **Analytics deferred** — NO PostHog / `AnalyticsEvent` instrumentation in this phase (GA-gated, ships dark later).
- **No direct `@anthropic-ai/sdk`** — N/A here, but keep the boundary.
- **TDD; all gates green before every commit** — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (frontend at repo root; backend under `server/`). Follow M1-C / M2-B1 patterns.
- **Node 20 lockfile discipline (CI gotcha)** — CI runs `npm ci` on **Node 20** (`.nvmrc`). If you add/change dependencies, regenerate `package-lock.json` under Node 20 (`nvm use 20 && npm install`), and verify `npm ci` on Node 20 — a green local install on Node 24/npm 11 does NOT guarantee CI passes (it previously failed with `Missing: @swc/helpers@... from lock file`).
- **Path alias** `@/*` → `./src/*`. **Refresh endpoint** `POST /v1/auth/refresh`. **Repo root** `/home/sibnaye/Development/Inyuku` (frontend at root, backend under `server/`). Branch off `main` (M2-B1 PR #7 will be merged first).

---

## What already exists (do NOT rebuild)

**Backend (M2-A, on `main`) — full REST + `/sync` for every slice:**
- Products: `GET/POST/PATCH/DELETE /products`, `POST /products/:id/image`. Orders: `GET/POST /orders`, `POST /orders/:id/complete`, `POST /orders/:id/void`, `PATCH /orders/:id/payment`. Customers: `GET/POST/PATCH /customers` (+ `GET /customers/:id` includes last 20 orders). Inventory: `GET /products/:id/stock`, `POST /stock-movements`. Dashboard: `GET /dashboard` (SAST window, `revenueTodayCents` gated on `dashboard:read_financial`). Batch: `POST /sync`.
- `/sync` accepts `entity` ∈ {`product`(create), `stock_movement`(create), `order`(create), `customer`(create|update)}. Statuses APPLIED/DUPLICATE/CONFLICT/REJECTED; returns `serverId` on APPLIED.
- Permissions registry: `server/src/auth/permissions.ts` (role→perm map above).

**Frontend (M2-B1, merged via PR #7) — reusable:**
- `src/lib/offline/`: `db.ts` (stores `products, customers, orders, stockMovements, outbox, meta`), `repo.ts` (`makeRepo<T>` — generic), `outbox.ts` (generic, `OutboxOp.entity` ∈ product|customer|order|stock_movement), `ids.ts` (`newClientId` ULID), `money.ts` (`centsToZAR`/`zarToCents`), `triggers.ts`, `useOnline.ts`, `sync.ts` (`runSync` — **reconciliation is products-only; generalize in Task 1**).
- `src/lib/session/`: `SessionProvider` (`hasPerm`, `activeBusinessId`), `authFetch` (401→refresh→retry-once).
- `src/lib/products/`: `store.ts` (create/update/archive — update/archive currently unwired in UI), `schema.ts`, `SyncBadge.tsx`, `image.ts` (`uploadProductImage` — implemented, no UI caller).
- `src/app/(merchant)/`: `layout.tsx` (shell, session, sync triggers, online indicator), `products/page.tsx`, `products/ProductForm.tsx`.

---

## Task order & dependencies

```
Task 0 (backend sync gap)  ─┐
Task 1 (engine generalize) ─┼─> Task 3 Orders ─> Task 4 Customers ─> Task 5 Inventory ─> Task 6 Dashboard ─> Task 7 Onboarding
Task 2 (Products finish) ───┘                                                                                  Task 8 (nav/shell) runs last
```
Tasks 0–2 are the foundation and MUST land first (1 before all slices; 0 before 2's edit/archive sync). Slices 3–7 are independent of each other and may be built in any order after the foundation, but the listed order is recommended (Orders proves the full read/write/transition pattern). Task 8 (navigation) lands last to wire every page in.

---

## Task 0 — Backend: add `product`+`update` to `/sync` (full-stack)

**Why:** B1's `store.update()`/`store.archive()` enqueue `product`+`update` ops, but `sync.service.ts` REJECTs that combination — so offline product edits/archives can never converge.

**Files:**
- Modify: `server/src/services/sync.service.ts` (add the `product`+`update` branch, mirroring the existing `customer`+`update` LWW branch).
- Modify/Test: `server/src/routes/v1/__tests__/commerce.routes.test.ts` (or the sync-specific test file) — add cases.

**Behavior:**
- `entity: 'product', op: 'update'` → call `updateProduct(businessId, serverId|resolved-id, patch, callerPerms)`. Resolve the target row by `clientId` (the op carries `clientId`; map to the existing product). Require `catalog:write`. If the patch includes `costPriceCents`, enforce `catalog:read_cost` (reuse the service's existing guard — it already throws on cost-without-perm). Apply LWW on `occurredAt` like the customer branch: if the stored row is newer, return `CONFLICT`; else APPLIED.
- Archive is modeled as `product`+`update` with `{status: 'ARCHIVED'}` — same branch handles it.

**Acceptance:**
- New tests: `product`+`update` via `/sync` returns APPLIED and persists the change; stale `occurredAt` returns CONFLICT; staff (no `catalog:read_cost`) updating `costPriceCents` is rejected; idempotent replay returns DUPLICATE/APPLIED consistently.
- Backend gates green (`cd server && npm run typecheck && npm run lint && npm test && npm run build && npm run openapi:check`).

---

## Task 1 — Frontend: generalize the offline engine for all entities

**Files:**
- Modify: `src/lib/offline/types.ts` — add typed rows: `CustomerRow`, `OrderRow`, `OrderLineRow`, `StockMovementRow` (all extend `BaseRow` = `{clientId, serverId?, _syncState, updatedAtLocal}`).
- Modify: `src/lib/offline/sync.ts` — replace the products-only `if (entity === 'product')` reconciliation with an entity-dispatched reconciliation covering `product`, `customer`, `order`, `stock_movement`: on APPLIED/DUPLICATE write `serverId` + `_syncState:'synced'` to the matching store; on CONFLICT refetch that entity from its REST endpoint into IDB + `_syncState:'synced'` + surface a non-blocking notice; on REJECTED set `_syncState:'error'` (keep row + outbox affordance per B1).
- Modify: `src/lib/offline/sync.ts` — swap the bare `postJson` call for `authFetch` (closes the B1-descoped mid-sync-401 gap).
- Add: a shared atomic store helper (e.g. `src/lib/offline/mutate.ts`) that performs `repo.put(row)` + `outbox.enqueue(op)` inside a **single cross-store IndexedDB transaction** (products `db.ts` already opens all stores), so a thrown enqueue can't strand a pending row (closes the B1 Task-10 open item). Refactor the products store to use it; all new slice stores use it too.

**Acceptance:**
- Unit tests (mock `/sync`): each entity's reconciliation path (APPLIED→serverId+synced, CONFLICT→refetch+notice, REJECTED→error) for `customer`/`order`/`stock_movement` in addition to `product`. A 401 during `runSync` triggers refresh+retry-once (via `authFetch`). The atomic helper: if `enqueue` throws, no orphan row remains (assert store empty after rollback). Existing B1 sync/products tests stay green.

---

## Task 2 — Products slice: finish edit / archive / image (descoped from B1)

**Files:**
- Modify: `src/app/(merchant)/products/ProductForm.tsx` — support **edit mode** (prefill from a row, call `store.update`) in addition to create; add a **file input** for the product image (wired to `uploadProductImage` after the row has a `serverId`, else defer with `pendingImage`).
- Modify: `src/app/(merchant)/products/page.tsx` — add per-row **Edit** and **Archive** affordances (Archive confirms first); archived products drop off the active list.
- Modify: `src/lib/offline/triggers.ts` (or `sync.ts` post-run hook) — **post-sync image retry sweep**: after `runSync` resolves, find rows with `pendingImage: true` that now have a `serverId` and run their deferred `uploadProductImage`.

**Behavior / constraints:** edit/archive are offline-first (enqueue `product`+`update`, now accepted by Task 0). Cost field stays gated on `catalog:read_cost` in edit mode too (hide, don't zero). Image upload is online-only (multipart not queued) — offline, the product saves and the image defers with a clear "uploads when online" state.

**Acceptance:** edit persists + syncs (offline then online); archive removes from active list + syncs; cost field absent for staff in edit; image uploads online and defers offline then uploads on reconnect (post-sync sweep test). Frontend gates green.

---

## Task 3 — Orders slice (record-a-sale)

**Files:** `src/lib/orders/store.ts`, `src/lib/orders/schema.ts`, `src/app/(merchant)/orders/page.tsx` (list), `src/app/(merchant)/orders/OrderForm.tsx` (create + line builder), `src/app/(merchant)/orders/[clientId]/page.tsx` (detail). Tests alongside.

**Behavior:**
- **Create (offline-first):** line builder picks products from the local products store; each line snapshots `nameSnapshot` + `unitPriceCents` from the product's `sellPriceCents` at add-time; qty integer; line total + order total computed in integer cents (no floats). Optional customer link (from customers store; else walk-in). Set `paymentState` (PAID/UNPAID) and create as `COMPLETED` (the merchant is recording a completed in-person sale; backend auto-appends `SALE` stock movements for COMPLETED). `channel = IN_PERSON`. Enqueue `order`+`create` via the atomic helper.
- **List:** orders from IDB with per-row `SyncBadge`, total, status, payment state, date (SAST display).
- **Detail:** lines + totals; **online-only** actions: complete (DRAFT→COMPLETED), void (`POST /orders/:id/void`), toggle payment (`PATCH /orders/:id/payment`) via `authFetch` — disabled with a tooltip when offline; require `order:write`.
- runSync reconciliation for `order` already added in Task 1.

**Acceptance:** create a multi-line completed order fully offline → appears instantly → syncs on reconnect (serverId stored, badge→synced); totals are exact integer cents; void/payment actions disabled offline and succeed online; tenant + `order:write` enforced. Gates green.

---

## Task 4 — Customers directory

**Files:** `src/lib/customers/store.ts`, `src/lib/customers/schema.ts`, `src/app/(merchant)/customers/page.tsx` (list), `src/app/(merchant)/customers/CustomerForm.tsx` (create + edit), `src/app/(merchant)/customers/[clientId]/page.tsx` (detail). Tests alongside.

**Behavior:**
- Create + edit offline-first (`customer`+`create`, `customer`+`update` — both backed by `/sync`, update is LWW on `occurredAt`). Fields: name, phone (E.164-ish, validated), optional note. **`consentId` left null; NO consent-capture UI** (GA-gated — comment the gate).
- List from IDB with sync badges. Detail shows customer fields + recent orders (from `GET /customers/:id`, online; offline shows cached customer + locally-known orders).
- runSync reconciliation for `customer` added in Task 1 (incl. CONFLICT→refetch on LWW loss).

**Acceptance:** create/edit offline → sync; concurrent edit losing LWW surfaces a non-blocking "updated on server" notice and refetches; `customer:write` + tenant enforced; no consent UI present. Gates green.

---

## Task 5 — Inventory: stock-adjustment UI

**Files:** `src/lib/inventory/store.ts`, `src/lib/inventory/schema.ts`, `src/app/(merchant)/inventory/page.tsx` (or a stock-adjust panel reachable from a product). Tests alongside.

**Behavior:**
- Adjustment form: product picker (local products store), signed `qtyDelta` (+ receive / − adjust-down), `type` ∈ {`ADJUSTMENT`, `RECEIVE`}, optional reason. Append-only → enqueue `stock_movement`+`create` via the atomic helper (offline-first). **Negative resulting stock is allowed-and-flagged, not rejected** (per ADR-INY-015/016).
- Current stock display: `GET /products/:id/stock` online (server is authority); offline show last-known/cached with a "stale" hint. No local stock recomputation cache in this phase.
- Surface low-stock on the products list: when current stock ≤ `lowStockThreshold`, flag the row (online data).
- runSync reconciliation for `stock_movement` added in Task 1.

**Acceptance:** record an adjustment offline → syncs; movement is append-only (no mutable stock column touched); negative stock flagged not blocked; `inventory:write` + tenant enforced. Gates green.

---

## Task 6 — Merchant dashboard

**Files:** `src/app/(merchant)/dashboard/page.tsx`. Tests alongside.

**Behavior:** read-only; call `GET /dashboard` via `authFetch` (online; show cached last value offline with a timestamp). Display `ordersTodayCount`, `productCount`, `lowStockCount`. **`revenueTodayCents` rendered only when `hasPerm('dashboard:read_financial')`** (hide, don't zero) and formatted via `centsToZAR`. SAST day boundary is the backend's — do not recompute client-side. No sync (read-only).

**Acceptance:** owner sees revenue tile; staff does NOT (field absent from DOM); offline shows cached snapshot; numbers match backend. Gates green.

---

## Task 7 — Onboarding wizard

**Files:** `src/app/(merchant)/onboarding/page.tsx` (or a stepper component) + a small `src/lib/onboarding/` if needed. Tests alongside.

**Behavior:** multi-step wizard composed on **existing endpoints only** (no new backend): step 1 business profile (update business via existing business endpoint), step 2 first product (reuse products store/`ProductForm`), step 3 opening stock (product create carries `openingStock`, or a stock movement). Show the wizard to a merchant with no products yet; let them skip. Steps are online or offline-first per their underlying create path.

**Acceptance:** a fresh merchant can complete profile → first product → opening stock; data lands via existing endpoints; wizard is skippable and idempotent. Gates green.

---

## Task 8 — Navigation & shell wiring (lands last)

**Files:** Modify `src/app/(merchant)/layout.tsx` — add nav links to Dashboard, Products, Orders, Customers, Inventory (and surface Onboarding for new merchants). Resolves the B1 "no nav links" Minor.

**Acceptance:** every B2 page is reachable from the shell; active-route highlighting; gates green; final full-suite + build green on Node 20.

---

## Self-review checklist (run before handing back each slice)

- Money: every amount is integer cents end-to-end; no `parseFloat`/`*100`/division on money; display via `centsToZAR` only.
- RBAC: `costPriceCents` and `revenueTodayCents` are ABSENT (not zeroed) without their permission, in DOM and payloads.
- Offline P0: create paths work with network off (IDB + outbox); only backend-REST-only transitions (order complete/void/payment) are online-gated, and they're disabled-not-dropped offline.
- Tenant: every request carries `activeBusinessId` under `/v1/businesses/:businessId/*`.
- Atomicity: all stores use the Task-1 atomic put+enqueue helper.
- No consent UI; no analytics; no production PII; logs PII-masked.
- Node 20: if deps changed, lockfile regenerated under Node 20 and `npm ci` verified.
- Gates: frontend (root) and backend (`server/`) both green; actual GitHub CI green after push.
