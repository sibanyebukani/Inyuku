# M2-B1 — Merchant PWA Foundation, Offline Engine & Products Slice — Design

> **Status:** Approved design (brainstorming output). Next step: implementation plan via writing-plans.
> **Date:** 2026-06-21 · **Milestone:** M2 Commerce Core → frontend slice **B1**.
> **Builds on:** merged M2-A commerce backend (frozen `/sync` + REST contract) and the M1-C
> frontend foundation (cookie-auth `apiFetch`, i18n, Sentry/OTel).
> **Source contracts (canonical, do not re-derive):** `docs/API.md`, `docs/SCHEMA.md`,
> `docs/specs/2026-06-21-m2-commerce-core-contracts.md`, `docs/specs/2026-06-21-m2-commerce-core-product-brief.md`.

## 1. Goal

Stand up the merchant PWA foundation: an **installable, cold-start-offline** Next.js app with a
**custom thin local-first data + sync engine** that drives the M2 backend's batch `/sync` contract,
proven end-to-end by a single vertical slice — **Products** (list / create / edit / archive / image,
with RBAC cost-split). This de-risks the hard part (offline convergence) before the remaining
commerce modules are built in B2.

## 2. Scope

**In B1:**
- Installable PWA shell — Serwist Service Worker (app-shell + static-asset caching) + web app manifest.
- Merchant **session/RBAC context** — `{user, memberships, activeBusinessId}`, `hasPerm()`, route guard,
  and `apiFetch` wrapped with **401 → refresh → retry-once** (M1 refresh endpoint).
- The full **custom local-first engine** — IndexedDB repositories + append-only outbox + Zustand store
  + sync-replay module + online/trigger plumbing.
- **Products vertical slice** wired end-to-end through the engine: list, create, edit, archive, image
  upload, with cost-field masking for staff.
- ZAR money utilities (integer-cents end-to-end).

**Deferred to B2:** orders, customers, stock-adjustment, dashboard, onboarding wizard.

**Out (founder rulings, M2 brief):** barcode scanning (P1); fulfilment UX (data seams only); PostHog
analytics (ships dark — M2-C). No production PII (EA-ADR-015 gate) — seed/dev data only.

## 3. Constraints (inherited, mandatory)

- **Integer ZAR cents** end-to-end; never floats; display via formatter only.
- **Tenant scoping** — every commerce call is under `/v1/businesses/:businessId/*`; `activeBusinessId`
  always present on requests.
- **RBAC cost-split** — `costPriceCents` and financial fields are **omitted (hidden), not zeroed**, for
  `MERCHANT_STAFF` / `AI_AGENT`; the UI must never display a cost field absent `catalog:read_cost`.
- **Idempotency / convergence is the backend's** — client mints `clientId` (ULID), replays ops, and
  trusts server results (idempotent `clientId`, LWW on `occurredAt`, commutative stock ledger).
- **Offline = P0** (persona Nomsa): the app must open and operate with zero connectivity from a cold
  start; writes never block on the network.
- TDD; both lint + typecheck + test gates green; follows M1-C frontend patterns.

## 4. Architecture — four layers

```
UI            React pages/components · next-intl · Tailwind · permission gates
   │  optimistic calls
Store         Zustand — reactive view of cached entities + per-entity sync state
   │  read/write
Persistence   IndexedDB (idb) — entity stores + append-only "outbox"
   │  drained by
Sync engine   runSync(): outbox → POST /sync → apply per-op results, map clientId→serverId
   ▲
Service Worker  Serwist — app-shell + static assets cached for cold-start offline
```

**Local-first rule:** reads always come from IndexedDB (hydrated from the server when online). Writes
mutate IndexedDB and enqueue an outbox op; the UI updates immediately; the sync engine reconciles later.
The backend owns convergence — the client only durably stores and replays.

## 5. Module / file structure

All new offline/session code is isolated under `src/lib/offline/` and `src/lib/session/` so each unit
has one responsibility and is independently testable.

### `src/lib/offline/`
- **`db.ts`** — idb database schema. Object stores: `products`, `customers`, `orders`, `stockMovements`,
  `outbox`, `meta`. Each entity row carries `clientId` (primary key), optional `serverId`, and local
  fields `_syncState` (`'pending' | 'synced' | 'conflict' | 'error'`) and `updatedAtLocal`.
- **`ids.ts`** — `newClientId()` → ULID (time-sortable, collision-safe offline).
- **`money.ts`** — `centsToZAR(cents: number): string` (e.g. `R 12.50`) and
  `zarToCents(input: string): number` (parse, reject non-integer cents).
- **`repo.ts`** — generic typed repository over a store: `get(clientId)`, `list()`, `put(row)`,
  `remove(clientId)`. Used by the store layer and slices.
- **`outbox.ts`** — `enqueue(op)`, `list()` (sorted by `occurredAt`, capped at 100 per drain),
  `remove(clientId)`. Op shape: `{clientId, entity, op, occurredAt, payload}` matching the `/sync` contract.
- **`sync.ts`** — `runSync()`: load an outbox batch → `postJson('/v1/businesses/:id/sync', {ops})` →
  for each result apply the per-op status (§7) → update entity rows and drain applied ops. Returns a
  summary `{applied, duplicate, conflict, rejected}`.
