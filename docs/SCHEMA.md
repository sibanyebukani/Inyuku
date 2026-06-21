# Inyuku Digital — Database Schema (SCHEMA.md)

> **Owner:** bukani-docs · **Source of truth:** Prisma (`schema.prisma`). This doc is the human-readable
> mirror of the schema: the **M1 baseline** (bukani-architect, 2026-06-19) plus the **M2 Commerce Core**
> contracts (bukani-architect, 2026-06-21). When Prisma and this doc disagree, **Prisma wins** — file a
> docs fix.
> **Stack:** Fastify 5 (TypeScript) + **Prisma 6** on Railway Postgres 16 (EU). See `docs/API.md`, `CLAUDE.md`.
> **M2 contracts:** `docs/specs/2026-06-21-m2-commerce-core-contracts.md`.

## Conventions (apply to every table)

- **Naming.** Prisma models are PascalCase; every model carries a snake_case `@@map` (e.g. `User` →
  `users`, `RefreshToken` → `refresh_tokens`). Columns map to snake_case in the DB.
- **Money.** All monetary amounts are **`Int` ZAR cents** — never `Float`/`Decimal`. The M2 commerce tables
  apply this (`sellPriceCents`, `costPriceCents`, `unitPriceCents`, `lineTotalCents`, `subtotalCents`,
  `totalCents`).
- **Idempotency (M2).** Offline-creatable commerce entities (`Product`, `StockMovement`, `Order`,
  `Customer`) carry a **client-generated `clientId`**, uniqued per tenant via `@@unique([businessId,
  clientId])`. This is the dedupe key for the offline batch-sync contract (ADR-INY-016). PKs are `cuid`.
- **Multi-tenancy.** `Business` is the **tenant root**. The `businessId` FK is:
  - **non-null** on tenant-scoped tables (`Membership`, `Setting`, `Consent`, `AiUsage`, …),
  - **nullable** on governance/cross-tenant tables (`AuditLog`, `ErrorLog`, `Permission`) — these may record
    platform-level events with no business in scope,
  - **absent** on `Lead` — leads are captured **pre-tenant** (a visitor is not yet a business).
- **Tenant isolation** is enforced at the route/query layer against the resolved `businessId`
  (permission-RBAC; cross-tenant access → 403/404). See `docs/API.md` § Permission model.
- **Timestamps.** `createdAt` / `updatedAt` (snake_case `created_at` / `updated_at`), UTC.
- **Soft-delete.** Governance/audit rows (`AuditLog`, `ErrorLog`) are **append-only / immutable** — never
  updated or deleted. Tenant entities use **status enums** (e.g. `UserStatus`, `BusinessStatus`,
  `ConsentStatus`, `LeadStatus`) rather than hard deletes where a lifecycle exists; consent withdrawal is
  modelled additively via `ConsentRevocation`, not by deleting the `Consent` row.
- **Secrets at rest.** `Setting` rows flagged `isSecret = true` are stored AES-256-GCM-encrypted with the
  `enc:v1:` value prefix (ADR-INY-011); the encryption key is a separate trust boundary (`ENCRYPTION_KEY`).

---

## Enums

| Enum | Values |
|---|---|
| `MembershipRole` | `MERCHANT_OWNER`, `MERCHANT_STAFF`, `ADMIN`, `SUPPORT`, `AI_AGENT` |
| `UserStatus` | account lifecycle (active / suspended / etc.) |
| `BusinessStatus` | tenant lifecycle (active / suspended / etc.) |
| `ConsentStatus` | consent lifecycle (granted / revoked / etc.) |
| `LeadSource` | `CONTACT`, `IMPACT_REPORT`, `SHARE_STORY` |
| `LeadStatus` | lead lifecycle (`NEW` on create → triaged) |
| `ProductStatus` *(M2)* | `ACTIVE`, `ARCHIVED` |
| `StockMovementType` *(M2)* | `OPENING`, `ADJUSTMENT`, `SALE`, `SALE_REVERSAL`, `RECEIVE` |
| `OrderStatus` *(M2)* | `DRAFT`, `COMPLETED`, `VOID` |
| `OrderChannel` *(M2)* | `IN_PERSON`, `WHATSAPP`, `ONLINE` (M2 writes `IN_PERSON`; the rest are seams for M3/M4) |
| `PaymentState` *(M2)* | `PAID`, `UNPAID` (manual in M2; gateway state lands in M4) |
| `FulfilmentStatus` *(M2)* | deferred-lifecycle seam — nullable on `Order`, no M2 transitions |
| `SyncOpStatus` *(M2)* | `APPLIED`, `DUPLICATE`, `CONFLICT`, `REJECTED` (per-op batch-sync result) |

