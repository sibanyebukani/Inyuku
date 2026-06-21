# Inyuku Digital — M2 (Commerce Core) Frozen Architect Contracts

> **Author:** bukani-architect · **Date:** 2026-06-21 · **Status:** FROZEN for M2 build.
> **Persisted by:** bukani-docs. These contracts implement the product brief in
> `docs/specs/2026-06-21-m2-commerce-core-product-brief.md`. The canonical human-readable mirrors are
> `docs/SCHEMA.md` (Prisma) and `docs/API.md` (routes/permissions). When code/OpenAPI/Prisma disagree
> with this doc, **code wins** — file a docs fix.
> **Stack (unchanged):** Fastify 5 (TypeScript) + Prisma 6 on Railway Postgres 16 (EU).
> **References:** ADR-INY-013/014/015/016 (`docs/DECISIONS.md`), EA-ADR-014/015, ADR-005/006.

---

## 1. Schema conventions (carried from M1)

Every M2 table follows the M1 baseline conventions:

- PascalCase Prisma model + snake_case `@@map`; snake_case columns.
- **`cuid` primary key.**
- **`businessId` FK on every commerce table** (tenant root = `Business`, ADR-005), non-null.
- **Money is `Int` ZAR cents** — never `Float`/`Decimal`.
- `createdAt` / `updatedAt` (UTC).
- Tenant isolation enforced at the route/query layer against the resolved `businessId`.

**New M2 idempotency convention:** client-generated **`clientId`** on every offline-creatable entity
(`Product`, `StockMovement`, `Order`, `Customer`), uniqued **per business** (`@@unique([businessId,
clientId])`). This is the dedupe key for the offline sync contract (ADR-INY-016).

---

## 2. Prisma models (M2)

> Full table-by-table detail is mirrored in `docs/SCHEMA.md`. This is the contract summary.

### Product
- `id` (cuid PK), `businessId` FK, **`clientId`** (idempotency), `name`,
  **`sellPriceCents` (Int)**, **`costPriceCents` (Int) — OWNER-ONLY** (gated by `catalog:read_cost`),
  `imageUrl` / `imageKey` (R2), **`lowStockThreshold` (Int)**,
  `status` (`ProductStatus`: `ACTIVE` / `ARCHIVED`), timestamps.
- **Stock is NOT a column.** Current stock = `SUM(StockMovement.qtyDelta)` (computed, ADR-INY-013/014).
- `@@unique([businessId, clientId])`.

### StockMovement
- **Append-only ledger.** `id` (cuid PK), `businessId` FK, `clientId`, `productId` FK,
  `type` (`StockMovementType`: `OPENING` / `ADJUSTMENT` / `SALE` / `SALE_REVERSAL` / `RECEIVE`),
  **`qtyDelta` (Int, signed)**, `reason`, `orderId?` (FK, set when `SALE` / `SALE_REVERSAL`),
  `occurredAt`, timestamps.
- `@@unique([businessId, clientId])`. Never updated or deleted.

### Order
- `id` (cuid PK), `businessId` FK, `clientId`, **`orderNumber`** (per-business sequence),
  `customerId?` FK, `status` (`OrderStatus`: `DRAFT` / `COMPLETED` / `VOID`),
  `channel` (`OrderChannel`: `IN_PERSON` / `WHATSAPP` / `ONLINE` — M2 writes `IN_PERSON`),
  `paymentState` (`PaymentState`: `PAID` / `UNPAID`),
  **`subtotalCents` / `totalCents` (Int)**,
  **nullable seams:** `fulfilmentStatus?` (`FulfilmentStatus`), `paymentRef?`, `escrowRef?`,
  `occurredAt`, timestamps.
- `@@unique([businessId, clientId])`.

### OrderLine
- `id` (cuid PK), **`businessId` FK**, `orderId` FK, `productId?` FK (**`onDelete: SetNull`**),
  **`nameSnapshot`**, **`unitPriceCents` (Int)**, `qty` (Int), **`lineTotalCents` (Int)**.
- **Price is snapshotted at sale time** — a later catalog price change never rewrites a past sale.

### Customer
- `id` (cuid PK), `businessId` FK, `clientId`, `name`, **`phone` (PII)**, **`email` (PII)**,
  **`consentId?`** (link to `Consent`; nullable until the compliance ruling, GA-gates the directory),
  `notes`, timestamps.
- `@@unique([businessId, clientId])`. PII registered in `docs/POPIA.md`.

### AnalyticsEvent
- `id` (cuid PK), `businessId?` FK, `event`, **`properties` (Json, PII-masked)**, `distinctId`,
  `source`, `occurredAt`, timestamps.
- **First-party queryable stream.** **NO outward API / export** — the ADR-006 (and ADR-INY-013-family)
  boundary holds: no credit-score / third-party surface emits from this stream.

---

## 3. New enums

| Enum | Values |
|---|---|
| `ProductStatus` | `ACTIVE`, `ARCHIVED` |
| `StockMovementType` | `OPENING`, `ADJUSTMENT`, `SALE`, `SALE_REVERSAL`, `RECEIVE` |
| `OrderStatus` | `DRAFT`, `COMPLETED`, `VOID` |
| `OrderChannel` | `IN_PERSON`, `WHATSAPP`, `ONLINE` |
| `PaymentState` | `PAID`, `UNPAID` |
| `FulfilmentStatus` | (seam — deferred lifecycle; nullable on `Order`) |
| `SyncOpStatus` | `APPLIED`, `DUPLICATE`, `CONFLICT`, `REJECTED` |

---

## 4. New audit `(entity, action)` tuples

| entity | action(s) |
|---|---|
| `product` | `CREATE`, `UPDATE`, `DELETE` |
| `stock_movement` | `CREATE` |
| `order` | `CREATE`, `UPDATE` |
| `customer` | `CREATE`, `UPDATE` |

