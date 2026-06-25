# WhatsApp Chat Inbox UI

Product: Inyuku Digital (merchant PWA — last MVP merchant-dashboard surface)
Status: ready-for-design
Owner: bukani-product
Date: 2026-06-25
RICE: 320 (Reach 5 / Impact 4 / Confidence 0.8 ÷ Effort 0.5 sprint — effort to be confirmed by bukani-architect)

> **Author:** bukani-product · **Status:** discovery → ready-for-design.
> **Scope:** the **merchant-facing chat/inbox screen** for M3-B. The entire M3-B *backend* is built and
> bukani-qa **APPROVED (2026-06-25, `feat/m3b-backend`)** — all routes in §"Backend already built" below are
> live. This brief specifies **only the Next.js merchant UI** that consumes them. **No new backend work,
> no new routes, no schema, no API/contract design** — those are frozen
> (`docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md`). The architect's job here is the **UI
> component/route/state design** against the existing merchant-dashboard patterns.
> **Builds on:** the M3-B product brief (`docs/specs/2026-06-23-m3b-commerce-over-chat-product-brief.md`,
> stories M3B-S1..S7) and the merged M2 commerce UI patterns
> (`src/app/(merchant)/*`, `centsToZAR`, `SyncBadge`, `useSession`, `useOnline`).

---

## Backend already built (consumed, NOT re-specified)

All live on `feat/m3b-backend`, QA-approved. The UI is a pure client of these:

- `GET  /v1/businesses/:id/whatsapp/conversations` — list conversations
- `GET  /v1/businesses/:id/whatsapp/conversations/:id` — single conversation (incl. window state)
- `GET  /v1/businesses/:id/whatsapp/conversations/:id/messages` — message thread (paginated)
- `POST /v1/businesses/:id/whatsapp/conversations/:id/messages` — send free-form reply
- `POST /v1/businesses/:id/whatsapp/conversations/:id/share-catalog` — share catalog
- `GET/POST/PATCH/DELETE /v1/businesses/:id/whatsapp/auto-reply-rules` — CRUD rules
- `PATCH /v1/businesses/:id/orders/:id/payment` — mark PAID/UNPAID (M2 route, reused)
- Order capture from chat rides the **existing M2 `clientId` / `POST .../sync` order path** with
  `channel = WHATSAPP` + `Order.conversationId` linkage.

Permissions (already enforced server-side): `whatsapp:read`, `whatsapp:send`,
`whatsapp:manage_autoreply` (owner-only), plus M2 `order:write` and the cost-split perms
(`catalog:read_cost`, `dashboard:read_financial`).

---

## Problem

After M3-B's backend shipped, Inyuku can receive a customer's WhatsApp message, send a reply, capture an
order from a chat, and run deterministic auto-replies — **but Nomsa has no screen to do any of it.** The
channel is live and commerce-blind from her seat: she literally cannot see a conversation inside Inyuku, so
today she still answers customers in the WhatsApp app on her phone and then re-types the customer, the items,
and the price into the Inyuku till by hand — the exact double-work the whole M3 milestone set out to kill. The
inbox UI is the **last missing piece of the MVP merchant dashboard**: until it exists, the MVP loop (receive
on WhatsApp → record in the shop → tell the customer) cannot be completed inside one app. Why now: the
backend is QA-approved and merge-pending; the screen is all that stands between a working backend and a
shippable MVP.

## Actors

See `docs/PERSONAS.md`.

- **Nomsa — spaza-shop owner (`MERCHANT_OWNER`). P0 design target.** WhatsApp is her counter. Low digital
  literacy, entry-level Android, intermittent signal. Every layout/word-count/tap-count decision optimises
  for her: read a thread, tap the agreed items, done — no re-typing, no jargon, works (read-only) when signal
  drops.
- **Sipho — shop assistant (`MERCHANT_STAFF`). The RBAC cost-split.** Answers messages and captures orders
  but **must never see cost price, margin, or financial totals** — by hiding, not zeroing. Cannot reconfigure
  auto-reply rules (owner-only).

## User stories

> Conventions for every story: money rendered with **`centsToZAR`** (ZAR integer cents, no floats); all
> reads/writes scoped to `useSession().activeBusinessId`; PII (`Message.body`, customer phone) shown only in
> the authenticated UI, **never** sent to logs/analytics; **offline-degrade per the M2 pattern** (cached
> read, `useOnline()` banner, `SyncBadge` for pending writes); RBAC gated client-side with
> `hasPerm(...)` **and** trusted server-side. The UI invents no business rules — window/consent/send-mode
> decisions are made by the server and merely *displayed*.

