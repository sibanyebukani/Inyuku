# Inyuku Digital — M2 (Commerce Core) Product Brief

> **Author:** bukani-product · **Date:** 2026-06-21 · **Status:** M2 in design (M0 + M1 merged).
> **Persisted by:** bukani-docs as the canonical product brief for M2. The frozen architect
> contracts that implement this brief are in `docs/specs/2026-06-21-m2-commerce-core-contracts.md`.
> Canonical schema/API/ADR/POPIA persistence lives in `docs/SCHEMA.md`, `docs/API.md`,
> `docs/DECISIONS.md`, `docs/POPIA.md`, `docs/THREAT-MODEL.md`, `docs/PERSONAS.md`, `docs/ROADMAP.md`.

---

## 1. Why M2 exists

M0 (repo/Next migration) and M1 (Fastify/Prisma platform foundation: auth, tenancy, RBAC, settings,
audit, consent, R2) are **merged**. M2 — **Commerce Core** — is the first milestone that puts real
merchant value on top of the foundation: a merchant can onboard, list what they sell, track stock,
record sales, keep a customer book, and see how the shop is doing today — **even when the connection
drops**.

M2 is designed around the realities of the South African informal-trade environment: entry-level
Android, intermittent connectivity and load-shedding, low digital literacy, cash-first thinking in
ZAR, and a preference for local languages.

---

## 2. Personas (canonical — see `docs/PERSONAS.md`)

- **Nomsa — spaza-shop owner. P0 design target.** Entry-level Android, intermittent connectivity /
  load-shedding, low digital literacy, prefers isiZulu / isiXhosa / Sesotho / Afrikaans, thinks in
  cash / ZAR. Every M2 decision optimises for Nomsa first.
- **Sipho — shop assistant (`MERCHANT_STAFF`).** Records sales and checks stock. **Must NOT see cost
  price, margin, or financial totals.** Drives the RBAC cost-split.
- **Thandi — artisan / caterer. Validation persona (seams, not scope).** Made-to-order work. She is
  the reason M2 leaves *seams* (nullable fulfilment / payment-ref / escrow-ref fields) rather than
  building those features now. Thandi validates that the model can grow; she is not an M2 scope target.

---

## 3. M2 scope

**In scope:**

- **Onboarding wizard** — get a brand-new merchant from signup to a usable shop.
- **Product catalog** — CRUD plus an optional product image.
- **Inventory** — stock modelled as **movements** (an append-only ledger), a **low-stock threshold**,
  **auto-decrement on sale**, and **manual adjustment**.
- **Orders** — create / complete / void; manual **PAID / UNPAID** payment state; `channel = IN_PERSON`
  for M2.
- **Customer directory** — a simple customer book (name / phone / email).
- **Merchant dashboard** — today's sales, orders, low-stock items, catalog counts.
- **Offline-first sync** — **HARD P0**. The shop must keep working through connectivity gaps and
  converge cleanly when back online.
- **Analytics** — **PostHog** (first-party product/event analytics).
- **Staff RBAC split** — the owner/staff cost-visibility split (Sipho must not see cost/margin).

**Out of scope (later milestones):**

- WhatsApp commerce → **M3**.
- Payments / TradeSafe escrow → **M4**.
- AI Business Assistant → **M5**.
- Lending / credit → **deferred** (verified-transaction data stays internal analytics, ADR-006).

**Founder rulings carried into M2:**

- **Offline = P0** (non-negotiable; drives stock-as-movements + idempotent sync).
- **Barcode scanning = P1** (nice-to-have, not a blocker for M2 GA).
- **Fulfilment lifecycle = deferred** — the order carries a **nullable `reserve`/`fulfilmentStatus`
  seam** so M3/M4 can grow into it without a migration churn.
- **Analytics = PostHog** (closes the roadmap §10 analytics open item).

---

## 4. Product principles for M2

- **Offline is the default, not the exception.** Nomsa records a sale during load-shedding; it syncs
  later. The data model (stock-as-movements, client-generated `clientId`s, last-writer-wins on
  `occurredAt`) exists to make that converge.
- **Cash-first, ZAR-first.** Money is integer ZAR cents everywhere. Payment state is a manual
  PAID/UNPAID flag in M2 — no gateway yet.
- **Low literacy, high clarity.** The dashboard answers "how is my shop doing today?" in one glance.
- **Staff see operations, owners see money.** Sipho can run the till; only Nomsa sees cost and margin.
- **Customer PII is a responsibility we take seriously.** The customer directory is gated on a consent
  ruling (merchant-as-responsible-party vs Inyuku-as-operator) before GA.

---

## 5. Dependencies & gates (routed out of product)

- **Customer-directory consent model** → **bukani-compliance** (merchant-as-responsible-party vs
  Inyuku-as-operator for walk-in customer contacts). **GA-gates the customer directory.**
  `Customer.consentId` stays nullable until ruled.
- **PostHog as a new sub-processor** → **bukani-compliance** (EA-ADR-015 extension: EU/self-host pin +
  operator DPA before production events leave Inyuku). **Analytics ships dark until cleared.**
- **Sync/idempotency + RBAC cost-split security review** → **bukani-security** before GA
  (see `docs/THREAT-MODEL.md` M2 entry).
- **CPA commerce-surface review** → due M2/M4.

---

## 6. Out-of-the-brief (explicitly not promised in M2)

Multi-currency, tax/VAT computation, supplier/purchase-order management, multi-location stock,
returns/refunds workflow, barcode scanning (P1, may slip), and any fulfilment/delivery lifecycle —
all deferred. M2 leaves nullable seams where the model needs room to grow but builds none of these.
