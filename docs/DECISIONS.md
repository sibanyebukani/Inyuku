# Inyuku Digital — Architecture Decision Log (ADR)

> **Owner:** bukani-architect (Inyuku). **Scope:** Inyuku-product decisions.
> Portfolio-level decisions that bind Inyuku live in the EA register:
> `/home/sibnaye/Development/bukani-decisions.md` — see **EA-ADR-014** (backend/datastore/auth-domain topology;
> **amended 2026-06-19** — the backend framework is **Fastify 5 (TypeScript)**, not Express, to match the
> real DrAppv2 chassis), **EA-ADR-015** (Railway + Cloudflare R2 as POPIA sub-processors; EU pin; §72
> operator-DPA basis), and **EA-ADR-016** (portfolio reconciliation: the reference chassis is Fastify, not
> Express; radar = Fastify 5 Adopt / Express Hold).
>
> These product ADRs implement and reference those EA-ADRs. The full cross-portfolio reasoning lives in the
> EA register; the entries here record the Inyuku-specific shape. **ADR-001..007** are the product topology
> decisions; **ADR-INY-008..012** persist the frozen M1 platform-foundation contracts; **ADR-INY-013..016**
> persist the frozen M2 Commerce Core contracts (stock-as-movements, SUM stock, offline negative-stock,
> sync idempotency/LWW — `docs/specs/2026-06-21-m2-commerce-core-contracts.md`); **ADR-INY-017..020** persist
the M3-A WhatsApp BSP plumbing contracts (durable-outbox async-ack, provider-id idempotency, server-side
tenant routing, table-backed template registry — `docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`),
**implemented in the merged M3-A build (PR #11 / `e530574`)**.

This log supersedes the stack rows of the §3 ADR table in
`docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md`. The roadmap's original
"Clerk + Supabase" assumptions no longer apply.

---

## ADR-001 — Backend is Fastify 5 (TypeScript) + Prisma 6 on Railway; Next.js is a pure client

**Date:** 2026-06-18 · **Amended:** 2026-06-19 (framework corrected Express → Fastify)
**Status:** Accepted (EA-ADR-014/015 **SIGNED 2026-06-19** — M1 gate #4 cleared)
**Decided by:** bukani-architect (Inyuku), EA review, founder ruling
**References:** EA-ADR-014 (amended 2026-06-19), EA-ADR-016

> **Amendment (2026-06-19):** this ADR originally said **Express 4** "modelled on the DrAppv2 chassis." The
> actual chassis is **Fastify 5 (TypeScript)** (`buildApp()`, `app.register`, `onRequest` hooks,
> `fastify-type-provider-zod`, `@fastify/*`). The Express reading was wrong; the founder chose Fastify to
> match the real chassis and maximise reuse. Reconciled portfolio-wide in **EA-ADR-016**. Everything else in
> ADR-001 is unchanged.

### Context
The roadmap placed all logic in Next.js Route Handlers + Server Actions over Supabase. The portfolio
already runs a Fastify 5 (TypeScript) + Prisma 6 reference-architecture chassis (DrAppv2) in production.
*(Originally read as "Express 4" — corrected per the 2026-06-19 amendment / EA-ADR-016.)*

### Decision
The system of record is a **Fastify 5 (TypeScript) + Prisma 6 backend on Railway** (Docker,
`prisma migrate deploy` on boot, `/healthz`), modelled on the DrAppv2 chassis at
`/home/sibnaye/Development/DrAppv2/backend/`.
Prisma is the **schema source of truth**. **Next.js (App Router) on Vercel is a pure client** of this
backend — marketing SSR/SSG + the merchant PWA — owning **no data or business logic**. The M0-B lead
Route Handler is a **thin BFF proxy** to the Fastify `/v1/leads` endpoint, not a system of record.

### Rationale
One auth surface, one datastore/ORM posture, one secrets/audit/PII boundary, one set of cross-cutting
standards — reusing a chassis already proven in production rather than standing up a second backend posture.

### Consequences
- M1 is rewritten from "Clerk + Supabase" to "stand up the Fastify/Prisma backend + cross-cutting baseline
  + tenant model + R2."
- The Next app is re-scoped to a pure client; no Server Actions own domain state.
- API is first-party at `api.inyuku.co.za` (provisional domain — see ADR-004).

### Alternatives rejected
- Next Route Handlers + Server Actions as the system of record (splits logic across the edge; no shared chassis).
- A separate Nest/Express backend (no reuse of the portfolio Fastify chassis).

---

## ADR-002 — AI routes through the portfolio `lib/ai.js` gateway; no direct Anthropic SDK calls

**Date:** 2026-06-18
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku), EA review
**References:** EA-ADR-009, EA-ADR-010, EA-ADR-011, EA-ADR-012, EA-ADR-014

### Context
Inyuku ships an AI Business Assistant (multilingual help, reports, a tool-using Business Agent). The roadmap
said "Claude via API." The portfolio standard is a provider-swappable `lib/ai.js` gateway, and direct
`@anthropic-ai/sdk` calls are a Hold pattern.

### Decision
All AI calls go through the **vendored-in `lib/ai.js` gateway** (semantic tiers `classify`/`agent`/`complex`,
key via live settings, prompt caching, retries, per-feature usage/cost logging). **No source file calls
`@anthropic-ai/sdk` directly.** EA-ADR-009/011/012 governance applies: model tiering, prompt caching,
per-feature rate limits, the **R3,000/mo portfolio AI ceiling**, a kill switch, AI-proposes/gated-flow-disposes,
and a **STRIDE gate** (bukani-security) for the tool-using Business Agent before it ships in prod.

### Consequences
- Inyuku is the **SECOND `lib/ai.js` consumer** → triggers the EA-ADR-009 promotion review of the gateway to
  a deployed portfolio service **by M5**.
- AI usage is logged to the `AiUsage` table; the kill switch and tier mapping live in settings.
- The Business Agent runs as its own least-privilege principal (see ADR-005); writes flow through the gated
  order/fulfilment flow, never direct DB mutation.

### Alternatives rejected
- Direct `@anthropic-ai/sdk` calls per feature (Hold — no cost attribution, no kill switch, key drift).

---

## ADR-003 — Object storage is Cloudflare R2 (EU) behind the chassis storage driver

**Date:** 2026-06-18
**Status:** Accepted (POPIA gate per EA-ADR-015 before production PII)
**Decided by:** bukani-architect (Inyuku), EA review
**References:** EA-ADR-014, EA-ADR-015

### Context
The platform stores product images, story uploads, and generated reports. The roadmap proposed Supabase
Storage; Supabase is dropped (ADR-001 / EA-ADR-014).

### Decision
Object storage is **Cloudflare R2, EU bucket**, accessed **behind the chassis storage driver** — add an `r2`
driver to the existing `storage` + `blob` abstraction. **Private-by-default** with short-TTL signed URLs
served via authenticated routes; **product images may be public-CDN**. R2 is an approved POPIA sub-processor
(EU pin, operator DPA) per EA-ADR-015.

### Consequences
- A new `r2` driver is added to the chassis storage abstraction; callers see `storage`, not R2 specifics.
- The §72 transfer log and sub-processor list (POPIA.md) include R2; no production PII before the
  bukani-compliance sub-processor risk assessment.

### Alternatives rejected
- Supabase Storage (dropped with Supabase). Railway-local disk (not durable/portable).

---

## ADR-004 — Cookie domain `.inyuku.co.za` + API at `api.inyuku.co.za` (provisional); standalone identity silo

**Date:** 2026-06-18
**Status:** Accepted — **brand/cookie domain PROVISIONAL** (domain selection is an M0 blocker before M1)
**Decided by:** bukani-architect (Inyuku), EA review, founder ruling
**References:** EA-ADR-013, EA-ADR-014

### Context
Auth must work across the marketing site and the merchant PWA on sibling subdomains. The portfolio uses
in-house JWT + permission-RBAC + cross-subdomain HttpOnly cookies; Clerk is on Hold.

### Decision
**In-house JWT + refresh-token rotation, bcrypt-12, permission-RBAC at the route layer, cross-subdomain
HttpOnly cookies.** Cookie domain **`.inyuku.co.za`** with the API first-party at **`api.inyuku.co.za`**.
CORS locked to `*.inyuku.co.za`. **Standalone identity silo — NO Bukani SSO interop.** Clerk is OUT.

The brand/cookie domain is **PROVISIONAL**: `inyuku.co.za` is assumed, not decided. **Domain + DNS on
Cloudflare is an M0 long-lead blocker that must clear before the M1 build** locks cookie/host config.

### Consequences
- `/auth/refresh`, refresh-token rotation, and server-side logout (cookie clear) are required.
- Baseline auth tables: User, RefreshToken, PasswordResetToken, PhoneOtp.
- Once the domain is decided, confirm the cookie domain + `api.` host and lift the provisional flag (re-eval
  trigger in EA-ADR-014).

### Alternatives rejected
- Clerk / NextAuth (Hold — EA-ADR-013). Bukani-wide SSO interop (deliberately a standalone silo).

---

## ADR-005 — `Business` is the tenant root; `businessId` on every domain table

**Date:** 2026-06-18
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku), EA review
**References:** EA-ADR-014, EA-ADR-012

