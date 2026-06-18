# Inyuku Digital — Full-Platform Program Roadmap (Design)

> **Status:** Design / approved shape, pending spec review
> **Date:** 2026-06-18
> **Scope decision:** Build the full platform end-to-end, re-sequenced realistically.
> **Constraints:** Small team (3–6 devs). Greenfield. Lending deferred (data foundation only).
> **Stack decision (RESOLVED 2026-06-18):** Next.js (App Router) on Vercel as a **pure client** of an
> **Express 4 + Prisma 6 backend on Railway** (Postgres 16 EU-pinned, Redis 7, Cloudflare R2). In-house
> JWT auth, TradeSafe escrow, 360dialog WhatsApp, Claude via `lib/ai.js`. **Clerk + Supabase dropped.**
> See `docs/DECISIONS.md` (ADR-001..007) and EA-ADR-014/015. The §3 table below is updated to match.

This document is the **program-level roadmap**, not an implementation plan. It sequences
the work into tracks and milestones, records the up-front architecture decisions, and
identifies which milestones become their own brainstorm → spec → plan → build cycles.

It supersedes the sequencing and stack assumptions in `docs/SDLC_ROADMAP.md` and
`docs/FEATURE_BACKLOG.md`. Those remain valid as the **technical-debt inventory** of the
existing site; this document corrects the *plan to build the platform*.

---

## 1. Why this document exists (the corrections it makes)

The four audits (`01`–`04`) are accurate and evidence-backed as a diagnosis of the
current brochureware SPA. The synthesis docs (`SDLC_ROADMAP.md`, `FEATURE_BACKLOG.md`)
are good inventories. But as a *plan to build the app* they had one structural flaw and
several material omissions, corrected here:

1. **Two projects were mashed into one timeline.** "Productionize the marketing site"
   (weeks) and "build a regulated fintech + commerce platform" (the better part of a
   year) were treated as one linear effort. The platform was budgeted as "Weeks 5–8."
   This roadmap separates them and gives an **honest 9–14 month envelope**.
2. **Long-lead external dependencies were treated as coding tasks.** Meta WhatsApp
   business verification and payment-provider FICA onboarding take weeks of *other
   people's* time. They now start on **day one of M0** as background tracks.
3. **Regulation was a checkbox ("POPIA/GDPR").** It is now a **gating track** (E).
   GDPR is mostly noise for an SA-only product; **POPIA** is the applicable law.
4. **Lending pulled in heavy regulation silently.** "Business credit profile for
   micro-loan eligibility" implies the National Credit Act / NCR. **Lending is
   deferred**; we build only the *verified-transaction-data foundation* now.
5. **A SA payments inaccuracy.** Stripe was listed as an option — **Stripe does not
   onboard South African businesses for payouts.** Dropped in favour of SA-native rails.
6. **Cross-cutting concerns were buried as late features.** **i18n** and
   **offline/PWA** are now foundational, not Phase-3 items.
7. **No product layer.** No problem statement, target-user definition, MVP, or success
   metrics existed. KPIs added (§7).

---

## 2. Guiding principles

- **Buy over build.** A 3–6 person team writes glue, not platforms. Managed services for
  auth, payments, comms, infra.
- **External lead times start at M0.** What others must approve (Meta, payment FICA,
  POPIA info-officer registration) runs in the background from the first week.
- **Regulation gates shipping.** POPIA and PCI scope decisions block the payments
  milestone. They are not optional polish.
- **Every milestone ends in something a real spaza-shop owner can use.** No
  internal-only increments.
- **Offline-first is product-defining**, not a nice-to-have. Load-shedding and
  intermittent, expensive mobile data are the operating environment.

---

## 3. Architecture decisions (RESOLVED 2026-06-18)

> **RESOLVED.** The EA reviewed this roadmap, the founder ruled on the escalations, and `bukani-architect`
> produced the backend topology. The decisions below are now final (M1 build gated on EA-ADR-014/015
> sign-off). **Canonical:** `docs/DECISIONS.md` (Inyuku ADR-001..007) and the portfolio register
> `/home/sibnaye/Development/bukani-decisions.md` (**EA-ADR-014** topology, **EA-ADR-015** POPIA
> sub-processors). The earlier "Clerk + Supabase" rows are **withdrawn** — see those docs for full reasoning.

