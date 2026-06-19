# Inyuku Digital — Project Intelligence (CLAUDE.md)

> **Last synced:** 2026-06-19 (Documentation Lead, post-M1-contract-freeze + Fastify amendment).
> This file reflects the **resolved** architecture. The roadmap's original "Clerk + Supabase" stack
> **no longer applies** — see `docs/DECISIONS.md` and EA-ADR-014/015/016.
> **Backend framework is Fastify 5 (TypeScript)** — EA-ADR-014 was **amended (2026-06-19)** and **EA-ADR-016**
> added (the reference chassis is Fastify, not Express). The frozen M1 platform-foundation contracts now live
> in `docs/API.md` + `docs/SCHEMA.md`.

## 1. Project overview

**Inyuku Digital** is a South African informal / small-business commerce platform: WhatsApp commerce,
digital payments (escrow), inventory & orders, a merchant dashboard, and an AI business assistant.
**Lending is deferred** — only a verified-transaction-data foundation is built now, and that data is
**internal merchant analytics only, NOT a credit score** (keeps NCA/NCR out of scope; ADR-006).

- **Program shape:** full platform, re-sequenced realistically (~9–14 months), small team (3–6), greenfield.
- **Operating environment:** mobile-first, load-shedding, expensive/intermittent data → offline-first PWA, i18n.
- **Status:** Next.js migration done (M0-B/C); **M1 platform-foundation contracts frozen** (bukani-architect,
  2026-06-19) → `docs/API.md` + `docs/SCHEMA.md`; EA-ADR-014/015 **SIGNED** (M1 gate #4 cleared); M1-A build
  plan in progress.

## 2. Resolved stack (Option A — full portfolio reference-architecture snap)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js (App Router) on Vercel** | Marketing SSR/SSG + merchant PWA. **Pure client** of the backend — no data/business logic. M0-B lead Route Handler is a thin BFF proxy to the Fastify `/v1/leads`. |
| Backend | **Fastify 5 (TypeScript) + Prisma 6 on Railway** | Docker, `prisma migrate deploy` on boot, `/healthz`. Modelled on the DrAppv2 Fastify chassis (`/home/sibnaye/Development/DrAppv2/backend/`). System of record. **(Framework corrected Express→Fastify — EA-ADR-014 amendment / EA-ADR-016.)** |
| Datastore | **Railway Postgres 16, EU-pinned** | Prisma = schema source of truth. **Supabase DROPPED.** |
| Cache/queue | **Railway Redis 7** | Cache, rate-limit, OTP. BullMQ scoped to the orders/fulfilment module only (ADR-007). |
| Object storage | **Cloudflare R2 (EU)** | Behind the chassis storage driver (`r2` driver). Private-by-default + short-TTL signed URLs; product images may be public-CDN. |
| Auth | **In-house JWT + refresh rotation, bcrypt-12, permission-RBAC** | Cross-subdomain HttpOnly cookies on `.inyuku.co.za` (PROVISIONAL). API at `api.inyuku.co.za`. Standalone identity silo — NO Bukani SSO. **Clerk OUT.** |
| Payments | **TradeSafe escrow** | GraphQL, OAuth2; Tokens/transactionCreate/Allocations; split + settlement. Inyuku never holds funds → not a payment facilitator. Ozow via TradeSafe. **Stripe dropped.** In-person POS deferred. |
| WhatsApp | **360dialog BSP** | De-risks Meta verification. |
| AI | **Claude via `lib/ai.js` gateway** | Vendored-in. **No direct `@anthropic-ai/sdk` calls.** EA-ADR-009/011/012 governance. Inyuku = 2nd consumer → triggers gateway promotion review by M5. |
| Email / SMS | **Resend / BulkSMS** | |

## 3. Conventions (mandatory)

- **Cross-cutting standards vendored-in from the DrAppv2 Fastify chassis:** response envelope (route-helpers),
  jwt + auth `onRequest` guards, permission guards, logger + pii-mask, crypto + Setting (AES-256-GCM; key from a
  Railway secret = separate trust boundary), audit-logger + AuditLog/ErrorLog, rate-limit, storage + blob
  (+ `r2` driver), email, sms, ai. Plus OpenAPI contract (`@fastify/swagger` + `fastify-type-provider-zod`) +
  CI drift check, `/health` + `/ready`, Sentry + OpenTelemetry, `@fastify/helmet`, `@fastify/cors` locked to
  `*.inyuku.co.za`, Zod validation, stated p95 budgets. **Framework-agnostic primitives port verbatim from
  the chassis; framework-coupled pieces (app bootstrap, auth guards, route registration, validation wiring)
  are adapted, not re-authored. Net-new vs the single-tenant chassis: refresh-rotation/cookie plumbing,
  route-layer permission-RBAC, and `Business`/`Membership` multi-tenancy** (EA-ADR-016 scope note).
- **The frozen M1 contracts are canonical:** API/auth/permission/env contract → `docs/API.md`; Prisma schema
  + tenancy/money/audit conventions → `docs/SCHEMA.md`.
- **Money is ZAR-as-integer-cents.** No floats for money, ever.
- **Multi-tenancy from day one:** `Business` = tenant root; `businessId` FK on **every** domain table;
  `Membership(userId, businessId, permissions)`. Actors: MERCHANT_OWNER, MERCHANT_STAFF, ADMIN, SUPPORT,
  plus the AI agent as its own least-privilege principal.
- **No direct Anthropic SDK calls** — all AI goes through `lib/ai.js` (semantic tiers, kill switch, cost log).
- **AI proposes, the gated order/fulfilment flow disposes.** Agent tools are read-scoped; writes are gated.
- **PII minimised in prompts; logs PII-masked** (POPIA).
- Prisma models use **snake-case `@@map`**.

**Baseline tables (Prisma):** User, RefreshToken, PasswordResetToken, PhoneOtp, Business, Membership,
Permission, AuditLog, ErrorLog, Setting, Consent, ConsentRevocation, AiUsage, Lead.

## 4. Compliance posture

- **POPIA gating track.** Info-officer registration with the Information Regulator (M0).
- **§72 cross-border basis = binding operator DPAs** (NOT consent) with Railway + Cloudflare as EU
  sub-processors. EU-region pin on Postgres/Redis/R2. **No production PII before the bukani-compliance
  sub-processor risk assessment + signed DPAs** (EA-ADR-015 gate).
- **PCI: SAQ-A** — card data never touches Inyuku (TradeSafe-hosted gateway). Card-present POS deferred.
- **Lending-data boundary:** internal analytics only, not a credit score. NCA/NCR deferred with lending.
- **CPA** review on the commerce surface in M2/M4.

## 5. Sequencing (resolved)

- **M0-A** — repository foundation (in progress).
- **M0-B** — Next migration (the lead Route Handler is a thin BFF proxy to the Fastify `/v1/leads`).
- **M1** — **stand up the Fastify/Prisma backend + cross-cutting baseline + tenant model + R2**
  (REWRITTEN from the roadmap's "Clerk + Supabase" M1).
- **M0 long-lead tracks:** domain + DNS on Cloudflare; POPIA operator DPAs (Railway + R2); EU-region
  provisioning; Meta/360dialog verification; TradeSafe go-live.
- **EA-ADR-014/015 sign-off gates the M1 build.**

## 6. Binding EA-ADRs (portfolio decisions that govern Inyuku)

| EA-ADR | Binds Inyuku because |
|---|---|
| EA-ADR-005 | Single customer/billing source-of-truth (portfolio precedent). |
| EA-ADR-009 | Shared `lib/ai.js` gateway is the AI standard; Inyuku is the 2nd consumer → promotion review by M5. |
| EA-ADR-010 | Anthropic concentration bounded by the provider-swappable gateway. |
| EA-ADR-011 | AI cost governance — tiering, rate limits, R3,000/mo ceiling, kill switch. |
| EA-ADR-012 | AI autonomy boundary + third STRIDE gate for the tool-using Business Agent. |
| EA-ADR-013 | Clerk/Stripe OUT; resale/in-house-auth posture (upheld here). |
| **EA-ADR-014** | **Inyuku backend/datastore/auth-domain topology (Option A). AMENDED 2026-06-19: backend framework is Fastify 5 (TypeScript), not Express — to match the real DrAppv2 chassis. SIGNED 2026-06-19.** |
| **EA-ADR-015** | **Railway + Cloudflare R2 as POPIA sub-processors; EU pin; §72 operator-DPA basis. SIGNED 2026-06-19.** |
| **EA-ADR-016** | **Portfolio backend-framework reconciliation: the reference chassis is Fastify, not Express. Radar corrected → Node + Fastify 5 (TypeScript) = Adopt; Express = Hold (legacy-only, no new backends). Drives the EA-ADR-014 amendment.** |

## 7. Open items (do not invent answers)

- **Brand/cookie domain** — `.inyuku.co.za` is PROVISIONAL; domain selection is an **M0 blocker before M1**.
- **Monthly budget ceilings** — founder TBD.
- **Role owners** (Information Officer, ops) — founder TBD.
- **`lib/ai.js` promotion** to a deployed portfolio service — decision by M5 (EA-ADR-009).
- **Retention periods** — TBD with bukani-compliance (POPIA.md §6).

## 8. Docs index

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | This file — resolved stack, conventions, binding EA-ADRs. |
| `docs/API.md` | **M1 API contract** — response envelope, auth + cookies + rotation, permission registry + role map, OpenAPI route list, `/v1/leads`, env + Settings contract. |
| `docs/SCHEMA.md` | **M1 Prisma schema** — table-by-table, tenancy/money/soft-delete conventions, audit `(entity,action)` tuples. |
| `docs/DECISIONS.md` | Inyuku ADR-001..007 + **ADR-INY-008..011** (M1 foundation; reference EA-ADR-014/015/016). |
| `docs/POPIA.md` | Processing register, §72 transfer log, sub-processors, consent ledger, retention, lending boundary. |
| `docs/THREAT-MODEL.md` | STRIDE for payments, AI agent, auth, PII storage + sign-off gates. |
| `docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md` | Program roadmap (stack rows now point to DECISIONS.md). |
| `docs/superpowers/plans/2026-06-18-m0a-repository-foundation.md` | M0-A implementation plan. |
| `docs/SDLC_ROADMAP.md` | **SUPERSEDED** — original-site tech-debt inventory only. |
| `docs/FEATURE_BACKLOG.md` | **SUPERSEDED** — original-site tech-debt inventory only. |
| `docs/01`–`04`*.md | Gap-analysis audits of the original SPA. |
| Portfolio: `/home/sibnaye/Development/bukani-decisions.md` | EA register (EA-ADR-014 amended/015/016). |
| Portfolio: `/home/sibnaye/Development/bukani-tech-radar.md` | Tech radar (Fastify 5 Adopt / Express Hold; R2/360dialog Trial; Supabase rejected). |
