# Inyuku Digital — M3 (WhatsApp Commerce Engine) Product Brief

> **Author:** bukani-product · **Date:** 2026-06-22 · **Status:** M3 in discovery (M0 + M1 + M2 merged).
> **Decision posture:** full design pass approved; **sandbox-first** (360dialog sandbox + mocked webhooks),
> live-number cutover gated on Meta/360dialog verification. WhatsApp **channel only** — payments (M4) and the
> AI agent (M5) are out of scope but their seams are noted.
> **Persisted by:** bukani-docs as the canonical product brief for M3. The frozen architect contracts that
> implement this brief will live in `docs/specs/2026-06-22-m3-whatsapp-commerce-contracts.md` (to be written
> by bukani-architect). Canonical persistence: `docs/SCHEMA.md`, `docs/API.md`, `docs/DECISIONS.md`,
> `docs/POPIA.md`, `docs/THREAT-MODEL.md`, `docs/PERSONAS.md`, `docs/ROADMAP.md`.

---

## 1. Why M3 exists

M0 (repo/Next migration), M1 (Fastify/Prisma platform foundation), and M2 (Commerce Core — catalog,
inventory, orders, customers, dashboard, offline-first sync) are **merged**. A merchant can now run their
shop. But in the South African informal economy, **the shop counter is WhatsApp.** Customers do not
download a merchant's app or visit a website — they message the business on WhatsApp, ask "do you have X,"
agree a price, and arrange collection or delivery in the same thread. Today Nomsa runs that conversation
entirely by hand, on a separate phone app, with nothing flowing back into the shop she just built in M2:
stock she sold over WhatsApp is not decremented, the customer is not in her directory, and the order is not
in her dashboard.

M3 closes that gap. It connects Inyuku to WhatsApp via the **360dialog BSP** (EA-ADR-014 / CLAUDE.md §2) so
that a conversation on WhatsApp becomes a first-class **Order** in the M2 commerce core — `channel =
WHATSAPP` — without Nomsa re-typing anything. It is the **distribution milestone**: M2 gave the merchant a
shop; M3 puts that shop where the customers already are.

M3 is **channel plumbing plus rule-based commerce-over-chat**. It is deliberately *not* the AI assistant
(M5) and *not* payments (M4). Auto-replies in M3 are simple, deterministic rules — not the M5 Business
Agent — and an order captured over WhatsApp is payable later in M4 exactly like any other M2 order.

---

## 2. Personas (canonical — see `docs/PERSONAS.md`)

- **Nomsa — spaza-shop owner. P0 design target.** Entry-level Android, intermittent connectivity /
  load-shedding, low digital literacy, prefers isiZulu / isiXhosa / Sesotho / Afrikaans, thinks in cash /
  ZAR. **WhatsApp is already her primary customer channel** — M3 is arguably the milestone closest to how
  she actually trades. Every M3 decision optimises for Nomsa: she should be able to turn a WhatsApp chat
  into a recorded sale in as few taps as possible, and the system should keep working sanely when her signal
  drops mid-conversation.
- **Sipho — shop assistant (`MERCHANT_STAFF`).** Answers customer messages and records sales. The M2
  cost-visibility split carries forward: Sipho can run the WhatsApp conversation and capture the order but
  **must not see cost price / margin / financial totals**. Whatever conversation- or order-management
  surface M3 adds inherits the M2 RBAC cost-split.
- **Thandi — artisan / caterer. Validation persona (seams, not scope).** Made-to-order work negotiated over
  chat ("can you do a cake for Saturday?") is the *canonical* WhatsApp-commerce flow — but M3 still does not
  build the fulfilment lifecycle. Thandi validates that an order captured from a free-form WhatsApp
  negotiation lands cleanly on the existing nullable `fulfilmentStatus` / `paymentRef` / `escrowRef` seams.
  She is the design check, not the design target.

**New end-data-subject in M3:** the **WhatsApp customer** (the person messaging the merchant). Their phone
number and message content are personal information — see §6 and the POPIA dependencies in §7.

---

## 3. Problem statement

Nomsa's customers reach her on WhatsApp, but her business system (Inyuku, post-M2) has no idea those
conversations happened. The result: **double work and lost data.** She negotiates a sale in WhatsApp, then
(if she remembers) re-enters it into Inyuku — re-typing the customer, the items, the price — and stock,
dashboard, and customer book only update if she does that second step manually. Most of the time she
doesn't, so her M2 numbers under-count her real trade and her stock drifts out of sync with reality.