### Context
Inyuku is multi-tenant (many merchants) from day one. Tenant isolation must be structural, not bolted on.

### Decision
**`Business` = tenant root.** Every domain table carries a **`businessId` FK**. Membership is modelled as
**`Membership(userId, businessId, permissions)`**. Actors: **MERCHANT_OWNER, MERCHANT_STAFF, ADMIN, SUPPORT**,
plus the **AI Business Agent as its own least-privilege principal** (its tool calls pass the same permission
checks as any caller; writes go through the gated flow per ADR-002 / EA-ADR-012).

### Consequences
- Tenant scoping is enforced at the route/query layer against `businessId`; permission-RBAC is the gate.
- Baseline tables (Prisma, snake-case `@@map`): User, RefreshToken, PasswordResetToken, PhoneOtp, Business,
  Membership, Permission, AuditLog, ErrorLog, Setting, Consent, ConsentRevocation, AiUsage, Lead.

### Alternatives rejected
- Single-tenant-per-deploy (does not scale to many merchants). Supabase row-level security (Supabase dropped).

---

## ADR-006 — Verified-transaction data is internal merchant analytics, NOT a credit score

**Date:** 2026-06-18
**Status:** Accepted
**Decided by:** founder ruling, EA review, bukani-compliance input
**References:** EA-ADR-015

