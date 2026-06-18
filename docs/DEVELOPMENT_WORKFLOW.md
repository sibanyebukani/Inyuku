# Inyuku Digital — Development Workflow

## How development runs

- **Planning, architecture, doc-sync, and validation** happen in the Claude Code (Bukani agents)
  environment — this repo's `docs/` are the source of truth.
- **Implementation** is done by an external agent: **KIMI SWARM**.
- Work proceeds **one phase at a time** (M0-A → M0-B → M1 → …). KIMI SWARM executes the current
  phase's plan, then **STOPS**.
- After each phase, the code comes **back to Claude Code for validation** (code review +
  verification) before the next phase is unlocked.

```
Claude Code: plan a phase  ──►  KIMI SWARM: build the phase  ──►  Claude Code: validate
        ▲                                                                  │
        └──────────────────  unlock next phase  ◄──────────────────────────┘
```

## Phase order

| Phase | Plan | Status |
|---|---|---|
| M0-A | `docs/superpowers/plans/2026-06-18-m0a-repository-foundation.md` | ready to build |
| M0-B | (to be written before it runs) Next.js migration + dead-code prune | planned, not detailed |
| M1 | (to be written) Express/Prisma backend + cross-cutting baseline + tenant model | planned, gated |
| M2–M5 | commerce / WhatsApp / payments / AI | roadmap only; just-in-time specs |

Gates before M1 build (see manifest §0.1): EA-ADR-014/015 signed, brand domain chosen, POPIA
operator DPAs + sub-processor assessment done, budget + owners set.

## Validation step (done here, after each phase)

When KIMI SWARM returns a completed phase, run here:
1. `/code-review` on the diff (correctness + standards adherence).
2. The `verify` skill — run the app / tests, confirm acceptance criteria from the phase plan.
3. Check the non-negotiables held (see the kickoff prompt below): in-house JWT, no Clerk/Supabase,
   TradeSafe-only, AI via `lib/ai.js`, ZAR integer cents, multi-tenant `businessId`, POPIA gates.
4. Approve → write/finalize the next phase's plan. Reject → return findings to KIMI SWARM.

## KIMI SWARM kickoff prompt (paste this into KIMI SWARM)

> Paste the block below. Re-use it each phase — it always reads the docs and builds the *current*
> phase, then stops.

```text
You are the development swarm for Inyuku Digital, a South African informal/small-business commerce
platform. You implement it PHASE BY PHASE from a fully-planned spec set. Do NOT improvise
architecture — every major decision is already made and recorded in the repo docs.

STEP 1 — Read these docs IN THIS ORDER before writing any code (all under /home/sibnaye/Development/Inyuku):
  1. CLAUDE.md — project overview, stack, conventions, binding ADRs.
  2. docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md — program roadmap (phases, tracks, compliance).
  3. docs/DECISIONS.md — Inyuku ADR-001..007 you MUST follow.
  4. docs/specs/2026-06-18-m0-m1-agent-task-manifest.md — who-does-what, contracts, and GATES for M0/M1.
  5. docs/POPIA.md and docs/THREAT-MODEL.md — compliance + security constraints.
  6. The plan for the CURRENT phase under docs/superpowers/plans/ (start with 2026-06-18-m0a-repository-foundation.md).

NON-NEGOTIABLES (violating any = the phase is rejected):
  - Frontend: Next.js (App Router) on Vercel — FRONTEND ONLY, a pure client of the backend; it owns no data or business logic.
  - Backend: Express 4 + Prisma 6 on Railway, modelled on the chassis at /home/sibnaye/Development/DrAppv2/backend/.
    VENDOR-IN its cross-cutting libs (response envelope, jwt + auth.middleware, permission guards, logger + pii-mask,
    crypto + Setting, audit-logger, rate-limit, storage + blob, email, sms, ai) — do NOT invent your own.
  - Datastore: Railway Postgres 16 (EU region), Prisma = schema source of truth. NO Supabase.
  - Object storage: Cloudflare R2 (EU) behind the storage driver; private-by-default + signed URLs.
  - Auth: in-house JWT + refresh rotation, bcrypt-12, permission-RBAC at the route layer, cross-subdomain HttpOnly
    cookies (domain .inyuku.co.za, provisional), API at api.inyuku.co.za. NO Clerk, NO Supabase Auth.
  - Payments: TradeSafe escrow ONLY; Inyuku NEVER holds funds (not a payment facilitator). NO Stripe.
  - AI: Claude ONLY via the lib/ai.js gateway contract (model tiering, prompt cache, rate limits, cost cap, kill switch).
    NEVER call @anthropic-ai/sdk directly.
  - WhatsApp: 360dialog. Email: Resend. SMS/OTP: BulkSMS.
  - Money is ALWAYS integer ZAR cents — never floats.
  - Multi-tenant from day one: Business is the tenant root; every domain table has a businessId FK; enforce tenant isolation.
  - POPIA: EU-region everything; NO production PII until compliance clears the sub-processor DPAs (gate in the manifest).
    Verified-transaction data is INTERNAL analytics only — never a shareable credit score.
  - Cross-cutting standards are mandatory: response envelope, AuditLog/ErrorLog, DB-backed encrypted settings,
    OpenAPI contract + CI drift check, /health, Sentry + OpenTelemetry, Helmet, CORS to *.inyuku.co.za, Zod validation.

HOW TO WORK:
  - Execute ONLY the current phase's plan, task by task, in order. Follow its TDD steps
    (write failing test → run it fails → implement minimal code → run it passes → commit). Commit frequently.
  - Build exactly to the contracts. If a contract is missing or ambiguous, STOP and ask — do not guess.
  - Respect the gates in the manifest (§0.1). Do NOT start the M1 build until EA-ADR-014/015 are signed and the
    brand domain is chosen.

STOP AFTER EACH PHASE:
  When the current phase's plan is fully complete and its acceptance criteria pass:
    1. Run full verification (lint, typecheck, tests, build) and paste the output.
    2. Summarize what changed (files + commits) and any deviations from the plan.
    3. STOP. Do NOT start the next phase — it goes back for code review and validation first.

Start now with STEP 1, then execute the M0-A plan.
```

## Notes

- The kickoff prompt is phase-agnostic: each phase, point step 6 at the relevant plan file and it
  builds that phase only.
- The non-negotiables list mirrors `docs/DECISIONS.md` — if an ADR changes, update both.