**Success looks like:** a WhatsApp conversation can be turned into a recorded Inyuku `Order` (channel =
WHATSAPP) — with the customer captured, stock decremented, and the dashboard updated — without leaving
Inyuku and without re-typing. And the merchant can send a customer their order/payment status using
WhatsApp's messaging rules correctly (free-form replies inside the 24-hour customer-care window; approved
templates outside it), so customers get updates and the business looks professional.

---

## 4. Product principles for M3

- **WhatsApp is the counter, Inyuku is the till.** The conversation lives on WhatsApp; the *record of trade*
  lives in Inyuku's M2 commerce core. M3 is the bridge — it does not fork a second source of truth.
- **One order model.** A WhatsApp order is a normal M2 `Order` with `channel = WHATSAPP`. No parallel order
  type. It flows into the same dashboard, the same stock ledger, and (in M4) the same payment path.
- **Respect WhatsApp's rules, hide their complexity.** The 24-hour session window and approved-template
  requirements are real platform constraints. The merchant must never get a cryptic "outside session window"
  failure — the product enforces the rules and offers the right action (free-form vs template) for her.
- **Rules, not intelligence (yet).** M3 auto-replies are deterministic (e.g. "thanks, we'll be in touch" on
  first inbound, a catalog link on a keyword). They must **not** pre-empt the M5 AI Business Agent boundary
  — no LLM, no `lib/ai.js`, no generative replies in M3.
- **Server-side ingest, graceful offline view.** Inbound webhooks are received server-side and online — the
  merchant's *device* does not need to be online for a message to be captured. The merchant's *view* of
  conversations should degrade gracefully offline (read cached threads; queued outbound sends are best-effort
  and clearly marked pending), but live two-way chat is inherently online.
- **Cash-first, ZAR-first, low-literacy.** Carries forward from M2: money is integer ZAR cents; conversation
  and order surfaces stay visually simple and local-language-ready.

---

## 5. Scope

### In scope

**Channel plumbing (the BSP layer):**
- Inbound webhook ingestion from 360dialog (messages, status callbacks) with **signature verification and
  replay protection**.
- Persistence of **`Conversation`** and **`Message`** (inbound + outbound), tenant-scoped by `businessId`,
  linked to the WhatsApp customer phone number.
- Outbound message send (free-form and template) via the 360dialog API.
- **24-hour customer-care session-window tracking** — the system knows, per conversation, whether the
  free-form window is open, and which send modes are currently legal.
- **Approved-template registry** — the set of Meta-approved message templates the merchant may send outside
  the window (e.g. order confirmation, payment-status, ready-for-collection), with their parameters.

**Commerce-over-chat (the merchant value layer):**
- **Catalog share** — send a customer products / a catalog link from the M2 catalog over WhatsApp.
- **Order capture from chat** — turn a conversation into an M2 `Order` with `channel = WHATSAPP`; link/create
  the M2 `Customer`; decrement stock via the existing `StockMovement` ledger.
- **Rule-based auto-replies** — deterministic, merchant-configurable canned responses (greeting, "send menu",
  out-of-hours), explicitly non-AI.
- **Order / payment-status notifications** — send the customer order updates, choosing free-form vs approved
  template automatically based on the session window. (Payment *state* in M3 is still the M2 manual
  PAID/UNPAID flag — M3 just notifies; it does not collect.)

**Opt-in / consent surface (subject to the §7 ruling):**
- A place to record and respect WhatsApp messaging **opt-in/consent** (ties to the existing M1
  `Consent` / `ConsentRevocation` ledger), so non-transactional/template messaging is sent only to
  consenting customers. The exact responsible-party model is a compliance dependency (§7).

### Explicitly out of scope (later milestones)

- **Payments capture / collection over WhatsApp → M4** (TradeSafe escrow, payment links, settlement). M3
  *notifies* about payment status; it never collects money. The order is left payable on the existing M2
  payment-state + nullable `paymentRef`/`escrowRef` seams.
- **AI / generative auto-replies, intent detection, conversational assistant → M5** (`lib/ai.js`). M3
  auto-replies are rule-based only and must not consume the AI gateway.
