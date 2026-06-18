# Inyuku Digital — Agent Task Manifest (M0 → M1)

> **Purpose:** Tell each Bukani agent exactly what to do for the next executable milestones
> (M0-A complete-able now, M0-B, M1), with contracts, dependencies, and gates. Later
> milestones (M2–M5) get their own just-in-time manifests once M0/M1 decisions land.
>
> **Source of truth for decisions:** `docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md`,
> `docs/DECISIONS.md` (ADR-001..007), and `/home/sibnaye/Development/bukani-decisions.md`
> (EA-ADR-014/015 + the bindings 005/009/010/011/012/013).
>
> **Reference chassis to model the backend on:** `/home/sibnaye/Development/DrAppv2/backend/`.

---

## 0. Resolved stack (one-screen reference)

Next.js (Vercel, frontend only) → Express 4 + Prisma 6 (Railway) → Postgres 16 (Railway, EU) +
Redis 7 (Railway) + Cloudflare R2 (EU). In-house JWT + permission-RBAC, cookie domain
`.inyuku.co.za` (provisional), API at `api.inyuku.co.za`. TradeSafe escrow (Inyuku never holds
funds). 360dialog WhatsApp. Claude via `lib/ai.js` gateway only. Resend / BulkSMS / Prisma.
Multi-tenant from day one (`Business` root). Cross-cutting standards vendored-in from the
DrAppv2 chassis. Lending deferred; verified-transaction data is internal analytics, **never** a
credit score.

## 0.1 Hard gates (block downstream work)

| Gate | Blocks | Owner |
|---|---|---|
| EA-ADR-014/015 signed | M1 build | EA / founder |
| Brand domain chosen | M1 (cookie domain + DNS + first-party API) | Founder |
| POPIA operator DPAs (Railway + R2) + sub-processor risk assessment | Production PII (real-data M1 env) | bukani-compliance |
| Budget ceilings + role owners | M1 kickoff | Founder |
| Meta/360dialog verification + TradeSafe go-live | M3 / M4 respectively | DevOps + founder (start in M0) |

## 0.2 Invocation order (per bukani-session-workflow)

enterprise-architect → product → architect → security / data / compliance → backend / frontend
→ qa → docs → devops / sre → growth. Nothing ships without **qa** approval; security/compliance
findings gate the relevant milestone.

---

## 1. bukani-enterprise-architect

**Status:** Review delivered. **Outstanding (must close before M1 build):**
- Sign EA-ADR-014 (topology + `.inyuku.co.za` cookie-domain ruling) and EA-ADR-015 (Railway + R2
  POPIA sub-processors, EU pin, §72 operator-DPA basis) — drafted by bukani-docs in
  `/home/sibnaye/Development/bukani-decisions.md`.
- Confirm Cloudflare R2 over the chassis-default Vercel Blob (folds under existing Cloudflare Adopt).
- Decide the `lib/ai.js` promotion path (vendor-in-the-contract vs deployed shared AI service) —
  needed by M5, flag now. Inyuku is the second consumer → EA-ADR-009 trigger.
**Acceptance:** ADR-014/015 marked signed; promotion decision logged with a target milestone.

## 2. bukani-product

**When:** Now, in parallel — the plan has no product layer yet.
**Do:**
- Write the problem statement + target-user definition (SA spaza/informal merchant; low-end
  device, intermittent connectivity, load-shedding, low literacy, multilingual).
- Define the **M2 MVP acceptance criteria**: the smallest thing a real merchant runs their shop on
  (onboarding → add product → take a remote/WhatsApp order → get paid via TradeSafe escrow).
- Own the **KPI definitions + instrumentation spec** (activation, weekly-active merchants,
  orders/wk, GMV post-M4, 4-/12-wk retention, WhatsApp-order share) — hand the event schema to data.
**Deliverables:** `docs/specs/product-brief.md`, MVP acceptance criteria, KPI/event spec.
**Acceptance:** architect can design M2 against sharp acceptance criteria.

## 3. bukani-architect

**Status:** Backend topology delivered. **Next (M1 detail):**
- Produce the **M1 task manifest + contracts**: the baseline Prisma schema (User, RefreshToken,
  PasswordResetToken, PhoneOtp, Business, Membership, Permission, AuditLog, ErrorLog, Setting,
  Consent, ConsentRevocation, AiUsage, Lead), the OpenAPI skeleton (auth, /leads, /health,
  settings), the permission set, and the tenant-isolation pattern (`businessId` everywhere).