| Area | Decision | Notes / reference |
|---|---|---|
| **Frontend** | **Next.js (App Router)** on **Vercel** — a **pure client** of the backend (no data/business logic) | Marketing SSR/SSG + merchant PWA. M0-B lead Route Handler is a thin BFF proxy to Express `/leads`. ADR-001. |
| **Backend** | **Express 4 + Prisma 6 on Railway** (Docker, `prisma migrate deploy` on boot, `/healthz`) | System of record; DrAppv2 chassis. ADR-001 / EA-ADR-014. |
| **Database** | **Railway Postgres 16, EU-region-pinned**; **Prisma = schema source of truth** | **Supabase dropped.** ORM question (Drizzle vs Prisma) closed → Prisma. ADR-001 / EA-ADR-014/015. |
| **Cache/queue** | **Railway Redis 7** (cache, rate-limit, OTP); **BullMQ scoped to fulfilment only** | ADR-007 / EA-ADR-007/013. |
| **Storage** | **Cloudflare R2 (EU)** behind the chassis storage driver (`r2`) | Private-by-default + short-TTL signed URLs; product images may be public-CDN. **Supabase Storage dropped.** ADR-003 / EA-ADR-015. |
| **Auth** | **In-house JWT + refresh rotation, bcrypt-12, permission-RBAC**; cross-subdomain HttpOnly cookies | Cookie domain `.inyuku.co.za` (PROVISIONAL), API at `api.inyuku.co.za`. Standalone identity silo. **Clerk OUT.** ADR-004 / EA-ADR-013/014. |
| **i18n** | **next-intl** | Foundational in M1. Languages: English, isiZulu, isiXhosa, Afrikaans, Sesotho, Setswana, Sepedi, Xitsonga. |
| **Offline/PWA** | PWA shell for the merchant app | Installable, offline-capable. App-Router-compatible service worker. |
| **Payments** | **TradeSafe escrow** (GraphQL, OAuth2; Tokens/transactionCreate/Allocations; split + settlement) | Inyuku never holds funds → not a payment facilitator. Ozow via TradeSafe. **Stripe dropped** (not available to SA businesses). In-person POS deferred. EA-ADR-014. |
| **WhatsApp** | **360dialog** BSP | De-risks Meta verification. Verification starts M0. EA-ADR-014. |
| **Email** | **Resend** | Transactional + lifecycle. EA-ADR-014. |
| **SMS/OTP** | **BulkSMS** | OTP, alerts. EA-ADR-014. |
| **AI** | **Claude via the portfolio `lib/ai.js` gateway** — **no direct `@anthropic-ai/sdk` calls** | Multilingual Business Agent + report generation. Inyuku = 2nd consumer → promotion review by M5. EA-ADR-009/010/011/012. |
| **Observability** | **Sentry** (errors) + **OpenTelemetry**; analytics PostHog/Plausible TBD | Conversion + product events. EA-ADR-014. |

---

## 4. Workstream decomposition

The single roadmap becomes **5 tracks**, sequenced by milestone.

| Track | Owns | Active |
|---|---|---|
| **A. Product foundation** | Next.js migration, repo/CI, app shell, Express/Prisma backend + in-house JWT auth, tenant data model, i18n, observability | M0–M1, then steady |
| **B. Commerce core** | Catalog, inventory, orders, merchant dashboard, customers | M2+ |
| **C. Channels** | WhatsApp Commerce Engine, AI Business Agent | M3–M5 (gated by Meta approval from M0) |
| **D. Money** | Digital payments, settlement, transaction history, credit-*data* foundation (no lending) | M4 (gated by provider onboarding from M0 + Track E) |
| **E. Compliance & ops** (cross-cutting) | POPIA register + info-officer registration, PCI scoping, security reviews, SRE/runbooks, KPIs | Continuous; gates D |

---

## 5. Milestone sequence (honest, 3–6 devs, greenfield)

> Durations are calendar estimates for a 3–6 person team with normal interruptions.
> **External-dependency tracks (Meta, payments FICA) and POPIA registration start in M0**
> and run in parallel; they are not in the critical coding path if kicked off on time.

