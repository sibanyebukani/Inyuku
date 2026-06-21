# M2-A: Commerce Backend Domain & Offline Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M2 commerce backend on the M1 Fastify chassis — Prisma models (Product, StockMovement ledger, Order/OrderLine, Customer, AnalyticsEvent), the permission deltas, the catalog/inventory/order/customer/dashboard services + routes, and the **offline batch `/sync`** with idempotent, convergent apply semantics. Frontend (M2-B), analytics wiring (M2-C), QA (M2-D), compliance/docs (M2-E) build on this frozen contract.

**Architecture:** Extends `server/` exactly per the M2 contract (`docs/specs/2026-06-21-m2-commerce-core-contracts.md`, mirrored in `docs/SCHEMA.md` + `docs/API.md`). **Stock is an append-only `StockMovement` ledger** (current stock = `SUM(qtyDelta)`) — this is what makes offline sync convergent (commutative integer deltas, no read-modify-write race). Idempotency = client-minted `clientId` + `@@unique([businessId, clientId])`. Reuses M1 primitives (envelope, `authenticate`/`requirePermission`, `auditLog`, `blob`/`storage`, `pii-mask`, rate-limit) unchanged.

**Tech Stack:** Fastify 5, Prisma 6, Zod (`fastify-type-provider-zod`), `@fastify/multipart` (image), Vitest, local Postgres+Redis.

## Global Constraints