> `AI_AGENT` is the least-privilege principal for the tool-using Business Agent — **read + `ai:invoke`
> only**, no writes (EA-ADR-012). See `docs/API.md` § role map.

---

## Identity & auth tables

### Table: User
**Purpose:** Person/principal accounts (merchants, staff, platform admins, support).
**PII fields:** email, name, phone (see `docs/POPIA.md`).
**Tenancy:** no `businessId` — a user joins one or more businesses via `Membership`.
- Belongs to many: `Business` (via `Membership`).
- Has many: `RefreshToken`, `PasswordResetToken`, `PhoneOtp`.
- Auth: bcrypt-12 password hash, never returned. Status via `UserStatus`.

### Table: RefreshToken
**Purpose:** Opaque refresh tokens for the access/refresh split (ADR-INY-009).
- Stored as **sha256 of the opaque token** (never the raw token), 30-day lifetime.
- Carries a **`familyId`** for rotation + **reuse-detection** — presenting a rotated/old token revokes the
  **whole family**.
- Belongs to: `User`. **Append + revoke** semantics (rotated tokens are marked, not silently dropped).

### Table: PasswordResetToken
**Purpose:** Single-use password-reset tokens (reset-request → reset-confirm flow).
- Hashed at rest, short TTL, single-use. Belongs to: `User`.

### Table: PhoneOtp
**Purpose:** Phone OTP challenges (request/verify), **Redis-backed** flow with a DB record.
**PII fields:** phone (see POPIA). Belongs to: `User` (or pending signup). Short TTL, attempt-limited.

---

## Tenant & access tables

### Table: Business
**Purpose:** **Tenant root.** A merchant business/organisation; every tenant-scoped row hangs off it.
**Tenancy:** the root — `businessId` elsewhere FKs here.
- Has many: `Membership`, `Setting`, `Consent`, `AiUsage`. Status via `BusinessStatus`.

### Table: Membership
**Purpose:** Join of `User` ↔ `Business` carrying the access grant.
**Tenancy:** `businessId` **non-null**.
- Fields of note: `role` (`MembershipRole`) supplying default permissions, plus an explicit
  **`permissions[]`** list unioned with the role defaults (ADR-INY-010).
- Belongs to: `User`, `Business`. Unique on (`userId`, `businessId`).

### Table: Permission
**Purpose:** Registry of the discrete permission keys the route guard checks against.
**Tenancy:** `businessId` **nullable** (governance/registry). See `docs/API.md` § Permission registry for
the full key list.

---

## Governance / observability tables (append-only)