### Context
The roadmap mentioned a "business credit profile for micro-loan eligibility," which implies the National
Credit Act / NCR. Lending is deferred; only a verified-transaction-data foundation is built now.

### Decision
The verified-transaction data foundation is **INTERNAL merchant analytics only** — it is **explicitly NOT a
shareable, exportable, or third-party-facing credit score**. This boundary keeps **NCA/NCR out of scope**.
Lending (and any credit-bureau-style output) is a separate, future, regulated program.

### Consequences
- No API, export, or partner surface emits a credit score or credit-decision output.
- This boundary is documented in `docs/POPIA.md` (lending-data boundary) and is a re-evaluation trigger:
  un-deferring lending re-opens NCA/NCR.

### Alternatives rejected
- Building a shareable credit profile now (pulls NCA/NCR regulation in silently — rejected).

---

## ADR-007 — Redis 7 for cache/rate-limit/OTP; BullMQ scoped to the orders/fulfilment module only

**Date:** 2026-06-18
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku), EA review
**References:** EA-ADR-014, EA-ADR-007, EA-ADR-013

### Context
The platform needs caching, rate-limit backing, OTP storage, and async fulfilment for orders. Over-reaching
into a standalone orchestration platform (Kong, broad BullMQ) was rejected portfolio-wide (EA-ADR-013).

### Decision
**Railway Redis 7** backs **cache, rate-limit, and OTP**. **BullMQ is permitted only as a scoped
implementation detail inside the orders/fulfilment module** (per EA-ADR-007/013) — not a standalone
orchestration platform and not used for general background work outside fulfilment.

### Consequences
- Rate-limit (chassis `rate-limit` lib) and PhoneOtp flows are Redis-backed.
- Async order fulfilment uses BullMQ confined to the fulfilment module; the order state machine remains the
  authority for writes (gated flow, EA-ADR-012).

### Alternatives rejected
- Kong API Gateway (Hold — EA-ADR-013). Portfolio-wide BullMQ orchestration (out of scope per EA-ADR-013).

---

## ADR-INY-008 — `r2` storage driver added to the chassis storage/blob abstraction

**Date:** 2026-06-19
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku)
**References:** EA-ADR-014 (amended 2026-06-19 — chassis is Fastify 5/TS, not Express), EA-ADR-016, EA-ADR-015, ADR-003

### Context
Object storage is Cloudflare R2 (EU) (ADR-003), but the vendored DrAppv2 chassis `storage` + `blob`
abstraction shipped only its own driver set. R2 is S3-compatible but reached via a custom endpoint, and
public/CDN access must be host-restricted.