- **Contract is frozen** in `docs/specs/2026-06-21-m2-commerce-core-contracts.md` / `docs/SCHEMA.md` / `docs/API.md`. Build exactly to it; if ambiguous, STOP and ask.
- **Integer ZAR cents** everywhere; **`businessId` on every table**; permission-RBAC + tenant isolation on every route (cross-tenant → 403/404).
- **Stock = SUM(StockMovement.qtyDelta)** — never a mutable integer column. Voids append `SALE_REVERSAL`, never mutate.
- **Idempotency:** every offline-creatable write carries `clientId`; replay → return existing row (no double order/decrement).
- **Price authority is server-side** — order line prices/names are resolved from the Product at apply time; client-sent prices are ignored.
- **RBAC cost-split:** `costPriceCents` and financial dashboard fields require `catalog:read_cost` / `dashboard:read_financial` (owner-only); omit (don't zero) for staff.
- **Negative stock from offline oversell is ALLOWED and flagged** (ADR-INY-015) — never reject a SALE on stock grounds.
- **SAST (`Africa/Johannesburg`)** day boundary for dashboard "today".
- Seed data only (EA-ADR-015 gate). Branch `feature/m2a-commerce-backend` off `main`; TDD; both gates green; update `openapi.snapshot.json`.

---

### Task 1: Prisma migration — M2 models + enums

**Files:** Modify `server/prisma/schema.prisma`; create migration

- [ ] **Step 1:** Add the M2 enums + models from `docs/SCHEMA.md` (ProductStatus, StockMovementType, OrderStatus, OrderChannel, PaymentState, FulfilmentStatus, SyncOpStatus; Product, StockMovement, Order, OrderLine, Customer, AnalyticsEvent) + back-relations on `Business`/`User`/`Consent`. Exact fields/maps/indexes per the contract (`@@unique([businessId, clientId])` on Product/StockMovement/Order/Customer; `@@unique([businessId, orderNumber])`).
- [ ] **Step 2:** `export DATABASE_URL=... && npx prisma migrate dev --name m2a_commerce_core && npm run prisma:generate`. Expected: migration applies; client regenerates.
- [ ] **Step 3: Test** `server/src/__tests__/m2-schema.test.ts` — assert `prisma.product/stockMovement/order/orderLine/customer/analyticsEvent` are defined. Run → pass.
- [ ] **Step 4: Commit** `feat(m2a): Prisma models for commerce core (ledger stock, order seams)`

---

### Task 2: Permission registry + role-map deltas

**Files:** `server/prisma/seed.ts`, `server/src/auth/permissions.ts` + test

- [ ] **Step 1:** Seed the 12 new permission rows (`catalog:read|write|read_cost`, `inventory:read|write`, `order:read|write`, `customer:read|write`, `dashboard:read|read_financial`, `sync:write`).
- [ ] **Step 2:** Extend the role map in `permissions.ts`: `MERCHANT_OWNER` += all 12; `MERCHANT_STAFF` += all except `catalog:read_cost` + `dashboard:read_financial`; `AI_AGENT` += `catalog:read, inventory:read, order:read, customer:read, dashboard:read` (read-only).
- [ ] **Step 3: Test** `permissions.test.ts` (extend) — owner effective set includes `catalog:read_cost`; staff set excludes it + `dashboard:read_financial`; ai_agent has no `*:write`. Run → pass.
- [ ] **Step 4:** `npm run db:seed`; assert permission row count increased by 12. **Commit** `feat(m2a): commerce permissions + owner/staff/ai role map (cost-split)`

---

### Task 3: Catalog — product.service + routes (idempotent, cost-masked)

**Files:** `server/src/services/product.service.ts`, `server/src/routes/v1/commerce.routes.ts` (catalog section) + tests; register plugin in `app.ts`

- [ ] **Step 1: Tests** (`app.inject`, seeded owner+staff+two businesses):
```ts
// 1. POST product {clientId,name,sellPriceCents,openingStock:5} as owner → 201; product exists; an OPENING movement of +5 exists.
// 2. POST same clientId again → 200/201 returns the SAME product (idempotent, no duplicate).
// 3. GET products as STAFF → 200 but costPriceCents is ABSENT from each item (no catalog:read_cost).
// 4. GET products as OWNER → costPriceCents present.
// 5. PATCH costPriceCents as STAFF → 403 FORBIDDEN.
// 6. DELETE product → status ARCHIVED (soft), still retrievable, excluded from default active list.
// 7. Cross-tenant: owner of business B GET business A's product → 404/403.
```
- [ ] **Step 2–4:** implement service (clientId upsert; `openingStock`→OPENING movement in a txn; cost masking by `req.membership` perms) + routes (`catalog:read|write`, `catalog:read_cost`); audit `(product, CREATE|UPDATE|DELETE)`. Run → pass.
- [ ] **Step 5: Commit** `feat(m2a): product catalog service + routes (idempotent, cost-masked, soft-archive)`

---

### Task 4: Inventory — stock = SUM(movements) + manual adjust

**Files:** `server/src/services/inventory.service.ts`, commerce.routes.ts (stock section) + tests

- [ ] **Step 1: Tests:**
```ts
// 1. Product with OPENING +10; GET /products/:id/stock → stockLevel 10.
// 2. POST stock-movement {type:ADJUSTMENT, qtyDelta:-3, reason:'breakage', clientId} → stockLevel 7; movement recorded with reason.
// 3. ADJUSTMENT without reason → 422 VALIDATION_ERROR.
// 4. Replay same clientId movement → DUPLICATE, stockLevel still 7 (not 4).
// 5. inventory:write required (staff has it; ai_agent does not → 403).
```
- [ ] **Step 2–4:** `getStockLevel(productId)` = `SUM(qtyDelta)` via Prisma aggregate; `appendMovement` (idempotent, reason required for ADJUSTMENT); routes (`inventory:read|write`); audit `(stock_movement, CREATE)`. Run → pass.
- [ ] **Step 5: Commit** `feat(m2a): inventory service (ledger-sum stock, manual adjustments)`

---

### Task 5: Orders — txn create/complete/void + stock movements (the core)

**Files:** `server/src/services/order.service.ts`, commerce.routes.ts (orders section) + tests

- [ ] **Step 1: Tests** (the load-bearing ones):
```ts
// 1. Product stock 10. POST order {clientId, status:COMPLETED, lines:[{productId, qty:3}]} → 201; totalCents = 3*sellPrice;
//    orderNumber assigned; stockLevel now 7; a SALE movement -3 linked to the order exists.
// 2. Server price authority: client sends a bogus unitPriceCents → ignored; line uses the product's sellPriceCents + nameSnapshot.
// 3. Replay same clientId → DUPLICATE: returns the SAME order, stock STILL 7 (no second decrement).
// 4. POST /orders/:id/void → status VOID; a SALE_REVERSAL +3 appended; stockLevel back to 10. Void again → DUPLICATE (idempotent), stock stays 10.
// 5. DRAFT order (status omitted/DRAFT) does NOT decrement stock until /complete.
// 6. paymentState defaults PAID; PATCH /payment {UNPAID} works.
// 7. Tenant isolation: order under business A invisible to business B.
```
- [ ] **Step 2–4:** implement in a Prisma `$transaction`: insert Order+OrderLines, assign per-tenant `orderNumber`, resolve prices/names from Product, compute subtotal/total; on COMPLETED append SALE movements (`qtyDelta=-qty`, `orderId` set); `/complete` (DRAFT→COMPLETED + movements); `/void` (→VOID + SALE_REVERSAL keyed `clientId:reversal`, idempotent). Routes `order:read|write`; audit `(order, CREATE|UPDATE)` + `(stock_movement, CREATE)`. Run → pass.
- [ ] **Step 5: Commit** `feat(m2a): order service (txn create/complete/void, server price authority, stock movements)`

---

### Task 6: Customer directory (PII, idempotent, tenant-isolated)

**Files:** `server/src/services/customer.service.ts`, commerce.routes.ts (customers) + tests

- [ ] **Step 1: Tests** — create customer (idempotent on clientId); GET includes linked orders; `customer:read|write` enforced; cross-tenant → 404; PII (`phone`) masked in the audit `changes` (assert via the audit row).
- [ ] **Step 2–4:** implement (nullable `consentId` left null pending compliance — M2-E); audit `(customer, CREATE|UPDATE)`. Run → pass.
- [ ] **Step 5: Commit** `feat(m2a): customer directory service + routes (PII, idempotent)`

---

### Task 7: Dashboard (SAST day boundary, financial-gated)

**Files:** `server/src/services/dashboard.service.ts`, commerce.routes.ts (dashboard) + tests

- [ ] **Step 1: Tests:**
```ts
// 1. Seed: 2 COMPLETED orders today (SAST), 1 product at/below threshold. GET /dashboard as OWNER →
//    { ordersTodayCount:2, revenueTodayCents:<sum>, lowStockCount:1, productCount:<n> }.
// 2. GET /dashboard as STAFF → revenueTodayCents ABSENT (no dashboard:read_financial); operational fields present.
// 3. "today" uses Africa/Johannesburg boundary (an order at 23:30 SAST counts for that SAST day).
// 4. negative-stock product counts in lowStockCount.
```
- [ ] **Step 2–4:** implement (compute today window in SAST; operational widgets always; `revenueTodayCents`/financials only if `dashboard:read_financial`); route `dashboard:read` (+ gated financials). Run → pass.
- [ ] **Step 5: Commit** `feat(m2a): merchant dashboard service (SAST day, financial gated)`

---

### Task 8: Batch `/sync` — idempotent, convergent apply (the hard part)

**Files:** `server/src/services/sync.service.ts`, commerce.routes.ts (sync) + tests

- [ ] **Step 1: Tests** (the convergence suite — the reason offline-P0 is safe):
```ts
// 1. CONVERGENCE: product stock 10. Two SALE orders (qty 1 each) arrive in ONE sync batch with distinct clientIds →
//    both APPLIED, stockLevel 8 (no lost decrement).
// 2. IDEMPOTENT REPLAY: re-send the same batch → both DUPLICATE, stockLevel STILL 8 (no double).
// 3. ORDER-INDEPENDENT: applying the two ops in reverse order yields the same final stock (commutative).
// 4. PARTIAL SUCCESS: a batch of [valid product, product with bad body] → results [APPLIED, REJECTED]; batch is 200, not 4xx.
// 5. LWW: two customer updates, older occurredAt applied after newer → older is CONFLICT, server keeps the newer value.
// 6. PER-OP PERMISSION: a staff sync op needing catalog:read_cost → that op REJECTED (FORBIDDEN), others APPLIED.
// 7. NEGATIVE STOCK ALLOWED: oversell (sell 12 of stock 10 across the batch) → APPLIED, stockLevel -2 (flagged elsewhere).
```
- [ ] **Step 2–4:** implement `POST /v1/businesses/:businessId/sync` — loop ops (ordered by `occurredAt`), dispatch each to the matching service (reusing Task 3–6 functions), catch per-op errors → `REJECTED`, map unique-clash → `DUPLICATE`, LWW for updates → `CONFLICT`; return `{ ok:true, data:{ results:[{clientId,status,serverId?,resource?,error?}], serverTime } }`. Permission `sync:write` on the route + per-op permission inside. Audit each applied mutation normally. Run → pass.
- [ ] **Step 5: Commit** `feat(m2a): batch /sync (idempotent, convergent, LWW, partial-success)`

---

### Task 9: Product image upload (multipart → R2)

**Files:** commerce.routes.ts (image route); register `@fastify/multipart`

- [ ] **Step 1: Test** — POST `/products/:id/image` multipart → stores via the M1 `storage` R2 driver, returns a stable `imageUrl`; sets `imageKey`; `catalog:write` required. (Use a tiny in-memory buffer; assert the storage driver is called + imageUrl persisted.)
- [ ] **Step 2–4:** implement (size-limit, content-type allowlist, R2 public-CDN url), run → pass.
- [ ] **Step 5: Commit** `feat(m2a): product image upload (multipart → R2 public-CDN)`

---

### Task 10: OpenAPI snapshot + audit coverage + final verification, PR

- [ ] **Step 1:** Update `server/openapi.snapshot.json` (all new commerce + sync routes); `npm run openapi:check` → pass. Grep that every mutation route calls `auditLog` with the right tuple.
- [ ] **Step 2: Full gate** (DB+Redis up): `npm ci && prisma generate && migrate deploy && db:seed && typecheck && lint && test && build && openapi:check` → green. Root frontend `typecheck && build` unaffected.
- [ ] **Step 3: Push + PR** — `gh pr create --title "M2-A: commerce backend domain + offline sync" --body "Ledger-stock, orders w/ txn stock movements + seams, customers, dashboard, batch /sync (idempotent/convergent). Seed data only. Frontend = M2-B." --base main`
- [ ] **Step 4: STOP for validation** (incl. CI-green check + sync-convergence review). Do not merge or start M2-B/C/D/E.

---

## Acceptance Criteria (validated in Claude Code before merge)

- [ ] Migration applies; all M2 models present; `businessId` on every table; integer ZAR cents.
- [ ] Stock = SUM(movements); order COMPLETED decrements, VOID reverses (SALE_REVERSAL), DRAFT does not.
- [ ] Idempotent creates (replay → DUPLICATE, no double order/decrement); server-side price authority.
- [ ] `/sync` convergence suite passes (concurrent decrements no loss, replay no double, order-independent, partial success, LWW, per-op permission, negative-stock allowed).
- [ ] RBAC: staff cannot read `costPriceCents` or financial dashboard fields; cross-tenant → 403/404.
- [ ] Dashboard uses SAST day boundary; financial fields gated.
- [ ] Product image → R2; audit on every mutation; OpenAPI snapshot updated.
- [ ] Backend gate green **in CI**; frontend unaffected; seed data only.

## Self-Review

**Spec coverage** (vs M2 contract §1 schema / §2 sync / §3 API / §6 M2-A deliverables): migration (T1), permissions (T2), product (T3), inventory-ledger (T4), orders+movements (T5), customers (T6), dashboard (T7), batch sync (T8), image (T9), openapi/audit (T10). The §2 convergence guarantees are the T8 test suite. M2-B/C/D/E correctly out of scope.

**Placeholder scan:** No "TODO/implement later". `Customer.consentId` left null is the deliberate compliance dependency (M2-E), not an incomplete step. Test bodies for the load-bearing paths (order stock txn, void reversal, sync convergence, RBAC mask, tenant isolation) are concrete; exact field shapes live in the frozen contract docs the builder reads.

**Type/name consistency:** service function names feed the sync dispatcher (T8 reuses T3–T6 services). `clientId` idempotency + `@@unique([businessId, clientId])` consistent across Product/StockMovement/Order/Customer. Permission strings (T2) match the route guards (T3–T9) and the contract's role map. Stock-as-SUM (T4) is what T5 decrement/void and T8 convergence rely on. Reuses M1 `authenticate`/`requirePermission`/`auditLog`/`storage`/`pii-mask` unchanged.