### Table: AuditLog
**Purpose:** Immutable record of security/governance-relevant actions. Append-only.
**Tenancy:** `businessId` **nullable** (platform-level events have no business in scope).
- Captures actor, `(entity, action)`, target, and context. **Never updated or deleted.**
- Audit-event `(entity, action)` tuples emitted in M1:
  | entity | action(s) | emitted when |
  |---|---|---|
  | `auth` | `SIGNUP`, `LOGIN`, `LOGOUT`, `REFRESH`, `PASSWORD_RESET` | auth lifecycle events |
  | `business` | `UPDATE`, `SUSPEND` | business mutated / platform suspend |
  | `member` | `INVITE`, `UPDATE`, `REMOVE` | membership changes |
  | `settings` | `UPDATE` | a Setting changed (secret values masked in the diff) |
  | `consent` | `CREATE`, `REVOKE` | consent granted / revoked |
  | `lead` | `CREATE`, `UPDATE` | lead captured / triaged |
  | `ai` | `INVOKE` | an AI gateway call |
  | `product` *(M2)* | `CREATE`, `UPDATE`, `DELETE` | product created / edited / soft-deleted (→ `ARCHIVED`) |
  | `stock_movement` *(M2)* | `CREATE` | a stock movement posted (append-only ledger) |
  | `order` *(M2)* | `CREATE`, `UPDATE` | order created / completed / voided / payment-state changed |
  | `customer` *(M2)* | `CREATE`, `UPDATE` | customer added / edited |

  > The tuple set is the audit contract; new entities/actions are added as modules land — keep this table
  > and the route handlers in sync.

### Table: ErrorLog
**Purpose:** Captured server errors for triage (paired with Sentry). Append-only.
**Tenancy:** `businessId` **nullable**.
- Stores error class/code/message, request context, `GIT_COMMIT_SHA`. PII-masked (POPIA).

---

## Settings table

### Table: Setting
**Purpose:** **Unified** DB-backed config + secrets store — replaces the chassis `AppSetting` +
`notification_channel_configs` split (ADR-INY-011).
**Tenancy:** `businessId` **non-null** for tenant settings (platform-bootstrap settings may use a reserved
scope per the loader).
- Key columns: `key`, `value`, **`isSecret`** (bool). When `isSecret = true`, `value` is AES-256-GCM
  encrypted with the `enc:v1:` prefix and is **never returned in plaintext** unless the caller holds
  `settings:read_secret` (otherwise masked).
- Known secret keys (`isSecret = true`): `email.resend.apiKey`, `sms.bulksms.tokenId`,
  `sms.bulksms.tokenSecret`, `ai.apiKey`, `tradesafe.clientId` *(M4)*, `tradesafe.clientSecret` *(M4)*,
  `dialog360.apiKey` *(M3)*.
- Known non-secret keys: `ai.enabled` (kill switch), `ai.tier.classify`, `ai.tier.agent`,
  `ai.tier.complex`.

---

## Consent tables

### Table: Consent
**Purpose:** Consent ledger — records a data subject's grant for a given purpose. Additive (not deleted).
**PII fields:** linked subject identifier (see POPIA). **Tenancy:** `businessId` **non-null**.
- Status via `ConsentStatus`. Withdrawal recorded additively in `ConsentRevocation` — the original grant row
  is retained for the audit trail.

### Table: ConsentRevocation
**Purpose:** Records the withdrawal of a previously granted `Consent` (append-only).
- Belongs to: `Consent`. Created by the `POST .../consents/:id/revoke` route; emits `(consent, REVOKE)`.

---

## AI usage table

### Table: AiUsage
**Purpose:** Per-call AI cost/usage log behind the `lib/ai.js` gateway (ADR-002, EA-ADR-011).
**Tenancy:** `businessId` **non-null**.
- Captures feature, tier (`classify`/`agent`/`complex`), tokens, cost (Int cents), timestamp. Backs the
  R3,000/mo ceiling, the kill switch reporting, and `GET .../ai-usage`.

---

## Lead table (pre-tenant)

### Table: Lead
**Purpose:** Public lead capture from the marketing site — contact, impact-report requests, shared stories.
**PII fields:** name, email, message/payload, **ip**, **ua** (user agent) (see POPIA). **Tenancy:** **no
`businessId`** — leads predate any business.
- Fields of note: `source` (`LeadSource`), `status` (`LeadStatus`, `NEW` on create), captured
  `ip` / `ua` / consent flag, and a `payload` for the variable `share_story` shape.
- Created by the **public `POST /v1/leads`** route (discriminated by `source`); triaged via
  `PATCH /v1/admin/leads/:id`. Emits `(lead, CREATE)` / `(lead, UPDATE)`. See `docs/API.md` § /v1/leads.

---