### Decision
Add an **`r2` driver** to the chassis storage/blob abstraction, selected by `STORAGE_DRIVER=r2`. It speaks
the S3-compatible API against `R2_ENDPOINT` (account-scoped) with `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
/ `R2_BUCKET`. The blob layer enforces an **R2 host allow-list** so signed/public URLs only resolve to the
configured R2 host and `R2_PUBLIC_BASE_URL`. Callers continue to depend on `storage`/`blob`, not R2 specifics.

### Consequences
- New env: `STORAGE_DRIVER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_ENDPOINT`, `R2_PUBLIC_BASE_URL` (documented in `docs/API.md`; `.env.example` owned by DevOps).
- Private-by-default + short-TTL signed URLs via authenticated routes; product images may be public-CDN.
- R2 stays on the POPIA sub-processor list (EA-ADR-015); no production PII before the compliance gate clears.

### Alternatives rejected
- A bespoke R2 SDK path outside the storage abstraction (leaks R2 specifics into callers; breaks portability).

---

## ADR-INY-009 — Access/refresh token split with rotation + reuse-detection

**Date:** 2026-06-19
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku)
**References:** EA-ADR-014 (amended 2026-06-19 — Fastify 5/TS chassis), EA-ADR-016, ADR-004

### Context
ADR-004 set in-house JWT + refresh rotation + cross-subdomain HttpOnly cookies. The Fastify chassis is a
single-tenant medical app and does **not** ship refresh-rotation/cookie plumbing — this is net-new for
Inyuku (per the EA-ADR-014 amendment / EA-ADR-016 scope note).

### Decision
Split auth into a **short-lived access token** and a **long-lived refresh token**:
- **Access:** 15-minute **HS256 JWT** in the `inyuku_at` cookie (HttpOnly, Secure, SameSite=Lax, 15m), signed
  with `JWT_SECRET`; verify also accepts `JWT_SECRET_PREVIOUS` for rotation.
- **Refresh:** 30-day **opaque** token in the `inyuku_rt` cookie (path `/v1/auth`); only its **sha256** is
  persisted in `RefreshToken`, which carries a **`familyId`**.
- **Rotation + reuse-detection:** each `/v1/auth/refresh` issues a new token in the same family and
  invalidates the old; presenting a rotated/old token = reuse → **revoke the whole family** (force re-login).
- Logout clears both cookies server-side and revokes the family.
- **CSRF defense:** `SameSite=Lax` is the primary defense; a secondary Origin/Referer allowlist check on
  unsafe methods rejects cross-site requests when `CORS_ALLOWED_ORIGINS` is configured.

### Consequences
- Requires `/v1/auth/refresh`, family-aware revocation, and server-side cookie clearing on logout.
- Env: `JWT_SECRET`, `JWT_SECRET_PREVIOUS`, `JWT_REFRESH_SECRET`. Cookie domain from `COOKIE_DOMAIN`.
- Backs the auth contract in `docs/API.md` and the `RefreshToken` table in `docs/SCHEMA.md`.

### Alternatives rejected
- Long-lived JWT only (cannot revoke). Stateful server sessions (not the chosen stateless posture).
- Storing raw refresh tokens (theft at rest → account takeover; sha256-only chosen).

---

## ADR-INY-010 — Permission-RBAC route guard over `Membership.role` ∪ `permissions[]`

**Date:** 2026-06-19
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku)
**References:** EA-ADR-014 (amended 2026-06-19 — Fastify 5/TS chassis), EA-ADR-016, EA-ADR-012, ADR-005

### Context
ADR-005 made `Business` the tenant root with `Membership(userId, businessId, permissions)`. The chassis uses
a **role-rank** model unsuited to per-tenant, per-action, multi-business membership (and to the AI agent as a
least-privilege principal).

### Decision
Enforce access with a route-layer **`requirePermission(perm)`** guard (a Fastify `onRequest` hook) over the
effective set = **`MembershipRole` defaults ∪ explicit `Membership.permissions[]`**, scoped to the resolved
`businessId`. **Tenant isolation** is structural — a grant in one business never crosses to another
(cross-tenant → 403/404). This **replaces the chassis role-rank model**. The `AI_AGENT` role is **read +
`ai:invoke` only**, no writes (EA-ADR-012). The full permission registry + role map is in `docs/API.md`.

### Consequences
- Every tenant-scoped route declares its required permission; the guard resolves `businessId` and checks it.
- New `Permission` registry; `Membership` carries `role` + `permissions[]`.
- Net-new vs the chassis (single-tenant) — adapts the chassis hook pattern, not its authorization model.

### Alternatives rejected
- Chassis role-rank (no per-action/per-tenant granularity; can't model the least-privilege AI agent).
- Hard-coded role→route checks (not extensible; no explicit per-member grants).

---

## ADR-INY-011 — Unified `Setting` table with `isSecret`→AES-256-GCM encryption

**Date:** 2026-06-19
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku)
**References:** EA-ADR-014 (amended 2026-06-19 — Fastify 5/TS chassis), EA-ADR-016, EA-ADR-011

### Context
The chassis splits live config across `AppSetting` and `notification_channel_configs`. Inyuku needs one live,
hot-swappable config + secrets store (AI kill switch, provider keys, tier mapping, channel creds) with
encryption at rest and read-time masking.

### Decision
A **single `Setting` table** (key/value/`isSecret`) replaces the chassis `AppSetting` +
`notification_channel_configs` split. When `isSecret = true`, the value is **AES-256-GCM** encrypted via the
chassis `crypto.ts` with an **`enc:v1:`** prefix; the key is `ENCRYPTION_KEY` (32-byte base64, a separate
trust boundary). Secret values are **never returned in plaintext** unless the caller holds
`settings:read_secret` (else masked). The known key catalogue lives in `docs/API.md` / `docs/SCHEMA.md`.

### Consequences
- One settings loader; the AI kill switch (`ai.enabled`) and tier mapping (`ai.tier.*`) live here.
- Secret rotation is value-level (`enc:v1:` versioned for future key rotation).
- `(settings, UPDATE)` is audited with secret values masked in the diff.

### Alternatives rejected
- Keeping the chassis two-table split (two code paths, two encryption postures). Env-only secrets (not
  hot-swappable; no per-tenant scope; no audit).

---

## ADR-INY-012 — Repo layout: backend in `server/`, frontend at repo root

**Date:** 2026-06-19
**Status:** Accepted
**Decided by:** bukani-architect (Inyuku)
**References:** EA-ADR-014 (amended 2026-06-19), EA-ADR-016

### Context
The project ships two independent deployables: a Next.js marketing/PWA frontend on Vercel and a Fastify
backend on Railway. They have different runtimes, dependencies, build steps, and deploy cadences.

### Decision
The backend lives in a new top-level **`server/`** package with its own `package.json`, `Dockerfile`, and
TypeScript build. The existing Next.js frontend remains at the repo root. The two packages are not npm
workspaces — each installs/builds/deploys independently — and CI runs a second job scoped to `server/`.

### Consequences
- Clear runtime boundary between frontend client and backend system-of-record.
- The backend can vend-in the DrAppv2 Fastify chassis without polluting the frontend dependency tree.
- CI/CD remains simple (two jobs) until a monorepo tool is justified later.

### Alternatives rejected
- npm/pnpm workspace (adds complexity before it is needed; independent deployables do not benefit from
  workspace linking at this stage).
- Backend inside `src/server` of the Next.js app (would blur the pure-client boundary).

---

## ADR-INY-013 — Stock is an append-only movement ledger, not a mutable integer column

**Date:** 2026-06-21
**Status:** Accepted (M2 Commerce Core)
**Decided by:** bukani-architect (Inyuku)
**References:** ADR-005, ADR-INY-016, EA-ADR-014; M2 brief/contracts (`docs/specs/2026-06-21-*`)

### Context
M2 needs inventory that works offline-first (founder ruling: offline = P0). A mutable `stock` integer
column cannot converge cleanly when two offline clients each mutate it and later sync — last-write-wins on
a single counter silently loses sales.

### Decision
Model stock as a **`StockMovement`** append-only ledger: each change is an immutable, signed `qtyDelta`
row (`OPENING` / `ADJUSTMENT` / `SALE` / `SALE_REVERSAL` / `RECEIVE`) with an `occurredAt` and a
per-tenant `clientId`. **`Product` carries no stock column.** Current stock = `SUM(qtyDelta)`. Order
complete emits a `SALE`; void emits a `SALE_REVERSAL`. Movements are never updated or deleted.

### Consequences
- Offline clients append movements independently; sync dedupes on `clientId` and the ledger is
  inherently convergent (sum is commutative) — no lost-update on a counter.
- Inventory is fully auditable (every change is a row); `(stock_movement, CREATE)` is audited.
- Reads compute a sum (see ADR-INY-014 for the no-cache decision and its re-eval trigger).

### Alternatives rejected
- Mutable `Product.stock` integer (non-convergent offline; loses concurrent sales; no audit trail).
- Periodic stock-take snapshots only (loses per-sale granularity and real-time low-stock alerts).

---

## ADR-INY-014 — Dashboard computes current stock via `SUM`; no cache column in M2

**Date:** 2026-06-21
**Status:** Accepted (M2 Commerce Core) — **re-eval trigger noted**
**Decided by:** bukani-architect (Inyuku)
**References:** ADR-INY-013

### Context
Stock-as-movements (ADR-INY-013) means current stock and dashboard low-stock counts are aggregates over
the ledger. A denormalised cached-balance column would speed reads but reintroduces a mutable value that
can drift from the ledger and complicates offline convergence.

### Decision
In M2, compute current stock and low-stock counts with `SUM(StockMovement.qtyDelta)` **on read** — **no
cached-balance column**. Keep the ledger as the single source of truth.

### Consequences
- Simpler, drift-free model for M2 volumes; no cache-invalidation logic.
- **Re-evaluation trigger:** re-assess a per-product cached balance / materialised view at **~50k
  movements** (per business) if read latency degrades.

### Alternatives rejected
- A cached `Product.stockBalance` column now (premature optimisation; drift risk; offline-merge complexity).

---

## ADR-INY-015 — Offline negative stock is allowed-and-flagged, not hard-rejected

**Date:** 2026-06-21
**Status:** Accepted (M2 Commerce Core) — founder-adopted
**Decided by:** founder ruling, bukani-architect (Inyuku)
**References:** ADR-INY-013, ADR-INY-016

### Context
With offline-first sales, a client may sell stock it cannot see was already depleted by another device.
Hard-rejecting a sale that drives stock negative at sync time would **defeat offline-first** — the sale
already physically happened in the shop; refusing it loses real revenue data.

### Decision
**Allow** movements/sales that take computed stock negative; **flag** the condition (surfaced to the
merchant for reconciliation) rather than rejecting. The founder adopted this explicitly: the ledger
records reality; reconciliation is a merchant workflow, not a sync hard-stop.

### Consequences
- Sync never rejects a sale purely for insufficient stock; negative balances are visible and actionable.
- Low-stock / negative-stock surfacing is a dashboard/UX concern, not a write gate.

### Alternatives rejected
- Hard-reject on negative stock (breaks offline-first; loses real sales; bad for the Nomsa persona).

---

## ADR-INY-016 — Offline sync: client `clientId` idempotency + last-writer-wins on `occurredAt`

**Date:** 2026-06-21
**Status:** Accepted (M2 Commerce Core)
**Decided by:** bukani-architect (Inyuku)
**References:** ADR-INY-013, ADR-INY-015, ADR-005; M2 contracts (`docs/specs/2026-06-21-m2-commerce-core-contracts.md`)

### Context
Offline-first (founder P0) requires a deterministic, retry-safe way to push locally-created
products/stock-movements/orders/customers and converge with the server and other devices.

### Decision
Every offline-creatable entity carries a **client-generated `clientId`**, uniqued per tenant
(`@@unique([businessId, clientId])`). A **batch-sync endpoint** (`POST .../sync`, `sync:write`) accepts
**≤ 100 ops** with **partial success** and a **per-op status** (`SyncOpStatus`: `APPLIED` / `DUPLICATE` /
`CONFLICT` / `REJECTED`). Re-submitting an applied `clientId` is a `DUPLICATE` no-op (idempotent). For
updates, conflicts resolve by **last-writer-wins on `occurredAt`**. The append-only stock ledger
(ADR-INY-013) is inherently convergent and needs no LWW.

### Consequences
- Network retries are safe (idempotent on `clientId`); the client can replay its queue.
- The sync envelope (`clientId`, `entity`, `op`, `occurredAt`, `payload`) + per-op response is in
  `docs/API.md` § Batch sync.
- **bukani-security review of the sync/idempotency path is a pre-GA gate** (`docs/THREAT-MODEL.md` M2).

### Alternatives rejected
- Server-generated IDs only (not retry-safe offline; can't dedupe client replays).
- CRDT/vector-clock convergence (over-engineered for M2; LWW + append-only ledger suffices).
- All-or-nothing batch (one bad op fails the whole queue; poor offline UX).

---

## ADR-INY-017 — Inbound WhatsApp webhook async-ack via a durable Postgres outbox (not a new BullMQ queue)

**Date:** 2026-06-22
**Status:** Accepted — **Implemented in M3-A** (merged PR #11 / `e530574`)
**Decided by:** bukani-architect (Inyuku)
**References:** ADR-007 (BullMQ scoped to orders/fulfilment only), EA-ADR-014 (360dialog BSP topology), `docs/THREAT-MODEL.md` §7 (DoS condition 5 — explicit architect decision required); M3-A contracts (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`)

