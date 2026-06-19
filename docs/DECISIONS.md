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
> decisions; **ADR-INY-008..011** persist the frozen M1 platform-foundation contracts.

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