### S1 — See my WhatsApp conversations (inbox list)
*As Nomsa or Sipho, I want a list of my WhatsApp conversations inside Inyuku, so that I can see who is waiting
on a reply without leaving the dashboard.*

- **AC1:** Given conversations exist for the active business, when I open the inbox, then they render
  most-recent-activity-first, each row showing the customer's WhatsApp name/number, a one-line last-message
  preview, the SAST timestamp of the last message, and an **unread / needs-reply** indicator.
- **AC2:** Given a row has unread inbound messages, then the unread state is visually obvious (badge/bold) and
  a total unread count is visible at the inbox entry point and in nav.
- **AC3:** Given no conversations exist, then an empty state explains the inbox fills as customers message the
  shop's WhatsApp number (not a blank screen).
- **AC4 (offline):** Given my signal drops, then previously-loaded conversations stay readable from cache,
  the offline banner shows, and the list is marked possibly-stale rather than erroring.
- **AC5 (RBAC):** Sipho sees the same list (`whatsapp:read`); no cost/margin/financial value appears anywhere
  on the list.

### S2 — Read a message thread
*As Nomsa, I want to open a conversation and read the full back-and-forth, so that I know what the customer
asked for.*

- **AC1:** Given I open a conversation, then inbound and outbound messages render in chronological order,
  visually distinguished by direction, each with a SAST timestamp; the thread paginates/scrolls for long
  histories.
- **AC2:** Given an outbound message, then its delivery status (`SENT` / `DELIVERED` / `READ` / `FAILED`)
  is shown in plain terms.
- **AC3 (window state):** Given the thread is open, then the 24h-window state is shown in **plain,
  non-technical language** — e.g. "You can reply freely until 14:32" (open) or "Reply window closed — you
  can only send an approved update" (closed) — so the merchant never guesses send mode.
- **AC4 (offline):** Given my signal drops, then a previously-opened thread stays readable from cache and is
  marked possibly-stale.
- **AC5 (PII):** Given any thread view, then message bodies and the customer number appear only in the
  authenticated UI and are never emitted to logs or PostHog.

### S3 — Send a free-form reply (within the 24h window)
*As Nomsa, I want to type and send a reply from the thread, so that I can answer the customer — and be stopped
cleanly if WhatsApp's rules don't allow it, instead of getting a cryptic error.*

- **AC1:** Given the window is OPEN, when I send a typed reply, then it posts to the send route, appears in the
  thread immediately with a pending/sent indicator, and resolves to its delivery status.
- **AC2:** Given the window is CLOSED, then the free-form composer is disabled (or the send is blocked at the
  boundary and surfaced) with a plain-language explanation pointing me at the approved-update path — **no raw
  platform error reaches the merchant.**
- **AC3 (offline):** Given I send while offline, then the message is **queued and clearly marked pending**
  (`SyncBadge`-style), not silently dropped; on reconnect it is attempted and a failure surfaces a clear
  retry state.
- **AC4 (RBAC):** Sipho can send (`whatsapp:send`); the compose surface shows no cost/financial data.

### S4 — Share my catalog into a conversation
*As Nomsa, I want to send the customer my products over WhatsApp with one tap, so that they can choose without
me typing each item and price.*

- **AC1:** Given an open conversation, when I tap "Share catalog", then the catalog-share route fires and the
  resulting server-composed ZAR-priced product list appears as an outbound message in the thread.
- **AC2 (RBAC / PII):** Given the shared catalog, then it shows **sell price only** — cost price is never
  displayed in the picker or the sent message (Sipho sees the identical sell-only view). Hide, never zero.
- **AC3 (window):** Given the window is closed, then share follows the same blocked-with-explanation behaviour
  as S3/AC2 (server decides; UI displays).
- **AC4 (offline):** Given I am offline, then share follows the same queued-pending behaviour as S3/AC3.

### S5 — Capture an order from a conversation (no re-typing)
*As Nomsa or Sipho, I want to turn the agreed items in a chat into a recorded order, so that my stock,
customer book, and dashboard update without me re-typing.*

- **AC1:** Given an open conversation, when I start capture, then I pick items **from my M2 catalog** and set
  quantities; the running total renders in ZAR (`centsToZAR`).
- **AC2:** Given I confirm, then an M2 `Order(channel = WHATSAPP)` is created via the **existing M2 order /
  `clientId` / sync path**, linked to the conversation (`Order.conversationId`), the customer linked/created
  from the conversation, and stock decremented through the SALE ledger — **all server-side; the UI only
  submits the M2 order payload.**