- **Lending / credit → deferred** (ADR-006 boundary holds; WhatsApp message data is internal, not a
  credit-decision surface).
- **Fulfilment / delivery lifecycle** — still deferred; M3 reuses the nullable M2 `fulfilmentStatus` seam,
  builds none of the lifecycle.
- **Marketing/broadcast campaigns** (bulk template blasts beyond per-order transactional notifications) —
  not promised in M3; flag as a candidate for a later milestone given its heavier consent/cost profile.
- **WhatsApp Catalog/Shop product-sync to Meta's native catalog** (Meta-hosted catalog objects) — M3 shares
  from the *Inyuku* catalog; deep native-catalog sync is out unless architect deems it cheaper.

---

## 6. User stories & acceptance criteria

### Merchant-side (commerce-over-chat)

**M3-S1 — Receive customer messages.**
*As Nomsa, I want incoming WhatsApp messages from my customers to appear in Inyuku, so that I can see and
answer them where my shop data is.*
- AC1: Given a customer sends a WhatsApp message to the merchant's connected number, when 360dialog delivers
  the inbound webhook, then a `Message` is persisted under a `Conversation` for that customer's number,
  scoped to the correct `businessId`, and is visible to the merchant.
- AC2: Given an inbound message arrives for a phone number not yet in the directory, then the conversation
  is still captured (customer linkage may be deferred until order capture); no message is dropped.
- AC3: Given the same webhook is delivered twice (360dialog retry), then the message is stored exactly once
  (idempotent on the provider message id).

**M3-S2 — Share my catalog.**
*As Nomsa, I want to send a customer my products over WhatsApp, so that they can choose without me typing
each item.*
- AC1: Given an open conversation, when the merchant chooses "share catalog," then the customer receives the
  merchant's M2 catalog (or a subset) as a WhatsApp message.
- AC2: Catalog content reflects the live M2 catalog (price in ZAR; archived/out-of-stock items handled per
  architect contract).

**M3-S3 — Capture an order from a chat.**
*As Nomsa (or Sipho), I want to turn a WhatsApp conversation into a recorded order, so that stock, the
customer book, and my dashboard update without re-typing.*
- AC1: Given a conversation, when the merchant captures an order, then an M2 `Order` is created with
  `channel = WHATSAPP`, line items snapshotting name/price (M2 convention), and totals in ZAR cents.
- AC2: Order capture links to an existing M2 `Customer` (matched on phone) or creates one (subject to the §7
  consent ruling — `Customer.consentId` stays nullable until ruled).
- AC3: Capturing the order writes `StockMovement` decrements via the existing M2 ledger; negative stock is
  allowed-and-flagged per M2.
- AC4: Sipho (`MERCHANT_STAFF`) can capture an order but cannot see cost price, margin, or financial totals
  (M2 RBAC cost-split inherited).

**M3-S4 — Send order / payment-status updates within the rules.**
*As Nomsa, I want to send a customer their order or payment status on WhatsApp, so that they stay informed
and I look professional — without hitting WhatsApp's messaging restrictions.*
- AC1: Given the conversation's 24-hour customer-care window is open, when the merchant sends a status
  update, then it is sent as a free-form message.
- AC2: Given the window is closed, when the merchant sends a status update, then the system sends an
  **approved template** (and only an approved template); a free-form send is prevented with a clear,
  non-technical explanation and the template offered instead.
- AC3: Given the customer has not opted in for non-transactional messaging (per §7 ruling), then
  marketing/optional templates are not sent (transactional/order templates handled per the compliance
  ruling).

### System-side (channel plumbing)

**M3-S5 — Ingest inbound webhooks reliably and securely.**
*As the platform, I must ingest 360dialog webhooks reliably so that no customer message is lost and no
forged/replayed request is trusted.*
- AC1: Every webhook is **signature-verified**; requests failing verification are rejected and logged
  (PII-masked).
- AC2: **Replay** of a previously processed webhook is detected and does not re-trigger side effects
  (idempotency on provider message/event id).
- AC3: Webhook processing is durable — transient downstream failures retry without dropping the event
  (queue/outbox per architect contract); the endpoint acknowledges fast enough to satisfy 360dialog's
  delivery expectations.
- AC4: All message content is PII-masked in logs (POPIA); raw message bodies are never written to
  application logs.

