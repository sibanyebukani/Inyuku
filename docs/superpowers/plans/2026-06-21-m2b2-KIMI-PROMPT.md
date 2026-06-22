# KIMI build prompt — M2-B2 Commerce Core Frontend

> Paste the block below to KIMI. It is self-contained; the canonical detail lives in the referenced plan + contract docs.

---

You are building **M2-B2 — Commerce Core Frontend** for **Inyuku Digital**, a South African informal/small-business commerce PWA. You are the build swarm; **Claude Code plans and validates each slice** — build to the plan, do not redesign it.

## Repo & branch
- Repo root: `/home/sibnaye/Development/Inyuku` (Next.js 15 frontend at root; Fastify 5 / Prisma 6 backend under `server/`).
- **Prerequisite:** M2-B1 (PR #7) must be merged to `main` first — M2-B2 builds directly on the B1 offline engine. Create and work on branch **`feature/m2b2-commerce-frontend`** off `main` after that merge. Do **not** work on `main`.

## Read first (canonical — do not re-derive)
1. **`docs/superpowers/plans/2026-06-21-m2b2-commerce-frontend.md`** — your implementation plan. Build the tasks **in the order given** (Task 0 backend sync gap + Task 1 engine generalization + Task 2 products-finish are the foundation and land FIRST; then slices 3–7; Task 8 nav last). This is your source of requirements.
2. `CLAUDE.md` — resolved stack + mandatory conventions.
3. `docs/API.md` + `docs/SCHEMA.md` — frozen M1+M2 API + Prisma contracts.
4. `docs/specs/2026-06-21-m2-commerce-core-contracts.md` — M2 architect contracts.
5. The existing M2-B1 engine you are extending: `src/lib/offline/`, `src/lib/session/`, `src/lib/products/`, `src/app/(merchant)/`. Reuse the generic parts (`repo`, `outbox`, `triggers`, `useOnline`, `SessionProvider`, `authFetch`, Serwist SW) unchanged.

## Non-negotiable constraints (from the plan's Global Constraints — violations fail validation)
- **Money = integer ZAR cents** end-to-end; never floats; display via `centsToZAR`, parse via `zarToCents` (Zod ZAR-regex first so it never throws).
- **Tenant scoping** — every call under `/v1/businesses/:businessId/*` with `activeBusinessId`.
- **RBAC cost-split by HIDING, not zeroing** — `costPriceCents` (without `catalog:read_cost`) and `revenueTodayCents` (without `dashboard:read_financial`) must be ABSENT from DOM and payloads. Staff = all commerce perms except those two; `AI_AGENT` read-only.
- **Offline = P0 for creates** — order/customer/stock/product create + product edit work fully offline (IDB + outbox → `/sync`); only backend-REST-only order transitions (complete/void/payment) are online-gated (disable, don't drop, when offline).
- **Convergence is the backend's** — mint `clientId` (ULID), replay, trust server (idempotent, LWW on `occurredAt`); server is price + stock authority.
- **Customer consent is GA-gated** — directory ships with `consentId` nullable and **NO consent-capture UI**.
- **Analytics deferred** — NO PostHog / `AnalyticsEvent` work this phase.
- **No production PII** (seed/dev data only); **PII-masked logs**.

## Build discipline
- **TDD**, slice-by-slice. Each task ends with an independently testable deliverable; **commit per task** only when ALL gates are green.
- **Gates (must be green before each commit):** frontend at repo root — `npm run typecheck && npm run lint && npm test && npm run build`; backend (Task 0) under `server/` — `npm run typecheck && npm run lint && npm test && npm run build && npm run openapi:check`.
- **Node 20 lockfile discipline (CI gotcha):** CI runs `npm ci` on **Node 20** (`.nvmrc`). If you add/change any dependency, regenerate `package-lock.json` under Node 20 (`nvm use 20 && npm install`) and verify `npm ci` on Node 20 — a green install on Node 24/npm 11 does NOT guarantee CI passes.
- **Commit messages** end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Stop points:** after each slice, pause for Claude Code's validation (spec compliance + code quality + actual GitHub CI). **Do NOT merge** to `main`. **Do NOT** start work outside this plan's scope.

## Definition of done (the whole phase)
Products edit/archive/image finished; Orders, Customers, Inventory-adjustment, Dashboard, Onboarding slices built offline-first on the shared engine; Task 0 backend `product`+`update` `/sync` op landed; navigation wires every page in; all gates green; actual GitHub CI green on the pushed branch; a merchant can record sales, manage customers, adjust stock, and see today's dashboard — offline-first.

If anything in the plan is ambiguous or conflicts with the frozen contracts, STOP and raise it rather than guessing.