### Context
The 360dialog inbound webhook is a public, unauthenticated network edge. The security gate (THREAT-MODEL §7,
DoS) requires the endpoint to **fast-ack** (verify → persist durably → 2xx) and do heavy work async, and
**explicitly routes the choice — durable outbox vs a NEW BullMQ queue — to the architect**, because BullMQ is
ADR-007-scoped to the orders/fulfilment module only and a webhook queue would extend that scope.

### Decision
Use a **durable Postgres outbox table (`WhatsAppInboundEvent`)** drained by an interval sweeper, **NOT** a new
BullMQ queue. The verified raw event is persisted to the outbox (with `providerEventId` unique) **before** the
fast 200; an interval worker claims `PENDING` rows (`FOR UPDATE SKIP LOCKED`), resolves the tenant, persists
`Conversation`/`Message`, and marks `PROCESSED`/`UNROUTED`/`FAILED` with bounded retry.

### Consequences
- The verified event lives in the **same transactional/durable boundary as `Message`** — a Redis flush or
  load-shedding event does **not** lose webhooks (Postgres-durable). Replay-safe via the same unique
  constraints (ADR-INY-018).
- **ADR-007's BullMQ scope is preserved** — no second queue infrastructure for M3-A.
- **Re-eval trigger:** if sustained inbound volume needs fan-out/priority/backoff a poller can't give,
  promote to a dedicated queue under a follow-up ADR (and reconcile ADR-007).