(Extend the M1 audit contract in `docs/SCHEMA.md` § AuditLog.)

---

## 5. API contract (M2)

All routes under **`/v1/businesses/:businessId/*`** (tenant-scoped, RBAC-gated, full detail in
`docs/API.md`).

### Products
| Method | Path | Permission |
|---|---|---|
| GET | `/products` | `catalog:read` |
| POST | `/products` | `catalog:write` → `(product, CREATE)` |
| GET | `/products/:id` | `catalog:read` |
| PATCH | `/products/:id` | `catalog:write` → `(product, UPDATE)` |
| DELETE | `/products/:id` | `catalog:write` → `(product, DELETE)` — **soft (→ `ARCHIVED`)** |
| POST | `/products/:id/image` | `catalog:write` |

> `costPriceCents` is returned **only** to callers holding `catalog:read_cost` (owner-only); masked/omitted otherwise.

### Stock
| Method | Path | Permission |
|---|---|---|
| GET | `/products/:id/stock` | `inventory:read` — current stock = `SUM(qtyDelta)` |
| POST | `/stock-movements` | `inventory:write` → `(stock_movement, CREATE)` |

### Orders
| Method | Path | Permission |
|---|---|---|
| GET | `/orders` | `order:read` |
| POST | `/orders` | `order:write` → `(order, CREATE)` |
| GET | `/orders/:id` | `order:read` |
| POST | `/orders/:id/complete` | `order:write` → `(order, UPDATE)` — auto-decrements stock (`SALE`) |
| POST | `/orders/:id/void` | `order:write` → `(order, UPDATE)` — reverses stock (`SALE_REVERSAL`) |
| PATCH | `/orders/:id/payment` | `order:write` → `(order, UPDATE)` — set `PAID` / `UNPAID` |

### Customers
| Method | Path | Permission |
|---|---|---|
| GET | `/customers` | `customer:read` |
| POST | `/customers` | `customer:write` → `(customer, CREATE)` |
| GET | `/customers/:id` | `customer:read` |
| PATCH | `/customers/:id` | `customer:write` → `(customer, UPDATE)` |

### Dashboard
| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | `dashboard:read` (financial fields require `dashboard:read_financial`) |

- `?date` query param; day boundary computed in **SAST (`Africa/Johannesburg`)**.
- Returns today's sales, order count, low-stock items, catalog counts.
- **Financial fields** (revenue/margin totals) are gated by `dashboard:read_financial` (owner-only).

### Batch sync
| Method | Path | Permission |
|---|---|---|
| POST | `/sync` | `sync:write` |

- **≤ 100 ops** per batch. **Per-op idempotency** via `clientId`. **Partial success** — the batch
  applies what it can and reports per-op status.

**Sync envelope (request op):**
```json
{ "clientId": "c_…", "entity": "order", "op": "create", "occurredAt": "2026-06-21T10:00:00Z", "payload": { } }
```

**Sync envelope (per-op response):**
```json
{ "clientId": "c_…", "status": "APPLIED" }
```
- `status` ∈ `APPLIED` | `DUPLICATE` | `CONFLICT` | `REJECTED` (`SyncOpStatus`).
- **Conflict resolution: last-writer-wins on `occurredAt`** (ADR-INY-016).

---

## 6. Permission strings (new in M2) + role map

| Permission | Grants |
|---|---|
| `catalog:read` | Read products |
| `catalog:write` | Create/update/archive products + image |
| `catalog:read_cost` | **Owner-only** — read `costPriceCents` / margin |
| `inventory:read` | Read stock levels |
| `inventory:write` | Post stock movements |
| `order:read` | Read orders |
| `order:write` | Create/complete/void orders, set payment state |
| `customer:read` | Read customer directory |
| `customer:write` | Create/update customers |
| `dashboard:read` | Read the dashboard (non-financial) |
| `dashboard:read_financial` | **Owner-only** — financial dashboard fields |
| `sync:write` | Submit batch sync |

**Role defaults (M2 additions):**
- **`MERCHANT_OWNER`** — all of the above.
- **`MERCHANT_STAFF`** — all of the above **EXCEPT** `catalog:read_cost` and `dashboard:read_financial`
  (Sipho cannot see cost/margin/financial totals).
- **`AI_AGENT`** — **read-only**: `catalog:read`, `inventory:read`, `order:read`, `customer:read`,
  `dashboard:read`. **No writes** (EA-ADR-012). No `catalog:read_cost` / `dashboard:read_financial` /
  `sync:write`.

---

## 7. Decisions frozen for M2 (see `docs/DECISIONS.md`)

- **ADR-INY-013** — stock-as-movements (append-only ledger, not a mutable integer; enables convergent
  offline sync).
- **ADR-INY-014** — dashboard computes stock via `SUM` (no cache column in M2; re-eval at ~50k movements).
- **ADR-INY-015** — offline negative-stock allowed-and-flagged (founder-adopted; hard-reject would
  defeat offline-first).
- **ADR-INY-016** — client-`clientId` idempotency + last-writer-wins(`occurredAt`) sync contract.

## 8. Compliance / security routing (see `docs/POPIA.md`, `docs/THREAT-MODEL.md`)

- Customer PII (name/phone/email) added to the POPIA register; consent model is a **dependency** routed
  to bukani-compliance and **GA-gates** the customer directory (`Customer.consentId` nullable until ruled).
- **PostHog = new sub-processor** → EA-ADR-015 extension (EU/self-host pin + operator DPA required
  before production events leave Inyuku; **ships dark** until then).
- **bukani-security** reviews sync/idempotency + RBAC cost-split before GA (M2 threat-model entry).