- **`triggers.ts`** + **`useOnline.ts`** — fire `runSync()` on the `online` event, on app load/focus,
  on a manual "Sync now" action, and best-effort after each mutation when online. `useOnline()` exposes
  connectivity for the UI indicator.

### `src/lib/session/`
- **`SessionProvider.tsx`** — React context holding `{user, memberships, activeBusinessId}`; exposes
  `hasPerm(permission)`; selects the active business (auto-select when a single membership); provides a
  route guard that redirects to `/login` when unauthenticated.
- **`authFetch.ts`** — wraps M1-C `apiFetch` with **401 → call refresh → retry once**, then surface
  auth failure (redirect to login) if refresh fails.

### `src/app/`
- **`(merchant)/layout.tsx`** — authenticated shell: `SessionProvider`, online/offline + sync-status
  indicator, navigation.
- **`(merchant)/products/page.tsx`** — products list (reads from IndexedDB store; per-row sync badge).
- **`(merchant)/products/ProductForm.tsx`** — create/edit form using **React Hook Form + Zod** (client
  schema mirrors the backend Zod); `costPriceCents` field rendered only when `hasPerm('catalog:read_cost')`.
- **PWA assets** — `app/manifest.ts` (web manifest) + Serwist Service Worker registration wired into the
  root layout; icons under `public/`.

## 6. Data flow — the convergence path

**Offline create (product):**
1. `newClientId()` mints a ULID.
2. Write a product row to IndexedDB with `_syncState:'pending'`.
3. `outbox.enqueue({clientId, entity:'product', op:'create', occurredAt:nowISO, payload})`.
4. Zustand store updates → UI shows the product instantly.

**Sync (on reconnect / trigger):** `runSync()` posts the batch (≤100, sorted by `occurredAt`).

## 7. Per-op result handling (the four statuses)

| Status | Meaning | Client action |
|---|---|---|
| `APPLIED` | Server wrote the row | Store `serverId` on the local row, mark `synced`, remove outbox op |
| `DUPLICATE` | `clientId` already applied (idempotent replay) | Same as APPLIED (ensure `serverId` set), remove op |
| `CONFLICT` | LWW — server version is newer | Server wins: refetch that entity from server into IndexedDB, drop the local op, surface a **non-blocking** notice |
| `REJECTED` | Validation/permission failure | Mark row `_syncState:'error'`, keep a visible **retry / discard** affordance — never silently lose data |

`serverId` is returned on APPLIED by the merged backend (`server/src/services/sync.service.ts`), so the
`clientId → serverId` mapping is unblocked.

## 8. Session, RBAC & money

- `SessionProvider` is the single source of truth for identity + permissions; pages/components gate on
  `hasPerm()`.
- **Cost-split by hiding, not zeroing:** the cost field is absent for staff (matches backend masking);
  the UI must not render an input or label for it without `catalog:read_cost`.
- Money is integer cents from API → store → UI; `centsToZAR` for display, `zarToCents` for input parse.
- `activeBusinessId` comes from `memberships` (auto-select when single); all commerce requests carry it.

## 9. Error handling & offline UX

- Global online/offline indicator + per-row sync badge (`pending` / `synced` / `conflict` / `error`).
- Sync failures are retryable and **never block local work**.
- **Image upload is online-only in B1** — multipart is not queued. Offline, the product is created
  normally and the image upload is deferred with a clear "image will upload when online" state; on
  reconnect the deferred upload runs against `POST /products/:id/image` once the product has a `serverId`.

## 10. Testing strategy

- **Unit (Vitest):** `money` (round-trip cents↔ZAR, reject bad input), `ids` (uniqueness/ordering),
  `outbox` (enqueue/list-sorted/cap-100/remove), `repo` (CRUD over a store), and especially **`sync.ts`**
  — mock `/sync` responses to assert each per-op path (APPLIED/DUPLICATE/CONFLICT/REJECTED) and the
  `clientId → serverId` mapping.
- **Convergence test:** queue N offline product ops, run sync against a mocked batch endpoint, assert
  final IndexedDB state equals server truth and the outbox fully drains.
- **Component tests:** products list + form, including the **staff cost-masking** case (no cost field
  rendered without `catalog:read_cost`).
- Mirrors M2-A's TDD + gate-green discipline (lint + typecheck + tests all green before merge).

## 11. Non-blocking backend follow-ups (flag, do not block B1)

- **Pagination** on `GET /products` is not specced — B1 fetches the full active list (acceptable at
  merchant scale); flag cursor/limit for B2 when orders/customers lists grow.
- **Search/filter** on list endpoints and **dashboard date-history** are B2 concerns.

## 12. GA gates (tracked, not B1 blockers)

- Customer-directory consent ruling (bukani-compliance) — affects B2 customers, not B1.
- PostHog sub-processor DPA + EU/self-host pin — analytics ships dark (M2-C).
- bukani-security review of sync/idempotency + RBAC cost-split — applies to the commerce surface;
  B1 keeps cost-split enforced client-side on top of the backend's authoritative masking.

## 13. B2 preview (out of scope here)

Orders (multi-line create/complete/void/payment), customers directory, stock-adjustment UI, merchant
dashboard (SAST day boundary, financial fields gated), and the onboarding wizard — all reuse the B1
engine, session context, and money/RBAC utilities unchanged.