## Commerce Core tables (M2)

> Mirror of the frozen M2 contracts (`docs/specs/2026-06-21-m2-commerce-core-contracts.md`). Every table
> below has `businessId` **non-null** (tenant root), a `cuid` PK, and a per-tenant `clientId` idempotency
> key. Money is `Int` ZAR cents.

### Table: Product
**Purpose:** A sellable item in a merchant's catalog.
**PII fields:** none.
**Tenancy:** `businessId` **non-null**.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | Auto | PK |
| `businessId` | cuid | Yes | Tenant FK |
| `clientId` | text | Yes | Offline idempotency key |
| `name` | text | Yes | Product name |
| `sellPriceCents` | Int | Yes | Sell price, ZAR cents |
| `costPriceCents` | Int | No | Cost price, ZAR cents — **OWNER-ONLY** (gated by `catalog:read_cost`; never returned to `MERCHANT_STAFF`) |
| `imageUrl` | text | No | Public-CDN URL (R2) |
| `imageKey` | text | No | R2 object key |
| `lowStockThreshold` | Int | No | Low-stock alert threshold (units) |
| `status` | `ProductStatus` | Yes | `ACTIVE` / `ARCHIVED` (soft-delete = `ARCHIVED`) |

- **Stock is NOT a column.** Current stock = `SUM(StockMovement.qtyDelta)` for the product (computed,
  no cache column — ADR-INY-013/014).
- Indexes: `@@unique([businessId, clientId])`; `businessId` standard.
- Relationships: belongs to `Business`; has many `StockMovement`, `OrderLine`.

### Table: StockMovement
**Purpose:** **Append-only stock ledger.** Every stock change is a signed movement; current stock is the
sum (ADR-INY-013). Never updated or deleted.
**Tenancy:** `businessId` **non-null**.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | Auto | PK |
| `businessId` | cuid | Yes | Tenant FK |
| `clientId` | text | Yes | Offline idempotency key |
| `productId` | cuid | Yes | FK → `Product` |
| `type` | `StockMovementType` | Yes | `OPENING` / `ADJUSTMENT` / `SALE` / `SALE_REVERSAL` / `RECEIVE` |
| `qtyDelta` | Int | Yes | **Signed** delta (negative for `SALE`, positive for `RECEIVE`/`OPENING`) |
| `reason` | text | No | Free-text reason (manual adjustments) |
| `orderId` | cuid | No | FK → `Order` for `SALE` / `SALE_REVERSAL` |
| `occurredAt` | timestamp | Yes | When the movement happened (offline-aware; drives sync LWW) |

- **Negative-stock is allowed-and-flagged** offline (ADR-INY-015) — not hard-rejected.
- Indexes: `@@unique([businessId, clientId])`; `productId` standard.
- Relationships: belongs to `Business`, `Product`, optional `Order`.

### Table: Order
**Purpose:** A sale/transaction record. In M2 `channel = IN_PERSON` and `paymentState` is set manually.
**Tenancy:** `businessId` **non-null**.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | Auto | PK |
| `businessId` | cuid | Yes | Tenant FK |
| `clientId` | text | Yes | Offline idempotency key |
| `orderNumber` | text/Int | Yes | Per-business human order number |
| `customerId` | cuid | No | FK → `Customer` |
| `status` | `OrderStatus` | Yes | `DRAFT` / `COMPLETED` / `VOID` |
| `channel` | `OrderChannel` | Yes | `IN_PERSON` in M2 (`WHATSAPP` / `ONLINE` are M3/M4 seams) |
| `paymentState` | `PaymentState` | Yes | `PAID` / `UNPAID` (manual in M2) |
| `subtotalCents` | Int | Yes | Sum of line totals, ZAR cents |
| `totalCents` | Int | Yes | Order total, ZAR cents |
| `fulfilmentStatus` | `FulfilmentStatus` | No | **Nullable seam** — deferred lifecycle |
| `paymentRef` | text | No | **Nullable seam** — M4 payments |
| `escrowRef` | text | No | **Nullable seam** — M4 TradeSafe escrow |
| `occurredAt` | timestamp | Yes | When the sale happened (offline-aware; sync LWW) |