- Define the **lead-capture contract** (M0-B's Next BFF → Express `/leads`).
- Author Inyuku `DECISIONS.md` feature-level ADRs as M1 design choices land (bukani-docs created
  ADR-001..007; extend per feature).
**Dependencies:** product brief (for M2 forward-look); EA-ADR-014/015 for the auth-domain contract.
**Deliverables:** M1 task manifest, Prisma schema contract, OpenAPI skeleton, permission map.
**Acceptance:** backend/frontend can implement against frozen contracts.

## 4. bukani-security

**When:** Before M1 build (threat model) and gating M4 (payments) + M5 (AI agent).
**Do:**
- Own `docs/THREAT-MODEL.md` (bukani-docs created the skeleton): complete STRIDE for the
  JWT-rotation/cookie auth, the TradeSafe escrow surface, the tool-using AI Business Agent
  (EA-ADR-012 third gate), and R2/Postgres PII at rest/in transit.
- Review the auth implementation (refresh rotation, bcrypt-12, cookie flags, CORS to
  `*.inyuku.co.za`, rate limits on auth + AI routes).
- Verify secret handling (Railway secrets, AES-256-GCM settings, separate `BLOB_SIGN_SECRET` /
  encryption-key trust boundaries).
**Gate:** payments (M4) and AI agent (M5) do not ship without security sign-off.
**Deliverables:** completed threat model, auth review findings, gate decisions.

## 5. bukani-compliance

**When:** Now (M0 background) — this is on the critical path for real-data M1.
**Do:**
- Drive **info-officer registration** with the Information Regulator.
- Execute the **sub-processor risk assessments** for Railway and Cloudflare R2; obtain/record the
  **operator DPAs** (POPIA §72 basis); enter both in `docs/POPIA.md` (register + §72 transfer log).
- Own the **retention matrix**, consent ledger model (`Consent`/`ConsentRevocation`), data-subject-
  request playbook, and breach-notification process.
- Police the **lending-data boundary** (internal analytics only, not a shareable credit score) and
  the **CPA** review on the commerce surface (M2/M4).
**Gate:** no production PII until DPAs signed + risk assessment complete.
**Deliverables:** POPIA register complete, signed DPAs logged, retention matrix, DSR playbook.

## 6. bukani-data

**When:** M1 (data model) onward.
**Do:**
- Partner with architect on the schema's analytics shape; own the **`AiUsage` cost-tracking model**
  (per-call feature/tier/model/tokens/cache-hit/ZAR cost) feeding `OperationalCost`.
- Build the **KPI instrumentation** against product's event schema (PostHog or Plausible — pick one
  and record it); wire activation/orders/GMV/retention/WhatsApp-share.
- Design the **verified-transaction-data foundation** (M4+) strictly within the lending boundary.
**Deliverables:** analytics event implementation, AiUsage/cost sink, KPI dashboards.

## 7. bukani-backend

**When:** M1 (after contracts from architect + EA-ADR sign-off).
**Do (M1):**
- Scaffold the Express/Prisma backend on Railway from the DrAppv2 chassis; Dockerfile,
  `prisma migrate deploy` on boot, `/healthz`.
- **Vendor-in the cross-cutting libs** (response envelope, jwt + auth.middleware, permission guards,
  logger + pii-mask, crypto + Setting, audit-logger, rate-limit, storage + blob **+ new `r2`
  driver**, email=Resend, sms=BulkSMS, ai=`lib/ai.js` contract). No direct `@anthropic-ai/sdk`.
- Implement the baseline schema + migrations (tenant root `Business`, `businessId` FK everywhere),
  auth (signup/login/refresh-rotation/OTP via BulkSMS), `/leads`, DB-backed settings, OpenAPI doc +
  CI drift check, ZAR-as-integer-cents.
**Build exactly to the architect's contract — no scope creep.**
**Dependencies:** architect contracts, EA-ADR-014/015, EU-region provisioning, R2 bucket.
**Acceptance:** qa-verifiable auth + leads + health against the OpenAPI contract; tenant isolation tested.

## 8. bukani-frontend