**M3-S6 — Track the 24-hour session window.**
*As the platform, I must track each conversation's customer-care window so that outbound sends choose the
correct mode automatically.*
- AC1: Each inbound customer message (re)opens/extends the 24-hour free-form window for that conversation;
  the system can report, per conversation, whether the window is open and until when.
- AC2: Outbound send selection (free-form vs template) is driven by window state, not by the caller guessing.

**M3-S7 — Constrain sends to approved templates outside the window.**
*As the platform, I must only allow approved templates outside the session window so that sends do not fail
or violate WhatsApp policy.*
- AC1: The approved-template registry is the single source of which templates may be sent and their
  parameters; sending an unregistered/unapproved template is impossible through the product.
- AC2: A free-form send attempted outside the window is blocked at the system boundary, not just the UI.

---

## 7. Dependencies & open decisions (flag — do NOT answer here)

These are routed to founder / **bukani-compliance** / **bukani-security** and **gate contract-freeze and/or
GA**. They mirror how the M2 PostHog sub-processor and Customer-directory consent questions were handled
(POPIA §7a, EA-ADR-015).

1. **Meta / 360dialog number verification (live-number gate).** M3 builds **sandbox-first**; the live
   WhatsApp number cutover is a **separate gated step**, not a build blocker. Founder/ops to land
   verification; architect to design a clean sandbox→live cutover seam.
2. **360dialog as a NEW sub-processor (EA-ADR-015 extension).** 360dialog receives WhatsApp message
   content/metadata → **EU pin (to confirm) + signed binding operator DPA + bukani-compliance risk
   assessment required before production messages flow.** Mirror the PostHog handling: **ships against the
   sandbox; live messaging stays dark until cleared.** (POPIA §3 row for 360dialog currently "to confirm".)
3. **WhatsApp opt-in / consent basis under POPIA (responsible-party ruling).** Who is the responsible party
   for the WhatsApp customer's PII — the **merchant** (Inyuku = operator) or **Inyuku**? Direct analogue to
   the M2 Customer-directory consent question. **GA-gates** non-transactional/template messaging. Need a
   ruling on: transactional vs marketing template consent, opt-in capture/proof, and opt-out handling
   (ties to M1 `Consent`/`ConsentRevocation`).
4. **Message-content PII retention.** How long are WhatsApp `Message` bodies retained, and disposal policy
   (POPIA §6 retention matrix is still TBD). Compliance to set before production.
5. **Webhook security model (STRIDE entry).** Signature verification scheme, replay-window, secret storage
   (encrypted `Setting` / Railway secret), and abuse handling need a **bukani-security STRIDE entry** in
   `docs/THREAT-MODEL.md` before contract-freeze.
6. **Template/conversation cost model.** WhatsApp bills per conversation/template category. Need a founder
   decision on cost ceilings / which templates are worth registering, analogous to the AI cost ceiling
   (EA-ADR-011). Affects whether broadcast/marketing is ever in scope.
7. **Customer-facing data-subject notices for WhatsApp.** PAIA/POPIA notice wording for customers messaging
   the business (depends on the §7.3 responsible-party ruling).

---

## 8. Recommended decomposition into buildable sub-milestones

The key output for founder approval. The slicing isolates the **risky external dependency (the BSP channel)**
into a layer that is fully buildable and testable against the **360dialog sandbox + mocked webhooks** with
**no commerce logic**, so KIMI can make real progress while Meta verification, the DPA, and the consent
ruling are still pending.

| Slice | One-line deliverable | Buildable now (sandbox)? | Gated by |
|---|---|---|---|
| **M3-A — BSP plumbing** | Inbound webhook ingest (signature-verified, replay-safe, idempotent) + `Conversation`/`Message` persistence + outbound send + 24h session-window tracking + approved-template registry — **no commerce logic**. | **Yes** — sandbox + mocked webhooks; needs no DPA/consent ruling because no production PII flows. | STRIDE entry (security) for design; live PII send gated on 360dialog DPA + verification. |
| **M3-B — commerce-over-chat** | Catalog share + order capture (→ M2 `Order`, `channel = WHATSAPP`, stock decrement, customer link) + rule-based auto-replies + order/payment-status notifications (free-form vs template by window). | **Yes** — builds on M3-A against sandbox; uses M2 commerce core which is merged. | Customer-link consent ruling (§7.3) GA-gates customer creation; live messaging gated as M3-A. |
| **M3-C — opt-in / consent + notification preferences** | WhatsApp messaging opt-in/opt-out capture wired to M1 `Consent`/`ConsentRevocation`, and per-customer/per-merchant notification preferences governing which templates may be sent. | Partially — model/plumbing buildable; the *rules* it enforces depend on the §7.3 compliance ruling. | **bukani-compliance responsible-party ruling** (hard); EA-ADR-015 360dialog DPA. |