### M0 — Foundation, migration & long-lead kickoff (~4–5 weeks)
- Git init + remote, CI (lint/typecheck/test/build/audit), project metadata, `.nvmrc`/engines.
- **Migrate the 6 marketing pages from Vite/React-Router SPA → Next.js App Router.**
- Prune dead shadcn scaffold + unused deps; remove the dev-only inspect plugin.
- Wire existing forms (contact/demo/report) to a real lead API (first Route Handler).
- Fix the known content bugs: Stories filter, donut chart, banner stat, placeholder team.
- Add legal/missing pages: `/contact`, `/privacy`, `/terms`, `/help`, `/partners`.
- §3 ADRs are **resolved** (EA-ADR-014/015 + `docs/DECISIONS.md`); EA-ADR-014/015 sign-off gates M1.
- **Background (start day one):** **domain + DNS on Cloudflare** (brand domain TBD — M0 blocker before M1);
  submit Meta/360dialog business verification; begin **TradeSafe** go-live onboarding; begin **POPIA
  operator-DPA** execution with Railway + Cloudflare and EU-region provisioning; begin POPIA
  information-officer registration with the Information Regulator.

### M1 — Platform foundation (~6–8 weeks) — REWRITTEN (was "Clerk + Supabase")
> *Gated on EA-ADR-014/015 sign-off and the M0 domain decision.*
- **Stand up the Express 4 + Prisma 6 backend on Railway** (Docker, `prisma migrate deploy` on boot,
  `/healthz`), vendoring-in the cross-cutting chassis baseline (response envelope, jwt + auth.middleware,
  permission guards, logger + pii-mask, crypto + Setting, audit-logger + AuditLog/ErrorLog, rate-limit,
  storage + blob, email, sms, ai), OpenAPI contract + CI drift check, Helmet, Zod, CORS locked to `*.inyuku.co.za`.
- **In-house JWT auth + refresh rotation + permission-RBAC**; cross-subdomain HttpOnly cookies; phone OTP.
- **Multi-tenant model** (Prisma, snake-case `@@map`): Business (tenant root) + `businessId` on every domain
  table + Membership(userId, businessId, permissions). Baseline tables: User, RefreshToken,
  PasswordResetToken, PhoneOtp, Business, Membership, Permission, AuditLog, ErrorLog, Setting, Consent,
  ConsentRevocation, AiUsage, Lead.
- **Cloudflare R2 (EU)** behind the chassis storage driver (`r2`); EU-region pin on Postgres/Redis/R2.
- Env/secrets via Railway secrets + encrypted `Setting`; observability (Sentry + OpenTelemetry) live.
- next-intl scaffolding + translation workflow (rails exist; not all copy translated yet).
- *No commerce features yet — this is the spine.*

### M2 — Commerce core (~8–10 weeks)
- Merchant onboarding wizard (business type, language, WhatsApp number, location).
- Product catalog (CRUD + images), inventory + low-stock alerts, order management,
  customer directory.
- Merchant dashboard. **First milestone a merchant runs their shop on.**
- PWA/offline shell for the merchant app.

### M3 — WhatsApp Commerce Engine (~6–8 weeks)
- *Depends on M0's Meta verification landing.*
- Catalog push, order capture, approved templates, 24-hour session-window handling,
  auto-replies, webhook ingestion.

### M4 — Digital payments (~6–8 weeks)
- *Gated by Track E: PCI scope confirmed (provider-hosted → SAQ-A) and POPIA gate passed.*
- Payment links + card reader (Yoco), settlement, transaction history.
- **Payments-grade QA:** idempotency, reconciliation, no-double-charge, webhook replay.
- Begin capturing verified transaction history (the credit-data foundation; **no lending**).

### M5 — AI Business Agent (~6–8 weeks)
- Multi-language assistant (Claude): inventory alerts, payment reminders, report
  generation, conversational help.

### M6 — Reports, KPIs, credit-data foundation, full multi-language rollout (ongoing)
- Weekly/monthly sales/expense/profit reports; KPI dashboards; complete the 8-language
  content translation; harden the verified-transaction data model for a *future* lending
  program.

**Honest total: ~9–14 months** to the full platform — versus the prior docs' "Weeks 5–8"
for the same scope.

---

## 6. What the Next.js migration absorbs for free

The M0 migration resolves several frontend-backlog items by construction:

| Backlog item | Resolved by |
|---|---|
| FE-01 HashRouter → clean URLs | Next file-based routing |
| FE-02 route code-splitting / <250 kB chunk | automatic per-route splitting |
| FE-03 error boundary | `error.tsx` |
| FE-04 404 page | `not-found.tsx` |
| MKT-01 per-page SEO meta | Metadata API |
| MKT-04 image optimization (AVIF/WebP, lazy, srcset) | `next/image` |