- `complete` auto-decrements stock (a `SALE` movement); `void` reverses it (`SALE_REVERSAL`).
- Indexes: `@@unique([businessId, clientId])`.
- Relationships: belongs to `Business`, optional `Customer`; has many `OrderLine`, `StockMovement`.

### Table: OrderLine
**Purpose:** A line item on an order, with the product **name and price snapshotted at sale time** — a
later catalog price change never rewrites a past sale.
**Tenancy:** `businessId` **non-null** (carried on the line, not only via the parent order).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | Auto | PK |
| `businessId` | cuid | Yes | Tenant FK |
| `orderId` | cuid | Yes | FK → `Order` |
| `productId` | cuid | No | FK → `Product`, **`onDelete: SetNull`** (line survives product archival/removal) |
| `nameSnapshot` | text | Yes | Product name at sale time |
| `unitPriceCents` | Int | Yes | Unit price at sale time, ZAR cents |
| `qty` | Int | Yes | Quantity sold |
| `lineTotalCents` | Int | Yes | `unitPriceCents * qty`, ZAR cents |

- Relationships: belongs to `Business`, `Order`, optional `Product`.

### Table: Customer
**Purpose:** The merchant's customer directory (customer book).
**PII fields:** **name, phone, email** (see `docs/POPIA.md`). **GA-gated** on the consent ruling.
**Tenancy:** `businessId` **non-null**.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | Auto | PK |
| `businessId` | cuid | Yes | Tenant FK |
| `clientId` | text | Yes | Offline idempotency key |
| `name` | text | Yes | Customer name (PII) |
| `phone` | text | No | Customer phone (PII) |
| `email` | text | No | Customer email (PII) |
| `consentId` | cuid | No | **Nullable until the compliance ruling** — link to `Consent`; GA-gates the directory |
| `notes` | text | No | Free-text merchant notes |

- Indexes: `@@unique([businessId, clientId])`.
- Relationships: belongs to `Business`, optional `Consent`; has many `Order`.

### Table: AnalyticsEvent
**Purpose:** **First-party, queryable product/event stream** (the PostHog-backed analytics surface).
**PII fields:** PII is **masked** in `properties` (POPIA). `distinctId` is a pseudonymous identifier.
**Tenancy:** `businessId` **nullable** (some events are pre-tenant / platform-level).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | cuid | Auto | PK |
| `businessId` | cuid | No | Tenant FK (nullable) |
| `event` | text | Yes | Event name |
| `properties` | Json | No | Event properties — **PII-masked** |
| `distinctId` | text | Yes | Pseudonymous subject id |
| `source` | text | Yes | Event source |
| `occurredAt` | timestamp | Yes | When the event happened |

- **NO outward API / export.** This is an internal stream only — the ADR-006 boundary (no credit-score /
  third-party-facing output) holds. PostHog is a **new sub-processor** gated by the EA-ADR-015 extension
  (EU/self-host pin + operator DPA); **ships dark** until cleared (`docs/POPIA.md`).

---

## Relationship summary

```
User 1──* Membership *──1 Business (tenant root)
User 1──* RefreshToken (familyId rotation)
User 1──* PasswordResetToken
User 1──* PhoneOtp
Business 1──* Setting | Consent | AiUsage
Consent 1──* ConsentRevocation
Permission (registry; business-nullable)
AuditLog | ErrorLog (append-only; business-nullable)
Lead (standalone; no businessId)

# Commerce Core (M2)
Business 1──* Product | Order | Customer | StockMovement | OrderLine
Product 1──* StockMovement | OrderLine (OrderLine.productId onDelete:SetNull)
Order 1──* OrderLine | StockMovement (SALE / SALE_REVERSAL)
Customer 1──* Order ; Customer *──1? Consent (consentId nullable until ruling)
AnalyticsEvent (first-party stream; business-nullable; no outward export)
```