**When:** M0-B (migration) then M1 (wire to backend).
**Do (M0-B):**
- Migrate the 6 marketing pages Vite/React-Router → Next.js App Router on Vercel (Server Components
  + `"use client"` islands for GSAP/Framer); `error.tsx`, `not-found.tsx`, `next/image`, Metadata
  API; prune the dead shadcn tree + unused deps + the inspect plugin; flip CI lint to blocking.
- Wire the lead form to a **thin Next Route Handler that proxies the Express `/leads`** endpoint
  (not a system of record).
**Do (M1):** scaffold the merchant **PWA shell** (offline-first — spike early, load-shedding is the
  operating environment); next-intl scaffolding (8 SA languages); consume the in-house JWT cookie.
**Dependencies:** lead contract (architect), auth-cookie contract (backend).
**Acceptance:** clean-URL marketing site on Vercel; lead form posts through to the API; a11y pass.

## 9. bukani-devops

**When:** M0 (CI + long-lead infra) then each deploy after qa sign-off.
**Do:**
- M0-A CI already drafted; on M0-B, add typecheck/lint/test/build/audit as blocking once shadcn is gone.
- Provision **Railway (Postgres + Redis + backend service) in the EU region**, **Cloudflare R2 EU
  bucket**, and **Vercel** projects; wire env/secrets in the platform stores (never in repo).
- **Domain + DNS** on Cloudflare once the brand domain is chosen: `app./admin./api.` subdomains,
  CNAME `api.<domain>` → Railway (first-party cookie requirement).
- Kick off **Meta/360dialog verification** and **TradeSafe go-live** application logistics with the founder.
**Never deploys without a qa sign-off.**
**Deliverables:** provisioned EU infra, CI/CD pipeline, DNS, preview environments.

## 10. bukani-sre

**When:** M1 onward (production health).
**Do:**
- Define **SLOs** (p95 API latency: read <400ms, write <800ms excl. external vendor calls; uptime),
  wire Sentry + OpenTelemetry, dashboards, alerting.
- Write the **runbooks** for the named 2am failure modes: TradeSafe settlement/webhook failure,
  360dialog webhook outage, Railway/Postgres incident; DR with a **tested restore as a release gate**
  (EA-ADR-006). RPO/RTO targets.
**Deliverables:** SLO doc, observability live, runbooks, tested-restore evidence.

## 11. bukani-qa

**When:** After backend + frontend complete each milestone.
**Do:**
- Verify M0-B (routes, nav, lead form, a11y) and M1 (auth flows incl. refresh rotation + OTP,
  tenant isolation, leads, settings, health) against the architect's contract.
- Build the test baseline: Vitest + RTL (≥70%), Playwright E2E for every route/form/CTA, axe a11y,
  Lighthouse perf budget. **Payments-grade QA reserved for M4** (idempotency, reconciliation,
  no-double-charge, webhook replay).
**Produces structured APPROVED/REJECTED reports; does not rewrite code.** Escalates security →
security, reliability → sre.
**Gate:** nothing ships without qa APPROVED.

## 12. bukani-docs

**Status:** Full doc sync in progress (ADRs, DECISIONS, POPIA, THREAT-MODEL, CLAUDE.md, spec/plan
reconciliation). **Ongoing:** update all docs at the end of every milestone session; keep
`docs/API.md` and `docs/SCHEMA.md` current from the OpenAPI + Prisma schema; propagate new EA-ADRs.

## 13. bukani-growth

**When:** M2+ (after there's a product to onboard into).
**Do:** onboarding flow design (with product/frontend), lifecycle email (Resend) + SMS (BulkSMS)
sequences with **compliance-cleared consent**, marketing-site SEO/conversion, churn analysis with data.
**Dependencies:** product brief, compliance consent rules. Not on the M0/M1 critical path.

---

## 14. Near-term critical path (summary)

1. **Founder (now):** choose brand domain; set budget ceilings; name role owners; greenlight EA-ADR-014/015.
2. **compliance + devops (M0 background):** info-officer registration, DPAs, EU infra provisioning,
   domain/DNS, Meta/360dialog + TradeSafe applications.
3. **frontend (M0-B):** Next migration + lead BFF.
4. **architect → backend (M1):** contracts → Express/Prisma backend + cross-cutting baseline + tenant model.
5. **security/qa:** threat model + verification gates.

M2–M5 (commerce, WhatsApp, payments, AI) are deliberately not detailed here — each gets a fresh
manifest once M1 lands and the founder gates clear.