GSAP/Framer animations remain in `"use client"` components. The dead shadcn prune is
independent of the framework and still required.

---

## 7. Product success metrics (new — the docs had none)

Define and instrument from M1:
- **Activation:** merchant completes onboarding + adds first product.
- **Engagement:** weekly active merchants; orders processed/week.
- **GMV:** gross value transacted once payments ship (M4).
- **Retention:** 4-week and 12-week merchant retention.
- **Channel:** WhatsApp orders as a share of total (post-M3).
These gate "is the platform working," distinct from the code-health metrics in the audits.

---

## 8. Compliance & risk register (Track E)

| Item | Status in this plan |
|---|---|
| **POPIA** — responsible-party duties, info-officer registration, consent, retention matrix, PAIA manual, breach process | **In scope, gating.** Registration starts M0. See `docs/POPIA.md`. |
| **POPIA §72 cross-border + sub-processors** | **Basis = binding operator DPAs (NOT consent)** with Railway + Cloudflare R2 as EU sub-processors; EU-region pin on Postgres/Redis/R2. **Hard gate: no production PII before the bukani-compliance sub-processor risk assessment + signed DPAs.** EA-ADR-015. |
| **PCI-DSS** | **SAQ-A** — card data never touches Inyuku via the **TradeSafe-hosted gateway**. Card-present POS deferred (pulling it forward re-opens scope). Confirmed before M4 ships. |
| **FICA / KYC** | Handled via TradeSafe merchant onboarding (M0 lead time). |
| **WhatsApp / Meta commerce policy** | Template approval + business verification via 360dialog BSP (M0 lead time). |
| **Consumer Protection Act (CPA)** | Applies to the commerce surface; review in M2/M4. |
| **NCA / NCR (lending)** | **Deferred.** Only verified-transaction *data* is built now — **internal analytics, NOT a credit score** (ADR-006). |
| **Data residency** | **Resolved:** Railway Postgres/Redis + Cloudflare R2 **EU-region-pinned** under POPIA §72 operator DPAs (Supabase region question is moot — Supabase dropped). EA-ADR-015. |

**Top risks:** Meta verification or payment FICA slipping (mitigation: start M0, both have
no-code dependencies); under-estimating the Next migration (mitigation: timeboxed M0,
pages already exist as components); offline/PWA complexity under App Router.

---

## 9. Sub-spec decomposition

This program is too large for one implementation spec. Each of the following gets its own
brainstorm → spec → plan → build cycle:

- **M0** — Foundation + Vite→Next migration (next up).
- **M1** — Platform foundation (auth, data model, i18n, observability).
- **M2** — Commerce core.
- **M3** — WhatsApp Commerce Engine.
- **M4** — Digital payments (with the Track-E compliance spec as a dependency).
- **M5** — AI Business Agent.

The immediate next step after this roadmap is approved is to write the **M0 implementation
plan**.

---

## 10. Open items to confirm during M0

**Resolved (2026-06-18 — EA-ADR-014/015, `docs/DECISIONS.md`):**
- ~~ORM choice: Drizzle vs Prisma~~ → **CLOSED: Prisma 6** (schema source of truth).
- ~~WhatsApp: Meta Cloud API direct vs 360dialog BSP~~ → **CLOSED: 360dialog BSP.**
- ~~Payments: Yoco vs Paystack~~ → **CLOSED: TradeSafe escrow** (Inyuku never holds funds; Ozow via TradeSafe).
- ~~Supabase region (data-residency)~~ → **REMOVED: Supabase dropped.** Residency = Railway/R2 **EU-pinned**, §72 operator DPAs (EA-ADR-015).

**Still open:**
- **Brand/cookie domain** — `.inyuku.co.za` is PROVISIONAL; **domain + DNS on Cloudflare is an M0 blocker before M1**.
- Analytics: PostHog (product + events) vs Plausible (privacy-light, simpler).
- Monthly budget ceilings (founder TBD); role owners incl. Information Officer (founder TBD).
- `lib/ai.js` promotion to a deployed portfolio service (decision by M5, EA-ADR-009).

> **Note:** Git is not yet initialised in this repo (it's M0 task 0.1), so this design
> document cannot be committed yet. Initialise Git early in M0 and commit `docs/` as the
> first content commit.