### Alternatives rejected
- A new BullMQ webhook queue (extends ADR-007 scope; Redis-durability is weaker than Postgres for a
  load-shedding environment; more infra for the M3-A volume).
- Synchronous processing inside the request (fails the fast-ack requirement; risks 360dialog retry storms).

---

## ADR-INY-018 — Inbound idempotency on the provider message/event id (distinct from the M2 client-`clientId`)

**Date:** 2026-06-22
**Status:** Accepted — **Implemented in M3-A** (merged PR #11 / `e530574`)
**Decided by:** bukani-architect (Inyuku)
**References:** ADR-INY-016 (M2 client-`clientId` sync idempotency), `docs/THREAT-MODEL.md` §7 (Replay condition 2); M3-A contracts (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`)

### Context
360dialog retries webhook delivery as normal behaviour, and a forged replay must be a safe no-op. The M2
idempotency convention (`clientId`, ADR-INY-016) is **client-generated** for offline-creatable merchant
entities — but a webhook has no Inyuku client; its dedup key is the **provider's** id.

### Decision
Inbound dedup is on the **provider message/event id**: `Message @@unique([businessId, providerMessageId])`
(per-message) and `WhatsAppInboundEvent @@unique([providerEventId])` (whole-event), both inserted
`ON CONFLICT DO NOTHING`. An **advisory ±5-min replay window** rejects events older than the skew **where a
trustworthy provider timestamp exists**; where it does not, idempotency is the primary control. This is
**distinct** from and does not replace the M2 `clientId` convention (which remains for M3-B offline-creatable
entities).

### Consequences
- Redelivery/replay is a deterministic no-op; the public endpoint cannot be made to double-apply.
- Two clearly-separated idempotency models in the codebase: provider-id (channel ingest) vs client-id
  (offline merchant writes) — documented so they are never conflated.

### Alternatives rejected
- Reusing `clientId` for webhooks (no Inyuku client generates the id; semantically wrong).
- Timestamp-only replay defence (insufficient without a trustworthy provider timestamp; idempotency is the
  durable control).

---

## ADR-INY-019 — Server-side WhatsApp tenant routing via an Inyuku-owned phone-number-id → businessId map

**Date:** 2026-06-22
**Status:** Accepted — **Implemented in M3-A** (merged PR #11 / `e530574`)
**Decided by:** bukani-architect (Inyuku); commissioned by `bukani-security` (THREAT-MODEL §7, CRITICAL)
**References:** ADR-005 (tenant root), `docs/THREAT-MODEL.md` §7 (Elevation/tenant-routing — CRITICAL condition 3); M3-A contracts (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`)

### Context
The inbound webhook has no JWT/cookie/RBAC. If the tenant were resolved from any attacker-controllable
payload field, a forged (or signature-stripped) request could write to the wrong `businessId` — a
confused-deputy cross-tenant PII/commerce breach. THREAT-MODEL §7 flags this as the **CRITICAL** threat.

### Decision
Tenant is resolved **only** by a server-side lookup of the WhatsApp **phone-number-id** (delivered by
360dialog in the payload metadata) against an **Inyuku-owned `WhatsAppChannel` map**
(`phoneNumberId` **globally unique** → `businessId`). **No `businessId` or tenant field is ever read from the
payload.** Routing runs **only after** signature verification passes. An **unmapped phone-number-id is
rejected** (no auto-provision) and audited `(whatsapp_webhook, UNROUTED)`. Channel provisioning is
admin/owner-only (`whatsapp:manage_channel`).

### Consequences
- Cross-tenant routing is unspoofable: the map is Inyuku-controlled, not payload-derived; the unique
  `phoneNumberId` guarantees one tenant per number.
- A webhook can never create a tenant; misdirected/unknown numbers fail closed and are forensically logged.

### Alternatives rejected
- Trusting a tenant hint in the payload (the exact confused-deputy vector the gate forbids).
- Auto-provisioning a channel on first unknown number (lets an attacker spray tenants into existence).

---

## ADR-INY-020 — Approved-template registry is table-backed (`WhatsAppTemplate`), not Setting-backed

**Date:** 2026-06-22
**Status:** Accepted — **Implemented in M3-A** (merged PR #11 / `e530574`)
**Decided by:** bukani-architect (Inyuku)
**References:** ADR-INY-011 (`Setting` table), M3 brief §6 (M3-S7 — approved-template constraint); M3-A contracts (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`)

### Context
WhatsApp requires that messages outside the 24h window use only Meta-**approved** templates with declared
parameters. M3-A needs a single source of which templates are sendable, their parameter schemas, status, and
language — queryable, per-tenant, RBAC-gated, and auditable.

### Decision
Model the registry as a **`WhatsAppTemplate` table** (per-`businessId`, `@@unique([businessId, name,
language])`, `status` with only `APPROVED` sendable, `paramSchema` Json, `category`→`sendClass` mapping),
**not** a Setting blob. A send must resolve an `APPROVED` row and satisfy its `paramSchema`, else `422`;
sending an unregistered/unapproved template is impossible. Template CRUD is `whatsapp:manage_channel`.

### Consequences
- Per-tenant, parameter-validated, status-tracked, RBAC- and audit-able — none of which a `Setting` blob
  expresses cleanly. Status enables the Meta approval lifecycle (`PENDING`/`APPROVED`/`REJECTED`/`PAUSED`).
- Reuses the M2 audit pattern: `(whatsapp_template, CREATE|UPDATE|DELETE)`.

### Alternatives rejected
- Setting-backed JSON registry (no per-row RBAC/audit, no clean parameter validation, no status lifecycle).
- Hard-coded template list in code (not per-tenant; needs a deploy to change; no merchant self-service).

---

## ADR-INY-021 — Conversation→Order linkage = nullable FK on `Order` (`Order.conversationId`)

**Date:** 2026-06-23
**Status:** **Accepted / IMPLEMENTED** (M3-B build complete / bukani-qa APPROVED 2026-06-25, branch `feat/m3b-backend`; migration `20260623124013_m3b_commerce_over_chat`)
**Decided by:** bukani-architect (Inyuku)
**References:** M3-B brief §10 / §8.6 (one-order-model), M3-B contracts §2.1 / §11 (`docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md`); ADR-005 (tenant root); THREAT-MODEL §8 Condition 1

### Context
S3/AC4 needs a captured WhatsApp `Order` linked back to its `Conversation` **without forking the one-order
model** — the captured order must remain an ordinary M2 `Order` (dashboard, ledger, RBAC, fulfilment seams).

### Decision
Add **one nullable FK column to the existing `Order`** — `conversationId String?`, `onDelete: SetNull`,
`@@index([conversationId])`, with the inverse `orders Order[]` on `Conversation`. Set **only** for
`channel = WHATSAPP` captures. Capture MUST assert `conversation.businessId === customer.businessId ===
order.businessId === route businessId` before writing the link (Condition 1) — never a cross-tenant link.

### Consequences
- One-order-model preserved; column is null-sparse on the hot `Order` table (zero cost for the M2 path).
- Models **repeat** orders on one thread (which a 1:1 `Conversation.orderId` cannot).
- `onDelete: SetNull` — the order is the durable **record-of-trade** and survives a conversation deletion
  (link clears); never cascade-delete an order from a conversation.

### Alternatives rejected
- Nullable `orderId` on `Conversation` (1:1; cannot model repeat orders on a thread).
- A thin join table (extra table + query hop for a strict ≤many cardinality a single FK expresses).

---

## ADR-INY-022 — Auto-reply config is a tenant table (`WhatsAppAutoReplyRule`), not a `Setting` blob

**Date:** 2026-06-23
**Status:** **Accepted / IMPLEMENTED** (M3-B build complete / bukani-qa APPROVED 2026-06-25, branch `feat/m3b-backend`)
**Decided by:** bukani-architect (Inyuku)
**References:** M3-B brief §10 (S5/AC6 owner-configures/staff-operates), M3-B contracts §2.2 / §11; ADR-INY-020 (same reasoning as the template registry); ADR-INY-011 (`Setting`)

### Context
S5/AC6 needs owner-configured greeting / exact-keyword / out-of-hours auto-reply rules: per-tenant, multiple
typed rows, queryable in the inbound drainer, RBAC-gated, auditable, with a SAST-hours window and a cooldown.

### Decision
Model the config as a **`WhatsAppAutoReplyRule` table** (mirrors ADR-INY-020): `businessId` FK, optional
`channelId`, `trigger` / `action` enums, `enabled` default `false`, `keyword`, `replyText`, SAST
`hoursStart`/`hoursEnd`/`daysActive[]`, `cooldownMinutes`, snake_case `@@map`. Writes are the new owner-only
`whatsapp:manage_autoreply`; reads are `whatsapp:read` (staff see rules + that they fired). Loop/cooldown
state is **derived from the audit ledger** (prior `(whatsapp_autoreply, FIRE)` for the same `ruleId` on the
conversation within `cooldownMinutes`; keyed by `ruleId`, not `trigger` — build fix `ceee30e`), not stored
on the rule.

### Consequences
- Clean RBAC, per-rule audit (`(whatsapp_auto_reply_rule, CREATE|UPDATE|DELETE)`), indexable trigger lookup.
- The evaluator is **provably non-AI** — never imports/calls `lib/ai.js` (CI grep assertion; Condition 6c).

### Alternatives rejected
- A `Setting` JSON blob (cannot express keyword matching / hours / cooldown / per-rule enable + RBAC + audit
  cleanly).

---

## ADR-INY-023 — Catalog share is a server-composed plain ZAR-priced text list

**Date:** 2026-06-23
**Status:** **Accepted / IMPLEMENTED** (M3-B build complete / bukani-qa APPROVED 2026-06-25, branch `feat/m3b-backend`)
**Decided by:** bukani-architect (Inyuku)
**References:** M3-B brief §8.7 (representation deferred to architect), M3-B contracts §4.2 / §11; `docs/PERSONAS.md` (Nomsa — entry-level Android); THREAT-MODEL §8 Conditions 2 & 4

### Context
S4 shares the catalog into a chat. Representation was deferred to the architect; Nomsa's entry-level Android /
low-literacy / low-data context and cost-split sensitivity (Sipho) drive the choice.

### Decision
A **server-composed, plain ZAR-priced text list** behind a thin `POST …/share-catalog` route: source = live
M2 catalog filtered to `status = ACTIVE` (archived excluded), out-of-stock **included-and-flagged**,
`costPriceCents` **never read** (sell-price-only query — Condition 2), dispatched through the **single**
`sendWhatsAppMessage()` choke-point (Condition 4). Server formats cents → `R{rands}.{cc}`.

### Consequences
- Lowest cost / most robust on low-end devices; one outbound path through the M3-A gates; price-formatting +
  RBAC stay **server-side** (no client price logic, no `costPriceCents` near the client).

### Alternatives rejected
- One product-message per item (cost + noise).
- A 360dialog interactive list (reconsider later only if a clearly-cheaper interactive variant is confirmed).

---

## ADR-INY-024 — Order capture rides the M2 `clientId`/`sync` path; no new offline mechanism, no new sync op

**Date:** 2026-06-23
**Status:** **Accepted / IMPLEMENTED** (M3-B build complete / bukani-qa APPROVED 2026-06-25, branch `feat/m3b-backend`)
**Decided by:** bukani-architect (Inyuku)
**References:** M3-B brief §10 (offline P0; one offline mechanism), M3-B contracts §4.1 / §11; ADR-INY-016 (clientId + LWW-on-`occurredAt`); ADR-INY-015 (deterministic SALE `clientId`); THREAT-MODEL §8 Conditions 8 & 9

### Context
S3/AC6 offline capture must converge **exactly once** on reconnect, with no parallel offline mechanism
(brief §10).

### Decision
Reuse the existing `entity:"order"` / `op:"create"` sync op and the `@@unique([businessId, clientId])` +
LWW-on-`occurredAt` resolution (ADR-INY-016). The **only** additions to the order-create surface are two
**optional** fields — `channel` + `conversationId`. **No** `entity:"whatsapp_order"`, **no** `op:"capture"`.
The sync order payload is validated with the **same typed Zod schema** as the online `POST /orders` body
(Condition 8 — closes finding #4; the `z.record(z.unknown())` passthrough is forbidden for the order op).

### Consequences
- One offline mechanism platform-wide; WhatsApp orders are ordinary M2 orders end-to-end; zero new
  convergence logic to test.
- End-to-end replay safety holds (Condition 9): inbound provider-id dedup ⇒ order `clientId` convergence ⇒
  deterministic SALE `clientId` ⇒ a redelivered inbound cannot produce a duplicate order or double decrement.

### Alternatives rejected
- A new `whatsapp_order` entity / `capture` op (a second offline mechanism to build, test, and keep
  convergent — for no benefit over the existing path).
