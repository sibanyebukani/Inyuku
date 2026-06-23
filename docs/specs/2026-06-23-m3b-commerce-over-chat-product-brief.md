# Inyuku Digital — M3-B (Commerce-over-Chat) Product Brief

> **Author:** bukani-product · **Date:** 2026-06-23 · **Status:** M3-B in discovery
> (M0 + M1 + M2 + **M3-A** merged).
> **Decision posture:** **MVP scope decision (founder, 2026-06-23) — MVP = WhatsApp commerce, NO payments.
> M3-B is the LAST MVP build milestone.** This brief scopes the **commerce-over-chat + consent-rule
> enforcement** slice out of the whole-M3 brief (`docs/specs/2026-06-22-m3-whatsapp-commerce-product-brief.md`
> §8, slice "M3-B"). The whole-M3 vision is NOT re-litigated here.
> **Builds on:** the frozen M3-A BSP-plumbing seams (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`)
> and the merged M2 Commerce Core (`server/prisma/schema.prisma`, commerce routes under
> `server/src/routes/v1/commerce.routes.ts`).
> **Persisted by:** bukani-docs. The frozen architect contracts that implement this brief will live in
> `docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md` (bukani-architect, next, on this same branch).
> Canonical mirrors land in `docs/API.md`, `docs/SCHEMA.md`, `docs/DECISIONS.md`, `docs/POPIA.md`,
> `docs/THREAT-MODEL.md`, `docs/ROADMAP.md` after merge (the M3-A pattern: architect freezes here, docs
> bundles one PR).

---

## 1. Why M3-B exists

M3-A delivered the **channel plumbing** — Inyuku can now *receive* a customer's WhatsApp message
(signature-verified, replay-safe, idempotent), persist it as a `Conversation` + `Message`, *send* a
free-form or template reply, track the 24-hour customer-care window, and gate sends through an approved
template registry and a default-deny consent stub. But M3-A is **backend-only and commerce-blind**: a
webhook **never** writes an `Order`, `StockMovement`, or `Customer` (M3-A §0), and there is **no screen** for
Nomsa to read a conversation or act on it.

So today, after M3-A, the message is captured but the *trade is still lost*. Nomsa can technically see
nothing (no UI), and even if she could, turning that chat into a recorded sale still means re-typing the
customer, the items, and the price into the M2 till by hand — the exact double-work M3 set out to kill.

M3-B closes the loop. It is the **merchant value layer** that sits on the M3-A channel: a **chat/inbox
screen** Nomsa and Sipho can actually use, **catalog share** from the M2 catalog, **order capture from
chat** that creates a real M2 `Order(channel = WHATSAPP)` — linking/creating the M2 `Customer` and
decrementing stock through the `StockMovement` ledger, with **no re-typing** — **rule-based (non-AI)
auto-replies**, **order/payment-status notifications** that auto-pick free-form vs template by the window,
and the **enforced consent rules** the M3-A stub defers to.

Because the founder has ruled MVP = WhatsApp commerce with **no payments**, M3-B is the **last MVP build
milestone**. After M3-B, a South African spaza owner can do the whole job — receive the order on WhatsApp,
record it in her shop, decrement her stock, and tell the customer it's ready — entirely inside Inyuku,
collecting cash herself exactly as she does today. Payments (M4) and the AI assistant (M5) come after MVP.

---

## 2. Personas (canonical — see `docs/PERSONAS.md`)

- **Nomsa — spaza-shop owner. P0 design target (`MERCHANT_OWNER`).** WhatsApp *is* her counter. M3-B is the
  milestone closest to how she already trades. Every M3-B decision optimises for Nomsa: turn a WhatsApp chat
  into a recorded sale in as few taps as possible, and **keep working sanely when her signal drops
  mid-conversation** (offline = P0). She reads a thread, taps the items the customer agreed, and the order,
  the customer, the stock decrement, and the dashboard all update without her re-typing.
- **Sipho — shop assistant (`MERCHANT_STAFF`). The RBAC cost-split.** Sipho answers customer messages and
  captures orders over WhatsApp, but **must not see cost price, margin, or financial totals** — by **hiding,
  not zeroing** (the M2 convention: `MERCHANT_STAFF` has every commerce permission EXCEPT
  `catalog:read_cost` and `dashboard:read_financial`). The M3-B chat/inbox and order-capture surfaces
  inherit this split unchanged.
- **Thandi — artisan / caterer. Validation persona (seams, not scope).** A made-to-order negotiation over
  chat ("can you do a cake for Saturday?") is the *canonical* WhatsApp-commerce flow, but M3-B still builds
  **no fulfilment lifecycle**. Thandi validates that an order captured from a free-form WhatsApp negotiation
  lands cleanly on the existing **nullable** M2 `fulfilmentStatus` / `paymentRef` / `escrowRef` seams. She is
  the design check, not the design target — do not pull fulfilment into M3-B for her.

**End-data-subject (from M3-A):** the **WhatsApp customer** — the person messaging the merchant. Their phone
number (`Conversation.waContactId`) and message content (`Message.body`) are personal information. M3-B is
the first milestone that may turn that PII into an M2 `Customer` row, so it is the first to actually exercise
the consent enforcement point (§7).

---

## 3. Problem statement

After M3-A, the message is captured server-side, but **the merchant cannot see it and the trade does not
become a sale.** Nomsa still has no screen showing the conversation, and even the data that *is* captured is
inert: a WhatsApp message does not become an `Order`, the customer is not in her directory, her stock does
not move, and her dashboard does not count the sale. So her M2 numbers still under-count her real trade and
her stock still drifts out of sync with what she actually sold over WhatsApp.

**Success looks like:** Nomsa (or Sipho) opens an inbox screen in Inyuku, reads the WhatsApp conversation,
shares her catalog if the customer is choosing, and with a few taps turns the agreed items into a recorded
**M2 `Order(channel = WHATSAPP)`** — customer linked or created, stock decremented through the
`StockMovement` ledger, dashboard updated — **without leaving Inyuku and without re-typing**. She can fire a
deterministic canned reply (greeting / "send menu" / out-of-hours) without thinking about it, and she can
send the customer an order- or payment-status update that the system delivers as a **free-form message
inside the 24-hour window or an approved template outside it**, with cash collected by Nomsa herself
(payment state stays the M2 manual `PAID`/`UNPAID` flag — M3-B notifies, never collects). And when her
signal drops mid-conversation, the surface degrades sanely: she reads cached threads, queued sends are
clearly marked pending, and an order she captures offline converges through the M2 sync path without
duplicating.

---

## 4. Product principles for M3-B

Carried from the whole-M3 brief §4 and narrowed to this slice:

- **WhatsApp is the counter, Inyuku is the till.** The conversation lives on WhatsApp (and is mirrored in
  the M3-A `Conversation`/`Message` tables); the **record of trade** lives in the M2 commerce core. M3-B is
  the bridge — it does **not** fork a second order model.
- **One order model.** A WhatsApp order is a normal **M2 `Order` with `channel = WHATSAPP`**. No parallel
  order type. It flows into the same dashboard, the same `StockMovement` ledger, the same RBAC cost-split,
  and (in M4, later) the same payment path. It reuses M2 line-price snapshotting and the nullable
  `fulfilmentStatus`/`paymentRef`/`escrowRef` seams.
- **No re-typing.** The whole point. Order capture pulls items from the M2 catalog and the customer from the
  conversation's `waContactId`; the merchant selects and confirms, she does not transcribe.
- **Respect WhatsApp's rules, hide their complexity (reuse M3-A).** Free-form vs approved-template is
  **chosen by the server from the M3-A window state**, never by the merchant guessing. M3-B does not
  re-implement the window or the registry — it **consumes** the M3-A send API, which already enforces them.
- **Rules, not intelligence (yet).** M3-B auto-replies are **deterministic, merchant-configured canned
  responses** triggered by simple, explicit conditions (first inbound, an exact-match keyword, out-of-hours).
  They MUST NOT call `lib/ai.js`, MUST NOT be generative, MUST NOT do intent detection, and MUST leave the
  conversational surface clean for the M5 AI Business Agent (EA-ADR-009/011/012). Any "smart" reply is M5.
- **Notify, never collect.** M3-B sends payment-*status* updates; payment *state* is the M2 manual
  `PAID`/`UNPAID` flag set by the merchant. No payment links, no escrow, no money movement — that is M4.
- **Offline = P0, server-side ingest stays online.** Inbound webhooks are received server-side (M3-A) — the
  merchant's *device* never has to be online for a message to be captured. The merchant's *view* and the
  *order-capture* flow must degrade gracefully: cached read, queued sends clearly marked pending, and an
  order captured offline converges through the **existing M2 offline-sync path** (the `clientId` idempotency
  convention, `POST .../sync`), never duplicating on reconnect.
- **Cash-first, ZAR-first, low-literacy.** Money is ZAR integer cents, no floats, ever. The inbox and
  order-capture surfaces stay visually simple and local-language-ready.
- **Consent default-safe.** The M3-A consent enforcement point is **default-deny** for non-transactional
  sends and the customer-directory ruling is still OPEN. M3-B wires its enforcement to work under that stub
  today and slot into the ruling later; `Customer.consentId` stays **nullable**.

---

## 5. In scope (the M3-B slice)

1. **Merchant chat / inbox UI.** A screen (merchant PWA) where Nomsa/Sipho list conversations, open a
   thread, read inbound + outbound `Message`s, see the M3-A window state ("you can reply freely until
   HH:MM" / "window closed — only an approved update can be sent"), send a free-form or template reply, and
   launch catalog-share and order-capture from the thread. **This is net-new — M3-A is backend-only.**
2. **Catalog share over WhatsApp.** From an open conversation, send the customer products / a catalog
   representation drawn from the **live M2 catalog** (ZAR prices; archived/out-of-stock handling per
   architect contract), via the M3-A outbound send.
3. **Order capture from chat.** Turn a conversation into an **M2 `Order(channel = WHATSAPP)`**: snapshot
   line items (name + unit price) from the M2 catalog, total in ZAR cents, **link or create** the M2
   `Customer` from the conversation's `waContactId`, **decrement stock** via the append-only
   `StockMovement` ledger (negative stock allowed-and-flagged per M2), and **link the resulting order back to
   the conversation** so the thread shows "order #N captured." No re-typing.
4. **Rule-based, deterministic auto-replies.** Merchant-configurable canned responses triggered by explicit,
   non-AI conditions — at minimum: **greeting** (first inbound on a conversation / after long silence),
   **"send menu" keyword** (exact/normalised keyword match → catalog share or a canned menu text), and
   **out-of-hours** (inbound outside merchant-configured business hours → canned "we'll reply in the
   morning"). Explicitly **non-AI**; never touches `lib/ai.js`.
5. **Order / payment-status notifications.** Send the customer an order- or payment-status update
   (e.g. "order received", "ready for collection", "marked paid"), with the M3-A send API **auto-choosing
   free-form (window open) vs approved template (window closed)**. Payment *state* stays the M2 manual
   `PAID`/`UNPAID` flag — M3-B **notifies, never collects**.
6. **Consent-rule enforcement (the rules the M3-A stub defers to).** M3-B is the milestone that actually
   exercises the consent enforcement point: respect WhatsApp opt-in / revocation via the **M1 `Consent` /
   `ConsentRevocation`** ledger, branching on `Message.sendClass` (`TRANSACTIONAL` vs `MARKETING`). Designed
   to work under the **default-deny stub today** and slot into the responsible-party ruling later;
   `Customer.consentId` stays nullable.

---

## 6. Explicitly out of scope (do not design)

- **Payments capture / collection over WhatsApp → M4** (TradeSafe escrow, payment links, settlement). M3-B
  *notifies* about payment status; it never collects money. Orders are left payable on the M2
  `paymentState` + nullable `paymentRef`/`escrowRef` seams.
- **Any AI / generative replies, intent detection, conversational assistant → M5** (`lib/ai.js`). M3-B
  auto-replies are **rule-based only** and MUST NOT consume the AI gateway. The `AI_AGENT` principal is
  irrelevant to M3-B (no AI on this surface).
- **Fulfilment / delivery lifecycle.** M3-B reuses the **nullable** M2 `fulfilmentStatus` seam; it builds
  none of the lifecycle (Thandi's validation point).
- **Marketing / broadcast blasts** (bulk template campaigns beyond per-order transactional notifications) —
  heavier consent/cost profile; a later-milestone candidate, not M3-B.
- **Meta native-catalog / Shop product-sync** — M3-B shares from the *Inyuku* M2 catalog; native
  Meta-catalog objects are out unless the architect deems a thin variant cheaper.
- **Lending / credit** — ADR-006 boundary holds; WhatsApp data stays internal, never a credit surface.
- **The BSP plumbing itself** — webhook ingest, `Conversation`/`Message` persistence, outbound send, window
  tracking, template registry, the consent enforcement *point*, and the sub-processor enable flag are
  **already M3-A**. M3-B consumes them; it does not re-build them.
- **Re-litigating the §7 compliance rulings** — M3-B designs *around* the open rulings (default-deny,
  nullable `consentId`); it does not invent the ruling.

---

## 7. User stories & acceptance criteria

> Convention reminder for every story: money = **ZAR integer cents, no floats**; multi-tenant — all tenant
> routes under `/v1/businesses/:businessId/*`, `businessId` enforced server-side, no cross-tenant leakage;
> PII (`Message.body`, `waContactId`, customer phone) **masked in logs**; **offline = P0**; **RBAC
> cost-split** hides (not zeroes) cost/margin/financial fields from `MERCHANT_STAFF`.
> "M3-A seam consumed" / "M2 seam written" are called out per story for the architect.

---

### M3B-S1 — Read my WhatsApp conversations in Inyuku (the inbox)
*As Nomsa (or Sipho), I want a screen in Inyuku that lists my WhatsApp conversations and lets me open a
thread, so that I can read and answer customers where my shop data lives — because M3-A captured the
messages but gave me no way to see them.*

- **AC1:** Given the merchant opens the inbox, when conversations exist for the business, then they are
  listed (most-recent-activity first) showing the customer's (masked-where-displayed-per-design) WhatsApp
  identity, a last-message preview, and an unread/needs-reply indicator — all scoped to the resolved
  `businessId`; no other tenant's conversations appear.
- **AC2:** Given the merchant opens a thread, then inbound + outbound `Message`s render in order with
  direction, timestamp, and delivery status (`SENT`/`DELIVERED`/`READ`/`FAILED` from M3-A status callbacks),
  paginated.
- **AC3:** Given a thread is open, then the **M3-A window state is shown in plain, non-technical language**
  ("Reply freely until 14:32" when OPEN with `windowExpiresAt`; "Window closed — you can only send an
  approved update" when CLOSED) so the merchant never guesses send mode.
- **AC4 (RBAC):** Given Sipho (`MERCHANT_STAFF`) uses the inbox, then he can read and reply to conversations
  (`whatsapp:read` + `whatsapp:send` from M3-A) but **no cost price, margin, or financial total is shown
  anywhere on the inbox or thread surface** — hidden, not zeroed. (Cost fields only appear once order capture
  shows the catalog, governed by AC in M3B-S3.)
- **AC5 (offline, P0):** Given the merchant's signal drops, then previously-loaded conversations/threads
  remain readable from cache; the UI clearly marks the data as possibly stale and disables live actions that
  require the server, rather than erroring blankly.
- **AC6 (PII):** Given any inbox/thread action, then raw `Message.body` and the customer phone number are
  never written to application logs (chassis `logger` + `pii-mask`); they are shown only in the authenticated
  merchant UI.

> **M3-A seams consumed:** `Conversation` + `Message` reads, `windowState`/`windowExpiresAt`, the
> `whatsapp:read` permission, the tenant-scoped read routes (`GET .../whatsapp/conversations[/:id][/messages]`).
> **M2 seams written:** none (read-only).

---

### M3B-S2 — Send a free-form reply or status update within the rules
*As Nomsa, I want to type a reply to a customer from the thread, so that I can answer them — and have the
system stop me from breaking WhatsApp's rules instead of giving me a cryptic error.*

- **AC1:** Given the window is OPEN, when the merchant sends a typed reply, then it goes out as a **free-form
  message** (M3-A send, `type = TEXT`), a `Message(direction = OUTBOUND, status = QUEUED → SENT)` is created,
  and the thread updates.
- **AC2:** Given the window is CLOSED, when the merchant tries a free-form reply, then the system **blocks
  the free-form send at the boundary** (M3-A `409 whatsapp_window_closed`) and the UI offers the **approved
  template** path with a plain-language explanation — the merchant never sees a raw platform error.
- **AC3:** Given any send, then `sendClass` is supplied explicitly (never inferred) — a plain reply/status
  update is `TRANSACTIONAL`; the consent check branches on it (M3B-S6).
- **AC4 (offline, P0):** Given the merchant sends while offline, then the send is **queued and clearly
  marked pending** in the thread (not silently dropped); on reconnect it is attempted, and a failure
  surfaces a clear retry state. Live two-way chat is inherently online — this is best-effort queueing, not a
  guarantee of delivery while offline.
- **AC5 (RBAC):** Sipho (`MERCHANT_STAFF`) can send (`whatsapp:send`); nothing on the send surface exposes
  cost/margin/financial data.

> **M3-A seams consumed:** outbound send route (`POST .../whatsapp/conversations/:id/messages`), window
> state machine, `sendClass`, `409`/`422`/`403` send-error envelope, `whatsapp:send`.
> **M2 seams written:** none.

---

### M3B-S3 — Capture an order from a chat (no re-typing)
*As Nomsa (or Sipho), I want to turn a WhatsApp conversation into a recorded order, so that stock, the
customer book, and my dashboard update without me re-typing what we agreed.*

- **AC1:** Given an open conversation, when the merchant captures an order by selecting items **from the M2
  catalog** and quantities, then an **M2 `Order` is created with `channel = WHATSAPP`**, `OrderLine`s
  snapshotting `nameSnapshot` + `unitPriceCents` (M2 convention), and `subtotalCents`/`totalCents` in **ZAR
  cents**.
- **AC2 (customer link):** Given capture, then the order links to an existing M2 `Customer` matched on the
  conversation's `waContactId`/phone, or **creates one** (name defaulting per architect contract; `phone`
  from `waContactId`). **`Customer.consentId` stays nullable** (the directory consent ruling is OPEN, §8) —
  customer creation must not be blocked by the absence of a consent grant for *capturing a transactional
  order*, but must respect the M3B-S6 enforcement for any subsequent *messaging*.
- **AC3 (stock):** Given capture, then stock is decremented by writing `StockMovement` rows
  (`type = SALE`, signed `qtyDelta`, `orderId` set) through the **existing append-only ledger** — never a
  mutable column. **Negative stock is allowed-and-flagged**, per M2 (a sale is never rejected for low stock).
- **AC4 (link back):** Given an order is captured from a conversation, then the conversation/thread records
  the link (the thread shows "Order #N captured", and the order is discoverable from the conversation) so
  the merchant has one coherent view.
- **AC5 (RBAC cost-split):** Given Sipho (`MERCHANT_STAFF`) captures an order, then he can complete the
  capture, but **cost price, margin, and any financial total beyond the customer-facing sell-price subtotal
  are hidden, not zeroed** (inherits M2: no `catalog:read_cost`, no `dashboard:read_financial`). The
  catalog-picker he sees shows sell price only.
- **AC6 (idempotency / offline, P0):** Given capture happens offline or a request is retried, then order
  creation reuses the **M2 `clientId` idempotency convention** (`@@unique([businessId, clientId])`) and the
  M2 sync path (`POST .../sync`), so a captured order **converges exactly once** on reconnect and is never
  duplicated. Stock movements created with the order inherit the same `clientId` idempotency.
- **AC7 (one order model):** Given a WhatsApp order, then it is an ordinary M2 `Order` — it appears in the
  M2 order list and dashboard, inherits the nullable `fulfilmentStatus`/`paymentRef`/`escrowRef` seams
  (Thandi's validation point), and is **not** a parallel order type.
- **AC8 (audit):** Given capture, then `(order, CREATE)` is audited (M2 tuple), with masked metadata.

> **M3-A seams consumed:** `Conversation` (source of `waContactId`, the link target), conversation→order
> linkage (architect to add the seam — likely a nullable `orderId`/join the architect designs).
> **M2 seams written:** `Order(channel = WHATSAPP)`, `OrderLine`, `Customer` (link/create), `StockMovement`
> (`type = SALE`), the `clientId` idempotency convention, the `POST .../sync` path, `(order, CREATE)` audit.

---

### M3B-S4 — Share my catalog over WhatsApp
*As Nomsa, I want to send a customer my products over WhatsApp, so that they can choose without me typing
each item.*

- **AC1:** Given an open conversation, when the merchant taps "share catalog", then the customer receives a
  representation of the merchant's **M2 catalog** (or a merchant-chosen subset) as a WhatsApp message via the
  M3-A send, with **ZAR sell prices**.
- **AC2:** Given the catalog is shared, then content reflects the **live M2 catalog**; **archived /
  out-of-stock handling is per architect contract** (e.g. archived excluded; out-of-stock flagged or
  excluded — architect decides), and **cost price is never included** (customer-facing; also satisfies the
  RBAC split — Sipho's share shows the same sell-only view).
- **AC3 (send rules):** Given catalog share is an outbound send, then it obeys the M3-A window/template
  rules and is classified (sharing a catalog in response to an inbound enquiry inside the window is
  `TRANSACTIONAL`; the consent branch in M3B-S6 applies).
- **AC4 (offline, P0):** Given the merchant is offline, then catalog share follows the same queued-pending
  behaviour as M3B-S2/AC4.

> **M3-A seams consumed:** outbound send (free-form/interactive per architect), window/template rules,
> `sendClass`. **M2 seams written:** none (reads the M2 `Product` catalog; no writes).

---

### M3B-S5 — Deterministic, non-AI auto-replies I can configure
*As Nomsa, I want simple automatic replies (a greeting, a "menu" keyword, an out-of-hours message), so that
customers get an immediate response even when I can't, without me paying for or trusting an AI.*

- **AC1 (greeting):** Given a customer's **first inbound on a conversation** (or first after a configurable
  long silence), when auto-reply is enabled, then a single merchant-configured greeting is sent **once**
  (not on every message), as a `TRANSACTIONAL` free-form reply inside the window.
- **AC2 (keyword):** Given an inbound message **exactly/normalised-matches** a merchant-configured keyword
  (e.g. "menu", "katalogi"), then the configured action fires (canned menu text or a catalog share) — **no
  fuzzy matching, no intent detection, no LLM**.
- **AC3 (out-of-hours):** Given an inbound arrives **outside merchant-configured business hours** (boundary
  in **SAST `Africa/Johannesburg`**, consistent with the M2 dashboard day boundary), then a single
  out-of-hours canned reply is sent (not repeatedly within one closed period).
- **AC4 (explicitly non-AI):** Given any auto-reply, then it is produced by **deterministic rules only** —
  it **MUST NOT** call `lib/ai.js`, MUST NOT be generative, MUST NOT do intent detection. (Architect: keep
  this path provably free of the AI gateway so the M5 STRIDE/autonomy boundary is not pre-empted.)
- **AC5 (rules respect window + consent):** Given an auto-reply would send outside the window, then it
  obeys the M3-A window rules (likely suppressed or template-only) and the M3B-S6 consent branch — an
  auto-reply never bypasses the send gates.
- **AC6 (config + RBAC):** Given auto-reply configuration (greeting text, keywords, hours, on/off), then it
  is **owner-configured** (mirrors the M3-A "staff operate, owner configures" split — architect to map to a
  manage-permission, candidate `whatsapp:manage_channel` or a new `whatsapp:manage_autoreply`); Sipho can
  see that auto-replies fire but not reconfigure them.
- **AC7 (no loops):** Given auto-replies, then the design must not create reply storms (e.g. auto-replying to
  the platform's own/echoed messages or status callbacks) — auto-reply fires only on genuine inbound
  customer `Message`s.

> **M3-A seams consumed:** inbound `Message` (the trigger), outbound send, window state, `sendClass`,
> template registry (if a closed-window auto-reply uses a template). **M2 seams written:** none directly
> (a keyword may *trigger* M3B-S4 catalog share). **Explicitly does NOT consume:** `lib/ai.js`.

---

### M3B-S6 — Enforce WhatsApp messaging consent (the rules the M3-A stub defers to)
*As the platform (on behalf of Nomsa and her customer), I must only send messages the customer has a lawful
basis to receive, so that we respect POPIA and WhatsApp policy — working under today's default-deny stub and
slotting into the compliance ruling later.*

- **AC1 (transactional vs marketing branch):** Given any outbound send, then the consent check **branches on
  `Message.sendClass`** and never collapses the two classes: `TRANSACTIONAL` (order/payment status, direct
  replies to an inbound enquiry) follows the transactional branch; `MARKETING`/non-transactional follows the
  marketing branch, which is **default-DENY** until the §8 ruling lands.
- **AC2 (ledger source of truth):** Given the consent check, then opt-in / revocation state is read from the
  **M1 `Consent` / `ConsentRevocation`** ledger (not a new ad-hoc flag); a recorded grant is required for any
  send the ruling deems consent-based.
- **AC3 (revocation honoured):** Given a customer has revoked (a `ConsentRevocation` exists), then no
  non-transactional/marketing send proceeds to that customer; the send is refused with the M3-A
  `403 whatsapp_consent_denied` envelope and the refusal is auditable (masked).
- **AC4 (default-deny works today):** Given the responsible-party ruling is **still OPEN** (§8), then the
  enforcement operates under the **default-deny stub** for marketing/non-transactional with `consentId`
  **nullable** on `Customer` — i.e. M3-B does not block transactional commerce, does not invent the ruling,
  and is structured so the ruling slots in by changing the branch policy, not the call sites.
- **AC5 (capture vs message split):** Given M3B-S3 may create a `Customer` to record a transactional order,
  then *creating the directory record for a transactional sale* is distinct from *sending the customer
  optional/marketing messages* — capture is not gated on a messaging consent grant, but subsequent
  non-transactional messaging is. (This keeps the open directory-consent ruling, §8, cleanly separable.)
- **AC6 (PII):** Given consent checks/refusals, then customer identifiers in logs/audit are masked.

> **M3-A seams consumed:** the consent enforcement *point* (default-deny stub), `sendClass`,
> `403 whatsapp_consent_denied`. **M1 seams consumed:** `Consent` / `ConsentRevocation` ledger.
> **M2 seams touched:** `Customer.consentId` (stays nullable; not populated by a ruling M3-B doesn't have).

---

### M3B-S7 — Notify the customer of order / payment status
*As Nomsa, I want to tell a customer their order is received / ready / marked paid on WhatsApp, so that they
stay informed and the business looks professional — without me touching payment collection (that's later).*

- **AC1 (status sends, window-aware):** Given an order captured over WhatsApp, when the merchant sends a
  status update (e.g. "order received", "ready for collection"), then the M3-A send **auto-chooses free-form
  (window OPEN) or an approved template (window CLOSED)** — the merchant picks the *update*, not the *mode*.
- **AC2 (payment notify, not collect):** Given the merchant marks the M2 order `PAID`/`UNPAID` (existing
  `PATCH .../orders/:id/payment`), then M3-B can send a corresponding **payment-status notification** —
  but **payment state remains the M2 manual flag**; M3-B never collects money, generates no payment link,
  and touches no escrow (M4 boundary).
- **AC3 (templates only registered/approved):** Given a closed-window status send, then it uses only an
  `APPROVED` `WhatsAppTemplate` from the M3-A registry with params satisfying its `paramSchema`
  (M3-A `422 whatsapp_template_invalid` otherwise); `sendClass = TRANSACTIONAL` for order/payment status.
- **AC4 (consent branch):** Given a status notification, then it passes through the M3B-S6 consent check on
  its `sendClass` (transactional branch); a revoked customer is handled per M3B-S6/AC3.
- **AC5 (offline, P0):** Given the merchant triggers a notification offline, then it follows the queued-
  pending behaviour (M3B-S2/AC4).

> **M3-A seams consumed:** outbound send, window auto-selection, template registry, `sendClass`, consent
> point. **M2 seams written:** none new — reads the M2 `Order`/`paymentState`; payment state is set via the
> existing M2 payment route, not by M3-B.

---

## 8. Open questions & dependencies (flag — do NOT answer here)

Routed to **founder / bukani-compliance / bukani-security**. These mirror the M3-A §6 compliance seams and
the whole-M3 brief §7; M3-B is designed to **build under the default-safe stubs** so these do not block the
sandbox build, but several **GA-gate** the customer-facing surface.

1. **Customer-directory + WhatsApp-consent responsible-party ruling (OPEN — compliance, GA-gating).** Who is
   the responsible party for the WhatsApp customer's PII — the **merchant** (Inyuku = operator) or
   **Inyuku**? This direct analogue of the M2 directory question governs the M3B-S6 branch policy and whether
   transactional-template messaging needs a consent grant. **M3-B builds under default-deny with
   `Customer.consentId` nullable and must NOT invent the ruling.** GA-gates non-transactional messaging.
2. **360dialog as a new sub-processor (EA-ADR-015 extension — compliance, GA-gating live).** Live WhatsApp
   message flow stays **DARK** behind the M3-A `WhatsAppChannel.enabled` flag until the signed binding
   operator DPA + EU pin + bukani-compliance risk assessment clear. M3-B builds and tests **sandbox-first**;
   the live cutover is a separate gated step, not a build blocker.
3. **Message-content / conversation retention period (OPEN — compliance).** M3-B may now turn `Message`
   content into `Order`/`Customer` PII. The M3-A `whatsapp.message.retentionDays` Setting is the seam
   (unset → no auto-purge); the **period and disposal policy are TBD with bukani-compliance** (POPIA §6).
   Do not hard-code.
4. **bukani-security STRIDE entry for the M3-B commerce surface.** M3-A's STRIDE covered the webhook/channel.
   M3-B adds **order-capture-from-chat, customer-create-from-PII, auto-reply triggering, and the inbox
   surface** — needs a `docs/THREAT-MODEL.md` entry (cross-tenant capture, consent-bypass via auto-reply,
   PII-in-order-from-message) **before contract-freeze**, consistent with how M2/M3-A gated.
5. **Auto-reply config permission + loop-safety (architect/founder).** Which permission governs auto-reply
   config (reuse `whatsapp:manage_channel` vs new `whatsapp:manage_autoreply`), and the loop-prevention
   guarantees (no replying to echoes/status callbacks) — flagged for the architect; the **owner-configures,
   staff-operates** split is non-negotiable.
6. **Conversation→Order linkage seam (architect).** M3-S3/AC4 needs a seam linking a captured `Order` back
   to its `Conversation`. Architect to choose the cleanest representation (nullable FK on one side / join)
   without forking the order model.
7. **Catalog-share representation (architect).** Whether catalog share is a plain text list, a list of
   product messages, or a WhatsApp interactive list — and archived/out-of-stock handling — is an architect
   contract call (M3B-S4/AC2); founder may have a UX preference for Nomsa's low-literacy context.
8. **Standing open items (do not invent):** brand/cookie domain (`.inyuku.co.za` PROVISIONAL), monthly
   budget / WhatsApp conversation-cost ceilings, role owners (Information Officer / ops), retention periods —
   all per CLAUDE.md §7. M3-B surfaces them; it does not resolve them.

---

## 9. Prioritisation (P0 / P1)

RICE is rough at brief stage (effort comes from bukani-architect). MVP is gated on M3-B, and **the
no-re-typing order-capture loop plus the screen to do it on are the reason this milestone exists**, so they
are P0. Notifications/auto-replies are high-value polish that make the MVP feel complete but are not the core
loop.

| Story | Title | Priority | Rationale |
|---|---|---|---|
| **M3B-S1** | Inbox / read conversations | **P0** | Without a screen, nothing else is usable. M3-A is backend-only. The minimum to make the channel visible. |
| **M3B-S3** | Order capture from chat | **P0** | The reason M3 exists — kills the double-work, lands the trade in the M2 till. The MVP loop. |
| **M3B-S2** | Free-form reply within the rules | **P0** | The merchant must be able to answer the customer to close a sale; the window-rule guardrail is core, not optional. |
| **M3B-S6** | Consent enforcement | **P0 (build the gate; rules stubbed)** | Compliance-critical and on every send path; must be wired now even though the *ruling* is open (§8.1). Built default-safe. |
| **M3B-S4** | Catalog share | **P1** | High value for Nomsa's low-typing flow, but a sale can be captured from an agreed list without it. |
| **M3B-S7** | Order / payment-status notifications | **P1** | Makes the MVP look professional and closes the loop with the customer; not required to *record* the sale. |
| **M3B-S5** | Rule-based auto-replies | **P1** | Convenience + responsiveness; deterministic, non-AI. Valuable but the merchant can reply manually (S2) in MVP if it slips. |

**Sequencing note for the architect:** S1 + S3 + S2 + S6 form the **shippable MVP core** (read, reply,
capture, gate). S4/S7/S5 are independently shippable on top and should be split so they do not block the
core ship date. Every story above is independently testable by QA against the 360dialog sandbox without
asking the PM a question.

---

## 10. Non-negotiable conventions carried forward (for architect / KIMI)

- **ZAR integer cents** for all money on WhatsApp orders/notifications. No floats, ever.
- **One order model.** WhatsApp orders are M2 `Order` rows with `channel = WHATSAPP`; they inherit the M2
  stock-as-movements ledger, line-price snapshotting, RBAC cost-split, the `clientId` idempotency
  convention, and the nullable `fulfilmentStatus`/`paymentRef`/`escrowRef` seams. **No parallel order type.**
- **Multi-tenancy:** `businessId` enforced server-side on every M3-B route (under
  `/v1/businesses/:businessId/*`); no cross-tenant conversation/order/customer leakage.
- **Offline = P0.** Inbox/thread read from cache; outbound sends queued + clearly marked pending; order
  capture reuses the **M2 offline-sync path** (`clientId` idempotency, `POST .../sync`) so it converges
  exactly once. Live two-way chat is online-only.
- **RBAC cost-split (Sipho).** `MERCHANT_STAFF` operates the conversation and captures orders but **never
  sees cost / margin / financial totals — by hiding, not zeroing** (no `catalog:read_cost`, no
  `dashboard:read_financial`). Auto-reply/channel config is **owner-only**.
- **PII masked in logs (POPIA).** `Message.body`, `waContactId`, and customer phone are PII — never logged
  raw; chassis `logger` + `pii-mask`. Raw content lives in the datastore (and at 360dialog), not in logs.
- **Consent default-safe.** Enforcement branches on `sendClass`, reads M1 `Consent`/`ConsentRevocation`,
  default-denies marketing/non-transactional, keeps `Customer.consentId` nullable, and slots into the §8.1
  ruling by changing branch policy — not call sites.
- **No AI in M3-B.** Auto-replies are **rule-based and deterministic**; they MUST NOT call `lib/ai.js`,
  MUST NOT be generative, MUST NOT do intent detection, and MUST leave the conversational surface clean for
  the M5 AI Business Agent (EA-ADR-009/011/012). The `AI_AGENT` principal stays read-only (M3-A §10).
- **Notify, never collect.** Payment state is the M2 manual `PAID`/`UNPAID` flag; M3-B notifies only.
  Payment collection is M4.
- **Sub-processor discipline (EA-ADR-015).** Live 360dialog message flow stays dark behind the M3-A
  `WhatsAppChannel.enabled` flag until the DPA + EU pin + risk assessment clear. M3-B builds sandbox-first.
- **SAST day/hours boundary.** Out-of-hours auto-reply and any day-bounded logic use
  `Africa/Johannesburg`, consistent with the M2 dashboard.

---

## 11. Definition of Done (feature level — M3-B)

M3-B is done when, **against the 360dialog sandbox**: (1) Nomsa/Sipho can open an inbox, read a
conversation, and reply within the window rules; (2) a conversation can be captured into an M2
`Order(channel = WHATSAPP)` with customer link/create + ledger stock decrement + dashboard reflection, with
**no re-typing**, converging exactly once when captured offline; (3) auto-replies, catalog share, and
status notifications work deterministically and obey the window + consent gates; (4) the RBAC cost-split and
PII-masking hold on every M3-B surface; (5) the bukani-security STRIDE entry (§8.4) is in and its conditions
are reflected in the frozen contracts; (6) the consent enforcement runs under the default-deny stub with
`Customer.consentId` nullable; (7) docs (`API.md`, `SCHEMA.md`, `DECISIONS.md`, `POPIA.md`,
`THREAT-MODEL.md`, `ROADMAP.md`) are updated by bukani-docs post-merge. **Live messaging stays DARK** behind
the M3-A enable flag until the §8.2 DPA/verification gate clears — that cutover is explicitly **not** part of
M3-B's build DoD.
