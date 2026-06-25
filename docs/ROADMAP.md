# Inyuku Digital — Milestone Roadmap

> **Owner:** bukani-docs · **Last synced:** 2026-06-25 (post-WhatsApp-inbox-UI build / QA APPROVED — MVP frontend complete).
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
| **M3** | WhatsApp commerce (360dialog) | **M3-A merged (#11); M3-B backend BUILD COMPLETE / QA APPROVED; WhatsApp Chat Inbox UI BUILD COMPLETE / QA APPROVED-WITH-NOTES (2026-06-25, 179/179 tests) — MVP frontend complete; awaiting SRE pre-LIVE conditions + compliance gates before live cutover/merge** |
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

### M3-B — commerce-over-chat (BUILD COMPLETE / QA APPROVED — `feat/m3b-backend`)

**Status:** **Backend build complete; bukani-qa verdict APPROVED (2026-06-25) on `feat/m3b-backend`.**
Contracts FROZEN (2026-06-23); bukani-security STRIDE **APPROVED-WITH-CONDITIONS** (Conditions 1–9
**verified in code**; residual R1 consciously deferred as a GA blocker). Migration
`20260623124013_m3b_commerce_over_chat`. **M3-B is the last MVP build milestone** (MVP = WhatsApp commerce,
no payments — M4/M5 deferred). Source of truth:
`docs/specs/2026-06-23-m3b-commerce-over-chat-product-brief.md` (7 stories M3B-S1..S7) +
`docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md` (FROZEN).

**Next steps:** SRE pre-LIVE conditions **C1/C2/C3** + compliance gates **E1–E4** before live cutover →
merge to `main`. (bukani-docs sync ✅; M3-B backend + WhatsApp inbox UI both QA-approved.)

### WhatsApp Chat Inbox UI (BUILD COMPLETE / QA APPROVED-WITH-NOTES — 2026-06-25)

**Status:** **Built; bukani-qa verdict APPROVED-WITH-NOTES (2026-06-25, 179/179 tests).** The **MVP frontend
is now complete.** Pure Next.js (App Router) merchant UI over the frozen M3-A/M3-B read/send surface + the M2
order/sync paths — **no new backend routes, no schema, no contract changes**. Source of truth:
`docs/specs/2026-06-25-whatsapp-inbox-ui-contracts.md` (FROZEN-FOR-BUILD); ADRs **ADR-INY-025..028**.

**Shipped (frontend):** the merchant WhatsApp surface — inbox list (`/whatsapp`), thread view + window-aware
composer + catalog share + order capture + payment toggle (`/whatsapp/[conversationId]`), owner-only
auto-reply rule management (`/whatsapp/auto-replies`); the API client / copy helpers / store / poll+unread
hooks (`src/lib/whatsapp/`); `src/components/PaymentToggle.tsx`; the **TASK-7 order-store fix** so WHATSAPP
captures carry `channel`/`conversationId` through the offline outbox (`src/lib/orders/store.ts` +
`src/lib/offline/types.ts`); additive `channel`/`conversationId` props on `OrderForm`
(`src/app/(merchant)/orders/OrderForm.tsx`); and the WhatsApp nav item + unread badge
(`src/app/(merchant)/layout.tsx`).

**Key UI decisions:** unread = **derived client-side** (`lastInboundAt > lastOutboundAt`, ADR-INY-025);
refresh = **visibility-gated polling** (30 s list / 15 s thread, no websockets; message sends live-only —
ADR-INY-026); order capture **reuses `<OrderForm>` + `useOrderStore`** (ADR-INY-027); plain-language
window/error copy **centralised + i18n-ready** (ADR-INY-028).

**QA note (MINOR-1, ratified as MVP UX):** on a **CLOSED** 24h window the composer is **disabled** with the
copy **"This chat is resting. Your customer needs to message you first before you can reply."** — an as-built
deviation from the original contract copy, recorded in the spec §6.1 and ADR-INY-028.

**Shipped (7 stories, backend):** inbox read (S1) + window-aware free-form reply (S2) over the frozen M3-A
reads/send; order capture from chat → M2 `Order(channel = WHATSAPP)` + customer link/create from the
conversation (normalised MSISDN, idempotent upsert) + SALE ledger decrement, converging exactly once offline
via the existing `clientId`/`sync` path (S3); catalog share as a server-composed plain ZAR-priced text list,
sell-price-only (S4); deterministic, **provably non-AI** auto-replies (greeting / keyword / out-of-hours, SAST,
cooldown-throttled — `lib/ai.js` never imported on this surface, CI-asserted; S5); customer-aware consent
enforcement under the default-deny stub (S6); order/payment-status notifications (S7).

**Shipped schema / seams:** `Order.conversationId` (nullable linkage FK, ADR-INY-021); the
`WhatsAppAutoReplyRule` table + `AutoReplyTrigger`/`AutoReplyAction` enums (ADR-INY-022); new owner-only
`whatsapp:manage_autoreply` permission; the customer-aware `assertConsentGranted(..., ctx)` signature. The
per-customer revocation store remains **DESIGNED-NOT-BUILT (residual R1)** — consciously deferred to the E2
ruling. ADRs **ADR-INY-021..024** (M3-A ended at 020). Live messaging stays **DARK** behind
`WhatsAppChannel.enabled` (E3).

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
- bukani-security **M3-B** commerce-over-chat STRIDE gate: **APPROVED-WITH-CONDITIONS** — Conditions 1–9
  **verified in code** by bukani-qa (2026-06-25); residual **R1** (per-customer revocation DESIGNED-NOT-BUILT —
  default-deny-marketing in the sandbox slice) consciously accepted as a **GA blocker** (`docs/THREAT-MODEL.md`
  §8). Escalations
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