- **AC3 (link back):** Given an order is captured, then the thread shows "Order #N captured" and links to the
  M2 order detail; the order also appears in the normal M2 Orders list (one order model).
- **AC4 (offline, P0):** Given I capture offline, then the order is queued with `SyncBadge` pending state and
  **converges exactly once** on reconnect via the M2 sync path — never duplicated. This reuses the existing
  M2 order-store offline behaviour.
- **AC5 (RBAC cost-split):** Given Sipho captures, then he completes the capture but the catalog picker shows
  **sell price only** and no margin/financial total beyond the customer-facing subtotal — hidden, not zeroed.

### S6 — Mark an order PAID / UNPAID from the chat
*As Nomsa, I want to flip a captured order's payment status from the conversation, so that I can record that
the customer paid cash without hunting for the order in another screen.*

- **AC1:** Given a conversation has a captured order, when I tap PAID / UNPAID, then the existing M2
  `PATCH .../orders/:id/payment` route is called and the displayed payment state updates.
- **AC2 (notify, not collect):** Given I mark PAID, then the UI offers (not forces) sending the customer a
  payment-status notification through the normal send path; **no payment is collected, no link generated** —
  payment state is the M2 manual flag only.
- **AC3 (offline):** Given I am offline, then the payment-state change follows the M2 order-store offline/sync
  behaviour (it is an M2 order mutation).
- **AC4 (RBAC):** Payment-state change requires the M2 `order:write` permission as it does on the Orders
  screen today; no cost/financial data is exposed by this action.

### S7 — Manage auto-reply rules
*As Nomsa, I want to set up and switch on/off simple automatic replies, so that customers get an instant
response when I can't answer, without me trusting or paying for an AI.*

- **AC1 (list):** Given I open auto-reply settings, then my configured rules list with their trigger
  (greeting / keyword / out-of-hours), action, and on/off state.
- **AC2 (toggle):** Given a rule, when I toggle it on/off, then the `PATCH` route persists the change and the
  state updates; no rule deletion is required to disable.
- **AC3 (create/edit):** Given I create or edit a rule, then I configure the trigger, the canned reply text /
  catalog-share action, and (for out-of-hours) business hours in **SAST**; on save the `POST`/`PATCH` route
  persists it.
- **AC4 (delete):** Given a rule, then I can delete it (`DELETE` route) with a confirmation.
- **AC5 (RBAC, owner-only):** Given Sipho (`MERCHANT_STAFF`), then auto-reply settings are **read-only or
  hidden** — only `MERCHANT_OWNER` (`whatsapp:manage_autoreply`) can create/edit/delete. The UI gates with
  `hasPerm('whatsapp:manage_autoreply')` and the server enforces it regardless.
- **AC6 (non-AI framing):** Given the rule editor, then copy makes clear these are **simple, exact-match
  canned replies** (not a chatbot / AI) so Nomsa's mental model is correct — consistent with the
  provably-non-AI backend.

## Out of scope (do not design for MVP)

- **Media messages** — sending/receiving images, voice notes, documents, stickers in the thread. MVP is text +
  server-composed catalog text only.
- **Search / filter** across conversations or message bodies.
- **Bulk actions** — multi-select, bulk archive, broadcast/blast sends.
- **Real-time push / live websockets / typing indicators** — MVP uses fetch-on-open + manual refresh (poll at
  most); true realtime is a later enhancement.
- **Manual template-builder UI / template send composer** — the merchant picks an *update*, the server picks
  free-form vs approved template (M3-B principle). MVP shows the window state; it does not let the merchant
  hand-author a template send.
- **Per-customer consent toggle UI** — the per-customer revocation store is DESIGNED-NOT-BUILT (residual R1,
  GA blocker); MVP renders no consent-management control. Sends run under the default-deny stub server-side.
- **New customer-detail editing from chat** — capture links/creates a customer; richer editing stays on the
  M2 Customers screen.
- **Notifications inbox / unread push to device OS** — in-app unread badge only.
- **Any AI / smart-reply / suggested-reply surface** — M5.
- **Live-number cutover UX** — messaging ships DARK behind `WhatsAppChannel.enabled`; the live toggle is an
  ops/GA-gated step, not part of this UI.

## Success metrics

- **Leading (week 1, sandbox/early-access):** ≥ 80% of merchants who open the inbox open at least one thread;
  median taps from open-thread to order-captured ≤ 6 (proxy for "no re-typing").
- **Lagging (month 3):** share of `Order(channel = WHATSAPP)` captured **via the inbox** vs re-typed into the
  M2 till trends toward the inbox; % of WhatsApp conversations that result in a recorded order (chat→sale
  conversion) is measurable and rising.
