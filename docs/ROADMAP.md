# Inyuku Digital — Milestone Roadmap

> **Owner:** bukani-docs · **Last synced:** 2026-06-23 (post-M3-A merge).
> Quick milestone status. The full program design is
> `docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md`; decisions are in
> `docs/DECISIONS.md`; M2 contracts are in `docs/specs/2026-06-21-m2-commerce-core-contracts.md`;
> M3-A contracts are in `docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`.

## MVP scope (founder ruling, 2026-06-23)

**MVP = WhatsApp commerce, NO payments.** The MVP is the **M2 shop + M3 (A+B) WhatsApp order capture** with
**manual `PAID`/`UNPAID`**. **M4 (TradeSafe escrow) and M5 (AI assistant) are deferred to post-MVP. Lending
stays deferred.**

## Status at a glance

| Milestone | Scope | Status |
|---|---|---|
| **M0** | Repo foundation + Next.js migration (M0-A / M0-B / M0-C) | **Done (merged)** |
| **M1** | Fastify/Prisma platform foundation: auth, tenancy, RBAC, settings, audit, consent, R2 | **Done (merged)** |
| **M2** | **Commerce Core** — onboarding, catalog, inventory, orders, customers, dashboard, offline-first sync, PostHog analytics, staff RBAC split | **Done (merged — PRs #6/#7/#8)** |
| **M3** | WhatsApp commerce (360dialog) | **In progress — M3-A merged (#11); M3-B design complete / contracts FROZEN — ready for build** |
| **M4** | Payments / TradeSafe escrow | **Deferred (post-MVP)** |
| **M5** | AI Business Assistant (`lib/ai.js`) | **Deferred (post-MVP)** |
| (deferred) | Lending / credit (verified-transaction data stays internal analytics, ADR-006) | Deferred |

## M3 — WhatsApp commerce (current)

### M3-A — BSP plumbing (MERGED, PR #11 / `e530574`)

**Shipped (backend only):** signature-verified inbound webhook (HMAC-verify-before-parse, fail-closed);
durable Postgres outbox (`WhatsAppInboundEvent`, ADR-INY-017) + async drainer; `Conversation` / `Message`
persistence; server-side tenant routing via the `phoneNumberId → businessId` `WhatsAppChannel` map
(ADR-INY-019); outbound send (free-form + template) with the 24h customer-care window state machine;
approved-template registry (`WhatsAppTemplate`, ADR-INY-020); provider-id idempotency (ADR-INY-018); the
consent enforcement **default-deny stub** and the sub-processor **enable flag** (`WhatsAppChannel.enabled`,
default `false` — **ships DARK**, sandbox-only). New permissions `whatsapp:read` / `whatsapp:send` /
`whatsapp:manage_channel`. **No merchant-facing chat UI yet.** See `docs/API.md`, `docs/SCHEMA.md`.

### M3-B — commerce-over-chat + inbox UI (DESIGN COMPLETE / contracts FROZEN — ready for build)

**Status:** **Design complete; contracts FROZEN (2026-06-23); bukani-security STRIDE
APPROVED-WITH-CONDITIONS** (Conditions 1–9 baked into the contract; residual R1 documented). **Build follows.**
**M3-B is the last MVP build milestone** (MVP = WhatsApp commerce, no payments — M4/M5 deferred). Source of
truth: `docs/specs/2026-06-23-m3b-commerce-over-chat-product-brief.md` (7 stories M3B-S1..S7) +
`docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md` (FROZEN).

**In scope (7 stories):** inbox read (S1) + window-aware free-form reply (S2) — UI over frozen M3-A reads/send;
order capture from chat → M2 `Order(channel = WHATSAPP)` + customer link/create from `waContactId` + SALE
ledger decrement, converging exactly once offline via the existing `clientId`/`sync` path (S3); catalog share
as a server-composed plain ZAR-priced text list (S4); deterministic, **provably non-AI** auto-replies
(greeting / keyword / out-of-hours, SAST, loop-safe — `lib/ai.js` never on this surface; S5); customer-aware
consent enforcement under the default-deny stub (S6); order/payment-status notifications (S7).

**Frozen seams / new schema:** `Order.conversationId` (nullable linkage FK, ADR-INY-021); the
`WhatsAppAutoReplyRule` table + `AutoReplyTrigger`/`AutoReplyAction` enums (ADR-INY-022); new owner-only
`whatsapp:manage_autoreply` permission; the customer-aware `assertConsentGranted(..., ctx)` signature with the
per-customer revocation store **DESIGNED-NOT-BUILT (residual R1)**. ADRs **ADR-INY-021..024** (M3-A ended at
020). Live messaging stays **DARK** behind `WhatsAppChannel.enabled` (E3).

### GA gates (M3)

- **360dialog sub-processor DPA + EU-pin confirmation + bukani-compliance risk assessment** (EA-ADR-015
  extension) — live WhatsApp messaging ships **DARK / sandbox-only** until cleared (`docs/POPIA.md` §7b).
  **M3-A build is NOT gated** (sandbox + mocked webhooks, zero production PII).
- **WhatsApp opt-in / responsible-party ruling** (merchant-as-responsible-party vs Inyuku-as-operator) —
  GA-gates non-transactional / marketing-template messaging; the M3-A consent stub is **default-deny** until
  ruled; `Customer.consentId` stays nullable (`docs/POPIA.md` §7a/§7b).
- **WhatsApp message-content retention period** (POPIA §6 TBD) — config value, not hard-coded.
- bukani-security M3-A webhook STRIDE gate: **APPROVED-WITH-CONDITIONS** — the 5 conditions are implemented
  in M3-A (`docs/THREAT-MODEL.md` §7). Live-number cutover re-gates under EA-ADR-015.
- bukani-security **M3-B** commerce-over-chat STRIDE gate: **APPROVED-WITH-CONDITIONS** — Conditions 1–9 baked
  into the frozen contract; residual **R1** (per-customer revocation DESIGNED-NOT-BUILT — default-deny-marketing
  in the sandbox slice) consciously accepted as a **GA blocker** (`docs/THREAT-MODEL.md` §8). Escalations
  **E1** (per-tenant WhatsApp cost ceiling + kill switch — founder/EA), **E2** (responsible-party ruling),
  **E3** (360dialog DPA/EU-pin), **E4** (Message→Order/Customer retention) tracked as founder/compliance /
  live-cutover gates — **not** M3-B sandbox-build blockers.

## M2 — Commerce Core (merged)

**In scope:** onboarding wizard; product catalog (CRUD + optional image); inventory
(stock-as-movements + low-stock threshold + auto-decrement + manual adjust); orders
(create/complete/void, manual PAID/UNPAID, `channel = IN_PERSON`); customer directory; merchant
dashboard (today's sales, orders, low-stock, catalog counts); **offline-first sync (HARD P0)**;
**PostHog analytics**; staff RBAC cost-split.

**Out (later):** WhatsApp (M3 — in progress), payments/TradeSafe (M4 — **deferred post-MVP**),
AI (M5 — **deferred post-MVP**), lending (deferred).

**Founder rulings:** offline = P0; barcode = P1; fulfilment lifecycle deferred (nullable
`reserve`/`fulfilmentStatus` seam); analytics = PostHog.

**GA gates:**
- Customer-directory consent model ruling (bukani-compliance) — `Customer.consentId` nullable until ruled.
- PostHog sub-processor DPA + EU/self-host pin (EA-ADR-015 extension) — analytics ships dark until cleared.
- bukani-security review of sync/idempotency + RBAC cost-split.
- CPA commerce-surface review (M2/M4).

> **Analytics decision (closes roadmap §10 open item, 2026-06-21):** **PostHog** chosen over Plausible
> (first-party product/event stream; queryable; no outward export per the ADR-006-family boundary).