**Sequencing:** M3-A → M3-B → M3-C. M3-C's enforcement rules can be stubbed (consent default-deny for
non-transactional) until the ruling lands, so it does not block M3-A/M3-B build.

### Recommended first slice for KIMI: **M3-A (BSP plumbing).**

Reasons:
1. **It is the highest-risk, most-external piece** (webhook security, signature/replay, session-window
   state machine, provider integration). De-risk it first; everything else sits on it.
2. **It is fully buildable today, sandbox-first, with zero production-PII exposure** — so it is *not* blocked
   by the open compliance gates (DPA, consent ruling) or by Meta verification. KIMI can deliver real,
   testable code against the 360dialog sandbox + mocked webhooks while those gates resolve in parallel.
3. **It has no dependency on a contested data model.** M3-B's order-capture and customer-linkage touch the
   consent-ruled `Customer` surface; M3-A does not. Building A first means KIMI is never blocked waiting on
   a compliance answer.
4. **It produces the seams M3-B needs** (Conversation/Message, send API, window state, template registry),
   so M3-B becomes mostly commerce wiring on a proven channel.

bukani-architect should freeze the **M3-A contracts first** (webhook envelope, signature/replay scheme,
`Conversation`/`Message` schema, send API, session-window model, template registry) once the **STRIDE entry
(§7.5)** is in, and freeze M3-B/M3-C contracts after the consent ruling direction is at least indicated.

---

## 9. Non-negotiable conventions carried forward (for architect / KIMI)

- **ZAR integer cents** for all money on WhatsApp orders/notifications. No floats, ever.
- **Multi-tenancy:** `businessId` FK on **every** new table (`Conversation`, `Message`, any
  template/opt-in records). No cross-tenant leakage of conversations.
- **`clientId` idempotency** where an entity may be created from an offline-capable merchant surface
  (order capture reuses the M2 `Order.clientId` convention); webhook ingest is idempotent on the
  **provider message/event id**, not a client id.
- **PII masked in logs (POPIA).** WhatsApp message bodies and customer phone numbers are PII — never logged
  raw; chassis `logger` + `pii-mask` applies. Raw content stays in the datastore (and 360dialog), not logs.
- **One order model.** WhatsApp orders are M2 `Order` rows with `channel = WHATSAPP`; they inherit the M2
  stock-as-movements ledger, RBAC cost-split, and nullable `fulfilmentStatus`/`paymentRef`/`escrowRef`
  seams. No parallel order type.
- **Offline posture.** Inbound webhooks are **server-side and online** — capture never depends on the
  merchant device being online. The merchant's **conversation view degrades gracefully offline** (cached
  read; outbound sends queued and clearly marked pending; live two-way chat is online-only). Order capture
  from a chat should reuse the M2 offline-sync path where the merchant is offline.
- **No direct Anthropic SDK / no AI in M3.** Auto-replies are **rule-based and deterministic**. They must
  **not** call `lib/ai.js`, must not be generative, and must not pre-empt the M5 AI Business Agent autonomy
  boundary (EA-ADR-009/011/012). M3 leaves the conversational surface clean for the M5 agent to consume.
- **Sub-processor discipline (EA-ADR-015).** 360dialog is a new sub-processor; production message flow is
  gated on its DPA + EU pin + risk assessment, exactly as PostHog was in M2.

---

## 10. Out-of-the-brief (explicitly not promised in M3)

Payment collection over WhatsApp, AI/generative replies, marketing/broadcast campaigns, native
Meta-Catalog/Shop sync, fulfilment/delivery lifecycle, group chats, and any lending/credit surface. M3
builds the channel and rule-based commerce-over-chat; it leaves seams (the existing M2 nullable fields, a
clean conversational surface for M5) but builds none of the above.