- **Anti-metric:** the inbox must not degrade the M2 till. Watch for (a) duplicate orders on reconnect
  (must stay ~0 — convergence is the contract), (b) any cost/margin value rendering on a `MERCHANT_STAFF`
  session (must be 0), (c) increase in failed/blocked sends caused by merchants fighting the window UI
  (signals the plain-language window state isn't landing).

## Open questions

Routed to bukani-architect (UI design) unless noted. None block discovery; all are UI-design calls, not new
backend.

1. **Inbox unread source of truth** — is "unread / needs-reply" computed from a field the list route already
   returns, or derived client-side from last-inbound-vs-last-outbound? Architect to confirm against the
   frozen list-route payload.
2. **Refresh model** — fetch-on-open + pull-to-refresh, or a bounded poll interval on the open thread?
   (Realtime is explicitly out.) Architect picks the lightest option that meets Nomsa's data/battery
   constraints.
3. **Catalog-picker reuse** — does order-capture reuse the existing M2 `OrderForm` item-picker
   (`src/app/(merchant)/orders/OrderForm.tsx`) pre-seeded from the conversation, or a chat-specific picker?
   Reuse is preferred to keep one order-capture mental model.
4. **Where capture-from-chat writes** — confirm capture goes through the existing M2 order store / sync path
   (it must, per the frozen contract) so offline convergence is inherited, not re-implemented.
5. **Window-state copy + i18n** — exact plain-language strings for open/closed window and the non-AI
   auto-reply framing; founder/Nomsa-context call on isiZulu/isiXhosa-readiness for these specific strings.

## Risks / unknowns (business, not technical)

- **Comprehension risk (P0 persona):** the 24h-window concept is alien to a low-literacy cash-first user. If
  the window-state copy reads as a technical error, Nomsa will think the app is broken and revert to the
  WhatsApp app — defeating the milestone. Plain-language, possibly local-language, copy is load-bearing, not
  polish.
- **Trust risk on auto-replies:** if auto-replies feel like "an AI talking to my customers," Nomsa won't
  enable them. Framing them as her own simple canned messages is a product requirement (S7/AC6).
- **Channel-dark risk:** the whole surface is sandbox-only until the 360dialog DPA / EU-pin / responsible-party
  rulings clear (E2/E3). Early-access metrics come from sandbox/pilot, not GA — set expectations accordingly.
- **Scope-creep risk:** media, search, and realtime will be requested the moment merchants use it. They are
  deliberately deferred; build the core loop first and resist bundling.

## Navigation

The inbox lives as a **top-level merchant nav item**, added to `navItems` in
`src/app/(merchant)/layout.tsx` between **Orders** and **Customers** (it sits at the seam where chat becomes a
sale and a customer):

```
Dashboard · Products · Orders · WhatsApp · Customers · Inventory · Onboarding
```

- **Label:** "WhatsApp" (or "Chats" — founder/i18n call; "WhatsApp" is the recognised word for Nomsa).
- **Route:** `/whatsapp` → inbox list (S1); `/whatsapp/[conversationId]` → thread + reply + share + capture +
  payment (S2–S6); `/whatsapp/auto-replies` → rule management (S7).
- **Unread count:** the nav item carries the total-unread badge (S1/AC2), consistent with the existing
  online/offline banner pattern already in the shell.
- It inherits the existing `MerchantShell` (offline banner, `SessionProvider`, `max-w-3xl` mobile-first
  container, emerald accent, `SyncBadge`, `centsToZAR`, SAST formatting) — **no new layout chrome.**

## Definition of Done (feature level)

Done when, on the merchant PWA against the 360dialog sandbox: (1) Nomsa/Sipho open `/whatsapp`, see the
conversation list with unread state, and open a thread; (2) they read messages with direction/status and the
plain-language window state; (3) they send a free-form reply when the window is open and are cleanly
blocked-with-explanation when closed; (4) they share the catalog (sell-price-only) into a thread; (5) they
capture an order from a chat with no re-typing that lands as an M2 `Order(channel = WHATSAPP)`, links/creates
the customer, decrements stock, and converges exactly once when done offline; (6) they mark that order
PAID/UNPAID from the chat; (7) the owner manages auto-reply rules (list/toggle/create/edit/delete) and Sipho
cannot reconfigure them; (8) the RBAC cost-split and PII-masking hold on every inbox surface; (9) offline
read-from-cache + queued-pending sends + `SyncBadge` behave per the M2 pattern; (10) the nav item + unread
badge ship; (11) it is released behind the existing channel-dark posture (sandbox-only until the GA gates
clear), documented, and the success/anti-metrics are instrumented (PII-safe).
