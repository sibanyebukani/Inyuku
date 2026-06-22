# Inyuku Digital — Milestone Roadmap

> **Owner:** bukani-docs · **Last synced:** 2026-06-22 (M2 merged; M3 next, not yet designed).
> Quick milestone status. The full program design is
> `docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md`; decisions are in
> `docs/DECISIONS.md`; M2 contracts are in `docs/specs/2026-06-21-m2-commerce-core-contracts.md`.

## Status at a glance

| Milestone | Scope | Status |
|---|---|---|
| **M0** | Repo foundation + Next.js migration (M0-A / M0-B / M0-C) | **Done (merged)** |
| **M1** | Fastify/Prisma platform foundation: auth, tenancy, RBAC, settings, audit, consent, R2 | **Done (merged)** |
| **M2** | **Commerce Core** — onboarding, catalog, inventory, orders, customers, dashboard, offline-first sync, PostHog analytics, staff RBAC split | **Done (merged 2026-06-22)** — GA gates still open (see below) |
| **M3** | WhatsApp commerce (360dialog) | **Next — not yet designed** |
| **M4** | Payments / TradeSafe escrow | Ahead |
| **M5** | AI Business Assistant (`lib/ai.js`) | Ahead |
| (deferred) | Lending / credit (verified-transaction data stays internal analytics, ADR-006) | Deferred |

## M2 — Commerce Core (DONE — merged 2026-06-22)

**Delivered:** M2-A backend (PR #6), M2-B1 merchant PWA + offline engine (PR #7), M2-B2 commerce
frontend (PR #8 — orders, customers, inventory adjustments, dashboard, onboarding wizard, products
edit/archive/image). Offline-first sync converges via an append-only outbox log (C1 fix). All on `main`.

**GA gates remain OPEN** (block production launch, not further build): customer-directory consent
ruling, PostHog DPA (analytics ships dark), bukani-security sync/RBAC review, CPA commerce review —
see the GA gates list below.

**In scope (delivered):** onboarding wizard; product catalog (CRUD + optional image); inventory
(stock-as-movements + low-stock threshold + auto-decrement + manual adjust); orders
(create/complete/void, manual PAID/UNPAID, `channel = IN_PERSON`); customer directory; merchant
dashboard (today's sales, orders, low-stock, catalog counts); **offline-first sync (HARD P0)**;
**PostHog analytics**; staff RBAC cost-split.

**Out (later):** WhatsApp (M3), payments/TradeSafe (M4), AI (M5), lending (deferred).

**Founder rulings:** offline = P0; barcode = P1; fulfilment lifecycle deferred (nullable
`reserve`/`fulfilmentStatus` seam); analytics = PostHog.

**GA gates:**
- Customer-directory consent model ruling (bukani-compliance) — `Customer.consentId` nullable until ruled.
- PostHog sub-processor DPA + EU/self-host pin (EA-ADR-015 extension) — analytics ships dark until cleared.
- bukani-security review of sync/idempotency + RBAC cost-split.
- CPA commerce-surface review (M2/M4).

> **Analytics decision (closes roadmap §10 open item, 2026-06-21):** **PostHog** chosen over Plausible
> (first-party product/event stream; queryable; no outward export per the ADR-006-family boundary).
