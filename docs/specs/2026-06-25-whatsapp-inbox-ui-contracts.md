# WhatsApp Chat Inbox UI — Frontend Contracts (FROZEN-FOR-BUILD)

> **Author:** bukani-architect (Solution Architect, Inyuku) · **Date:** 2026-06-25 · **Status:** ready-for-build
> **Product brief:** `docs/specs/2026-06-25-whatsapp-inbox-ui-product-brief.md` (stories S1–S7)
> **Backend:** M3-B, **already built + bukani-qa APPROVED** (`feat/m3b-backend`). **No new backend routes,
> no schema, no contract changes.** This is a pure Next.js (App Router) merchant-UI design over the frozen
> M3-A/M3-B read/send surface + the M2 order/sync paths.
> **Binding:** EA-ADR-014/015/016; ADR-INY-021..024; this doc adds **ADR-INY-025..028** (§8).
>
> **Scope discipline:** the UI **invents no business rules**. Window state, send-mode (free-form vs template),
> consent, RBAC cost-split, and offline convergence are **all server-decided** and merely *displayed/forwarded*
> by the client. Mobile-first, Tailwind-only, no new UI libraries, **no websockets** (polling for MVP).

---

## 0. Verified facts from the built backend (load-bearing — the design is built on these, not assumptions)

Confirmed by reading `server/src/routes/v1/whatsapp.routes.ts`, `commerce.routes.ts`,
`services/sync.service.ts` on `feat/m3b-backend`:

1. **`GET …/whatsapp/conversations` returns RAW `Conversation` rows** — `{ conversations: Conversation[],
   pagination }`. There is **NO** `unread` field, **NO** `lastMessagePreview`, and **NO** `windowState` on the
   list payload. Each row carries `id, businessId, channelId, customerId, waContactId, lastInboundAt,
   lastOutboundAt, status, createdAt/updatedAt`. Ordering is `lastInboundAt: 'desc'`.
   → **Consequence:** "needs-reply" and "unread count" are **derived client-side** from
   `lastInboundAt` vs `lastOutboundAt` (ADR-INY-025). There is no server preview text, so the list row shows
   **no message body** (also the cleanest PII posture for the list).
2. **`GET …/conversations/:id` is the ONLY route returning window state** — `{ conversation: { …row,
   windowState: 'OPEN'|'CLOSED', windowExpiresAt: string|null } }`. The thread view must fetch this single read
   to render the window banner (S2/AC3). `windowState` is **computed server-side** from `lastInboundAt`.
3. **`GET …/conversations/:id/messages` returns RAW `Message` rows** ordered `occurredAt: 'desc'`, paginated
   `{ messages, pagination }`. Each row: `id, direction, type, body (PII), sendClass, templateName, status,
   failureReason, occurredAt, …`. **DESC order — the UI reverses for chronological render.**
4. **Send (`POST …/messages`) and share (`POST …/share-catalog`) return the SAME envelope:**
   `{ message: Message }` on success, or `{ message: Message, error: "send_failed"|... }` when persisted-but-
   failed (HTTP 200), or a **standard error envelope** with codes `409 whatsapp_window_closed`,
   `422 whatsapp_template_invalid`, `422 whatsapp_channel_disabled`, `403 whatsapp_consent_denied`. The UI
   maps these codes to plain-language copy (§6).
5. **Order capture has NO dedicated route.** It rides `POST …/orders` (online) **and** the offline
   `clientId`/`POST …/sync` path. The **sync-op `order/create` payload already supports `channel` +
   `conversationId`** (`sync.service.ts` lines 147-148 → `createOrder`). **BUT** the current client
   `useOrderStore.create()` (`src/lib/orders/store.ts`) **drops `channel`/`conversationId` from the outbox
   op payload** — it only forwards `customerId, status, paymentState, lines`. → **A store change is required
   (TASK-7)** so WHATSAPP captures actually carry the linkage offline. This is the single most important
   correctness item in this milestone.
6. **`PATCH …/orders/:id/payment`** is the existing M2 route, already wrapped by
   `useOrderStore.setPayment(clientId, businessId, paymentState)` — reuse verbatim (S6).
7. **Auto-reply rules:** `GET` returns `{ rules: WhatsAppAutoReplyRule[] }` (`whatsapp:read` — staff can
   read). `POST/PATCH/DELETE` require `whatsapp:manage_autoreply` (**owner-only**). Create body requires
   `channelId?` (nullable), `trigger`, `action`, conditional `keyword`/`hoursStart`/`hoursEnd`/`replyText`,
   `daysActive: number[1..7]`, `cooldownMinutes`. `OUT_OF_HOURS` hours are **SAST `HH:mm`**.

---

## 1. Route map

All under `src/app/(merchant)/whatsapp/` (inherits `MerchantShell` — offline banner, `SessionProvider`,
`max-w-3xl`, emerald accent).

| Route | File | Story | Permission to view |
|---|---|---|---|
| `/whatsapp` | `whatsapp/page.tsx` | S1 inbox list | `whatsapp:read` |
| `/whatsapp/[conversationId]` | `whatsapp/[conversationId]/page.tsx` | S2–S6 thread + reply + share + capture + payment | `whatsapp:read` (+ `whatsapp:send` to compose, `order:write` to capture/pay) |
| `/whatsapp/auto-replies` | `whatsapp/auto-replies/page.tsx` | S7 rule management | `whatsapp:read` to view; **`whatsapp:manage_autoreply` (owner-only) to edit** |

No nested layout file is added — the `(merchant)/layout.tsx` shell already wraps all three.

---

## 2. Component manifest

### 2.1 `/whatsapp` — Inbox list (S1)

**`whatsapp/page.tsx`** (`'use client'`) — page component.
- On mount: `useConversationStore().load()` → `listConversations(businessId, { page:1, limit:50 })`.
- Polls every **30 s** while the tab is visible (ADR-INY-026); pauses on `document.hidden`; manual
  pull-to-refresh button always available (works offline-degraded: shows cached + stale marker).
- Renders `<ConversationList>`; empty state per S1/AC3.
- RBAC: requires `whatsapp:read`; renders no cost/financial value anywhere (none exist on the payload).

| Child component | Props | API call |
|---|---|---|
| `ConversationList` | `{ conversations, stale: boolean, onRefresh }` | none (presentational) |
| `ConversationRow` | `{ conversation }` | none — derives `needsReply` + relative SAST time client-side |
| `InboxEmptyState` | — | none |

- **`ConversationRow`** shows: customer label (`conversation.customerName ?? maskMsisdn(waContactId)`),
  the SAST timestamp of `max(lastInboundAt, lastOutboundAt)`, a **needs-reply** dot/bold when
  `needsReply(conversation)` (ADR-INY-025), and a chevron. **No message-body preview** (none on payload; PII).
- Links to `/whatsapp/[id]`.

### 2.2 `/whatsapp/[conversationId]` — Thread view (S2–S6)

**`whatsapp/[conversationId]/page.tsx`** (`'use client'`) — orchestrator.
- On mount + on a **15 s visible poll** (tighter than the list — an open thread is the active surface):
  - `getConversation(businessId, id)` → header + `windowState`/`windowExpiresAt`.
  - `listMessages(businessId, id, { page:1, limit:50 })` → thread (reverse to chronological).
- Holds local optimistic-message state for in-flight sends (§4.4).

| Child component | Props | API call |
|---|---|---|
| `ThreadHeader` | `{ conversation }` | none |
| `WindowBanner` | `{ windowState, windowExpiresAt }` | none — copy per §6.1 |
| `MessageList` | `{ messages, optimistic }` | none |
| `MessageBubble` | `{ message }` | none — direction styling + `statusLabel()` (§6) |
| `Composer` | `{ conversationId, windowOpen, canSend, onSent }` | `POST …/messages` via `sendMessage()` |
| `ShareCatalogButton` | `{ conversationId, windowOpen, canSend, onSent }` | `POST …/share-catalog` via `shareCatalog()` |
| `CaptureOrderPanel` | `{ conversation, onCaptured }` | reuses `<OrderForm>` (§6.2) → `useOrderStore.create({channel:'WHATSAPP', conversationId})` |
| `CapturedOrdersStrip` | `{ conversationId }` | `useOrderStore` selector (local) — filters orders by `conversationId` |
| `PaymentToggle` | `{ order, canWrite }` | `useOrderStore.setPayment()` (PATCH …/orders/:id/payment) + optional notify send |

- `Composer` is **disabled when `windowState === 'CLOSED'`** with the §6.1 closed-window explanation (S3/AC2).
- `ShareCatalogButton` follows the identical window/offline behaviour (S4/AC3-4).
- `CaptureOrderPanel` reuses the existing `OrderForm` item-picker, **pre-seeded** with `channel='WHATSAPP'`
  and `conversationId` and the conversation's `customerId` (ADR-INY-027). Sell-price-only is inherited from
  the existing picker (it never reads `costPriceCents`).
- `canSend = hasPerm('whatsapp:send')`; `canWrite = hasPerm('order:write')`.

### 2.3 `/whatsapp/auto-replies` — Rule management (S7)

**`whatsapp/auto-replies/page.tsx`** (`'use client'`).
- On mount: `listAutoReplyRules(businessId)` → `{ rules }`.
- `const canManage = hasPerm('whatsapp:manage_autoreply')` — gates all create/edit/delete/toggle UI
  (owner-only). Staff see a **read-only** list (S7/AC5).

| Child component | Props | API call |
|---|---|---|
| `AutoReplyRuleList` | `{ rules, canManage, onEdit, onDelete, onToggle }` | none |
| `AutoReplyRuleRow` | `{ rule, canManage, … }` | toggle → `patchAutoReplyRule(id,{enabled})` |
| `AutoReplyRuleForm` | `{ rule?, channelId, onDone }` (canManage only) | create → `createAutoReplyRule`; edit → `patchAutoReplyRule` |
| `NonAiNotice` | — | none — fixed copy per §6.4 (S7/AC6) |
| `DeleteRuleDialog` | `{ rule, onConfirm }` | `deleteAutoReplyRule(id)` |

- Form fields by trigger: `GREETING` → action+reply; `KEYWORD` → `keyword`+action+reply;
  `OUT_OF_HOURS` → `hoursStart`/`hoursEnd` (SAST, `HH:mm`) + `daysActive` + action+reply. Mirrors the server
  zod refinements so the client blocks invalid combos before submit.

---

## 3. API client extensions

New file **`src/lib/whatsapp/api.ts`** — thin functions over `authFetch` (transparent 401-refresh), exactly
matching the existing `src/lib/orders/store.ts` call style (`authFetch<...>(path, {...})`). **No raw `fetch`,
no direct `apiFetch`.** All money stays in **integer cents** on the wire.

```ts
// src/lib/whatsapp/api.ts  (signatures — bukani-frontend implements)
import { authFetch } from '@/lib/session/authFetch';

export interface Conversation {
  id: string; businessId: string; channelId: string;
  customerId: string | null; waContactId: string;
  lastInboundAt: string | null; lastOutboundAt: string | null;
  status: 'OPEN' | 'ARCHIVED'; createdAt: string; updatedAt: string;
}
export interface ConversationWithWindow extends Conversation {
  windowState: 'OPEN' | 'CLOSED'; windowExpiresAt: string | null;
}
export interface Message {
  id: string; conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND'; type: string; body: string | null;
  sendClass: 'TRANSACTIONAL' | 'MARKETING' | null; templateName: string | null;
  status: 'RECEIVED'|'QUEUED'|'SENT'|'DELIVERED'|'READ'|'FAILED';
  failureReason: string | null; occurredAt: string;
}
export interface AutoReplyRule {
  id: string; channelId: string | null;
  trigger: 'GREETING'|'KEYWORD'|'OUT_OF_HOURS';
  action: 'SEND_TEXT'|'SHARE_CATALOG';
  enabled: boolean; keyword: string | null; replyText: string | null;
  hoursStart: string | null; hoursEnd: string | null;
  daysActive: number[]; cooldownMinutes: number;
}
interface Paginated { page: number; limit: number; total: number; }

// reads (whatsapp:read)
listConversations(b: string, q?: {page?:number;limit?:number}):
  Promise<{ conversations: Conversation[]; pagination: Paginated }>;
getConversation(b: string, id: string): Promise<{ conversation: ConversationWithWindow }>;
listMessages(b: string, id: string, q?: {page?:number;limit?:number}):
  Promise<{ messages: Message[]; pagination: Paginated }>;

// sends (whatsapp:send) — server picks free-form vs template; sendClass REQUIRED
sendMessage(b: string, id: string, input:
  { type:'TEXT'; sendClass:'TRANSACTIONAL'|'MARKETING'; body: string }):
  Promise<{ message: Message; error?: string }>;
shareCatalog(b: string, id: string, input:
  { productIds?: string[]; sendClass:'TRANSACTIONAL'|'MARKETING' }):
  Promise<{ message: Message; error?: string }>;

// auto-reply CRUD (read=whatsapp:read; mutate=whatsapp:manage_autoreply, owner-only)
listAutoReplyRules(b: string): Promise<{ rules: AutoReplyRule[] }>;
createAutoReplyRule(b: string, body: CreateRuleInput): Promise<{ rule: AutoReplyRule }>;
patchAutoReplyRule(b: string, id: string, body: PatchRuleInput): Promise<{ rule: AutoReplyRule }>;
deleteAutoReplyRule(b: string, id: string): Promise<{ deleted: true }>;
```

**Order capture + payment are NOT new client functions** — they reuse `useOrderStore.create(...)` and
`useOrderStore.setPayment(...)` (after the TASK-7 store fix). This keeps **one order-capture mental model**
and inherits offline convergence (ADR-INY-024).

**PII discipline (S2/AC5):** `body` and `waContactId` are returned by these reads but **must never** be passed
to `console.*`, Sentry breadcrumbs, or PostHog. Masking helper `maskMsisdn()` is used for any non-thread
display (list rows, audit-adjacent UI). The raw `body` renders **only inside `MessageBubble`**.

---

## 4. State & data-flow contracts

### 4.1 Conversation list refresh (S1, ADR-INY-026)
- A small **`src/lib/whatsapp/store.ts`** Zustand store (mirrors `orders/store.ts`) holds
  `{ conversations, stale, lastFetchedAt, load(), refresh() }`. `load()`/`refresh()` call `listConversations`.
- **Poll: 30 s, visibility-gated** (`document.visibilitychange` pauses when hidden; a single `setInterval`
  cleared on unmount). **No websockets.** Manual refresh button always present.
- **Offline (S1/AC4):** on a network error, keep the last good `conversations` in memory, set `stale=true`,
  and let the existing `MerchantShell` offline banner show. Never blank the list, never throw to an error
  boundary. (Conversations are server-state, not offline-first; the cache here is in-memory last-good, not
  IndexedDB — sends/captures are what need durable offline, and those ride the existing order/outbox path.)

### 4.2 Unread / needs-reply derivation (S1/AC2, ADR-INY-025)
- **No server unread field exists.** Derive per conversation:
  `needsReply(c) = c.lastInboundAt != null && (c.lastOutboundAt == null || c.lastInboundAt > c.lastOutboundAt)`.
- **Nav + inbox-entry total** = `conversations.filter(needsReply).length` over the loaded page
  (page size 50 covers the realistic spaza inbox; documented limitation, not a server count). The badge shows
  this number; `0` hides the badge.
- This is a **needs-my-reply** indicator, not a per-message read receipt — framed accordingly in copy
  ("waiting for reply"), which matches Nomsa's mental model better than an unread count anyway.

### 4.3 24h window state (S2/AC3)
- Source: `getConversation()` → `windowState` (`OPEN`/`CLOSED`) + `windowExpiresAt` (ISO, SAST-rendered).
- Surfaced by `<WindowBanner>` (copy §6.1) and used to enable/disable `Composer` + `ShareCatalogButton`.
- The client **never computes** the window itself — it only renders the server's verdict and re-fetches on
  the 15 s thread poll so the banner stays current.

### 4.4 Sending (S3/S4) — optimistic + server-authoritative
- On send: push an **optimistic bubble** (`status:'QUEUED'`, local temp id) into thread state, then call
  `sendMessage`/`shareCatalog`.
  - **200 success** → replace optimistic bubble with the returned `Message`; next poll reconciles
    `SENT→DELIVERED→READ`.
  - **200 with `error` field** (persisted `FAILED`) → mark the bubble `FAILED` with a retry affordance.
  - **409/422/403 error envelope** → **remove** the optimistic bubble and show the §6.1/§6.3 plain-language
    explanation inline (no raw platform error reaches Nomsa — S3/AC2).
- **Offline send (S3/AC3):** when `!useOnline()`, the composer **does not POST**; the message is held as a
  pending optimistic bubble and the user is told it will send on reconnect. **MVP simplification (ADR-INY-026
  note):** message sends are **not** enqueued to the durable IndexedDB outbox (that outbox is order/product/
  customer/stock only — see `EntityName`). Instead the composer disables the live POST while offline and shows
  a clear "will send when you're back online" state; on reconnect the user re-taps send. **Durable offline
  message queueing is explicitly deferred** (matches "poll at most" / no-new-mechanism scope). Order capture
  — the load-bearing offline case — **does** use the durable outbox (§4.5).

### 4.5 Order capture reuses the M2 flow (S5, ADR-INY-024/027)
- `CaptureOrderPanel` renders the **existing `<OrderForm>`** (item picker, qty, ZAR running total via
  `centsToZAR`) pre-seeded with `channel:'WHATSAPP'`, `conversationId`, and the conversation's `customerId`.
- Submit calls `useOrderStore.create({ … channel:'WHATSAPP', conversationId, customerId, … })`. After
  **TASK-7**, the store forwards `channel` + `conversationId` into the outbox op payload; the existing
  `clientId`/`POST …/sync` path (LWW-on-`occurredAt`) **converges exactly once** on reconnect (S5/AC4) — the
  customer is linked/created and stock decremented **server-side** (`createOrder`). The client only submits the
  M2 payload (S5/AC2).
- **Link-back (S5/AC3):** `<CapturedOrdersStrip>` selects `useOrderStore.items.filter(o => o.conversationId
  === id)` and renders "Order #N captured" linking to `/orders/[clientId]`. (Requires `OrderRow.conversationId`
  — added in TASK-7.) The same order appears in the normal M2 Orders list (one order model).

### 4.6 Payment toggle from chat (S6)
- `<PaymentToggle>` calls `useOrderStore.setPayment(clientId, businessId, 'PAID'|'UNPAID')` (existing
  M2 `PATCH …/orders/:id/payment`, requires `order:write`). On PAID it **offers** (checkbox/secondary button,
  not forced) a status-notification send via `sendMessage(... sendClass:'TRANSACTIONAL', body: <canned>)`
  (S6/AC2 — notify, never collect; no link generated). Offline behaviour inherits the M2 order-store path
  (S6/AC3).

---

## 5. Nav integration

Edit **`src/app/(merchant)/layout.tsx`**:

1. Insert the WhatsApp item into `navItems` **between Orders and Customers** (matches the brief's seam):
   ```
   Dashboard · Products · Orders · WhatsApp · Customers · Inventory · Onboarding
   ```
   `{ href: '/whatsapp', label: 'WhatsApp' }`.
2. **Unread badge on the nav item.** `MerchantShell` mounts a tiny `useWhatsAppUnread()` hook that reads the
   `whatsapp/store.ts` `conversations` and returns `filter(needsReply).length` (§4.2). The `<NavLink>` for
   `/whatsapp` renders the count as an emerald pill when `> 0` (reuse the emerald-100/800 token already in
   `NavLink`; no new color). The badge updates off the same 30 s list poll — **no extra request** is made
   for the badge.
3. **No new layout chrome** — offline banner, `SessionProvider`, `max-w-3xl` container all inherited.
4. **Visibility:** the nav item shows for any session with `whatsapp:read` (owner + staff). The store/poll
   only runs once the user has loaded the inbox at least once; the badge is `0`/hidden until then (acceptable
   — avoids a background poll for users who never open chat).

---

## 6. Key UI decisions (with rationale)

### 6.1 24h-window copy (plain-language, low-literacy — P0)
The comprehension risk is load-bearing (brief §Risks). Fixed strings, short, no jargon, no "24h"/"session"/
"template" words:
- **OPEN:** "You can reply now. Free replies until {HH:mm} today." (`windowExpiresAt` → SAST `HH:mm`.)
- **CLOSED (AS-BUILT — supersedes the original contract copy below; ratified 2026-06-25):** the composer is
  **disabled** on `CLOSED` and shows **"This chat is resting. Your customer needs to message you first before
  you can reply."** This was bukani-qa's MINOR-1 finding (QA APPROVED-WITH-NOTES, 2026-06-25) and is the
  **accepted MVP UX**: the simplest comprehension-safe model for Nomsa is "they message first" rather than
  surfacing an approved-template path that the M3-B slice does not yet expose to the merchant. The "Send
  catalog" / approved path is **not** offered from a CLOSED window in the MVP.
  - **Original contract copy (NOT shipped — kept for the record):** "This chat is resting. You can only send
    an approved update — type your message and we'll send the right kind." The build deviated because the
    composer is disabled (not a hard error, not an inline approved-send path) per MINOR-1.
- **On a blocked send (409/422/403):** never surface the raw code. Map:
  `whatsapp_window_closed` → the CLOSED copy; `whatsapp_consent_denied` → "We can't message this customer yet —
  they haven't agreed to messages."; `whatsapp_channel_disabled` → "WhatsApp sending isn't switched on for your
  shop yet." `whatsapp_template_invalid` → "That update isn't ready to send yet."
- **i18n:** strings centralised in one `whatsapp/copy.ts` map so isiZulu/isiXhosa can be added later
  (open-question #5 → founder/Nomsa-context call; English ships first, structure is i18n-ready).

### 6.2 Order capture UX — reuse `<OrderForm>`, do NOT build a chat-specific picker
**Decision: reuse** (ADR-INY-027). Rationale: one order-capture mental model (open question #3 → reuse
preferred), inherits the sell-price-only picker (RBAC cost-split for free), inherits validation + the M2
offline/sync convergence. `<OrderForm>` gains optional `channel`/`conversationId`/`defaultCustomerId` props
(additive, default `IN_PERSON` → existing screen unchanged). Capture renders it inside a collapsible panel in
the thread, not a separate route — Nomsa stays in the conversation (≤6 taps target).

### 6.3 PAID/UNPAID toggle in chat context
A two-state segmented control on each captured order in `<CapturedOrdersStrip>`, gated by `order:write`.
PAID surfaces an **optional** "Tell the customer it's paid" secondary action (S6/AC2) — unchecked by default;
no payment is collected, no link rendered. Disabled + tooltip if `!hasPerm('order:write')`.

### 6.4 Auto-reply rule form (owner-only gate + non-AI framing)
- Gate: `hasPerm('whatsapp:manage_autoreply')`. Staff get a **read-only** list (S7/AC5); server enforces
  regardless. Create/edit/delete/toggle controls are **absent** (not just disabled) for staff.
- **Non-AI framing (S7/AC6):** a fixed `<NonAiNotice>` at the top: "These are your own simple, set replies —
  not a robot or AI. They send the exact words you type, only when a message matches." Field labels say
  "Auto-reply" / "Set reply", never "bot"/"AI"/"smart".
- Trigger-conditional fields mirror the server zod refinements; SAST `HH:mm` inputs for `OUT_OF_HOURS`.

### 6.5 Offline behaviour
- **Reads** (list, thread): in-memory last-good + `stale` marker + inherited offline banner; never error
  (S1/AC4, S2/AC4).
- **Order capture:** durable IndexedDB outbox via the existing order store — converges exactly once (S5/AC4).
- **Message/share sends:** live-only with a clear "will send when online" disabled state (MVP — ADR-INY-026);
  durable send-queueing deferred.

---

## 7. Task manifest (ordered, for bukani-frontend)

Dependency graph:
`TASK-1 (api) → TASK-2 (copy) → TASK-7 (order-store fix) → {TASK-3 list, TASK-4 thread, TASK-5 capture/pay,
TASK-6 auto-replies} → TASK-8 nav → QA-1`. TASK-3/4/6 can parallelise once TASK-1/2/7 land.

| # | Owner | File(s) | Task | Test coverage required |
|---|---|---|---|---|
| **TASK-1** | bukani-frontend | `src/lib/whatsapp/api.ts` | Implement the §3 client functions over `authFetch`. Types per §3. No raw `fetch`. | Unit: each fn builds the right path/method/body; envelope-unwrap; 401→refresh→retry path; **no `body`/`waContactId` ever logged** (assert no console/Sentry calls). |
| **TASK-2** | bukani-frontend | `src/lib/whatsapp/copy.ts` | Centralised window/error/non-AI plain-language strings (§6.1/6.4); `statusLabel()`, `maskMsisdn()`, `needsReply()`, SAST `formatSast`/relative-time helpers. | Unit: `needsReply` truth table (inbound-only / outbound-after / never-inbound); error-code→copy map covers 409/422/403; `maskMsisdn` masks all but last 3 digits. |
| **TASK-7** | bukani-frontend | `src/lib/orders/store.ts`, `src/lib/offline/types.ts` | Add `conversationId?`/`channel` to the outbox op payload in `create()`; add `conversationId?` to `OrderRow` and serialize it from the server response. **(Pre-req for S5 linkage.)** | Unit: `create({channel:'WHATSAPP', conversationId})` enqueues an op payload **containing** `channel`+`conversationId`; `IN_PERSON` path unchanged (regression); `conversationId` round-trips on `OrderRow`. |
| **TASK-3** | bukani-frontend | `whatsapp/page.tsx`, `src/lib/whatsapp/store.ts`, `whatsapp/ConversationList.tsx`, `ConversationRow.tsx`, `InboxEmptyState.tsx` | Inbox list + store + 30 s visible-poll + manual refresh + derived needs-reply + empty/offline-stale states. | Unit/RTL: renders rows most-recent-first; needs-reply badge; empty state; stale marker on fetch error (no throw); poll pauses when `document.hidden`; **no message body rendered in a row**; staff (`whatsapp:read`) sees identical list, zero cost fields. |
| **TASK-4** | bukani-frontend | `whatsapp/[conversationId]/page.tsx`, `ThreadHeader.tsx`, `WindowBanner.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `Composer.tsx`, `ShareCatalogButton.tsx` | Thread read (15 s poll), chronological reverse, direction styling, status labels, window banner, composer + share with optimistic send + server-authoritative reconciliation + blocked-with-explanation. | RTL: inbound/outbound styling; status label mapping; **OPEN enables composer, CLOSED disables + shows closed copy**; 409/422/403 → plain copy, optimistic bubble removed; 200-with-error → FAILED+retry; offline → composer disabled "will send when online"; `body` rendered only in bubble. |
| **TASK-5** | bukani-frontend | `CaptureOrderPanel.tsx`, `CapturedOrdersStrip.tsx`, `PaymentToggle.tsx`, edit `orders/OrderForm.tsx` (additive props) | Capture panel reusing `<OrderForm>` pre-seeded `channel='WHATSAPP'`+`conversationId`+customer; captured-orders strip with link-back; PAID/UNPAID toggle + optional notify. | RTL: `OrderForm` additive props default to `IN_PERSON` (existing screen regression-safe); capture submits a WHATSAPP order with `conversationId`; strip filters by `conversationId`; **staff picker shows sell price only, no margin/total beyond subtotal**; payment toggle gated by `order:write`; notify is optional (off by default). |
| **TASK-6** | bukani-frontend | `whatsapp/auto-replies/page.tsx`, `AutoReplyRuleList.tsx`, `AutoReplyRuleRow.tsx`, `AutoReplyRuleForm.tsx`, `NonAiNotice.tsx`, `DeleteRuleDialog.tsx` | Rule list/toggle/create/edit/delete; owner-only gate via `hasPerm('whatsapp:manage_autoreply')`; trigger-conditional fields mirroring server zod; SAST hours; non-AI framing copy. | RTL: **staff sees read-only list, NO create/edit/delete/toggle controls present**; owner can CRUD + toggle; KEYWORD requires keyword, OUT_OF_HOURS requires hours, SEND_TEXT requires replyText (client blocks before submit); delete confirm; non-AI copy present. |
| **TASK-8** | bukani-frontend | `src/app/(merchant)/layout.tsx`, `src/lib/whatsapp/useUnread.ts` | Add WhatsApp nav item between Orders/Customers; unread pill from `needsReply` count off the existing list store (no extra request); hide pill at 0. | RTL: nav item present + in correct position; pill shows count when >0, hidden at 0; item visible for `whatsapp:read` sessions. |
| **DOCS-1** | bukani-docs | `CLAUDE.md`, `docs/API.md` (note), `docs/DECISIONS.md` (ADR-INY-025..028) | Record the UI surface, derived-unread/poll decisions, and the order-store `channel`/`conversationId` forwarding fix. | n/a |

**Cross-cutting test gates (QA-1, bukani-qa):** (a) **zero** cost/margin/financial value renders on a
`MERCHANT_STAFF` session anywhere in `/whatsapp/*` (anti-metric); (b) WHATSAPP captures **converge exactly
once** — no duplicate order on simulated reconnect (anti-metric); (c) no `Message.body`/`waContactId` reaches
logs/PostHog/Sentry (PII gate, S2/AC5); (d) no `costPriceCents` requested or rendered by share/capture
(S4/AC2, S5/AC5).

---

## 8. ADRs introduced

### ADR-INY-025 — Inbox unread / needs-reply is derived client-side from `lastInboundAt` vs `lastOutboundAt`
**Context:** the built `GET …/whatsapp/conversations` returns raw `Conversation` rows — **no `unread` field,
no read-receipt store**. The brief (open question #1) asked which it is.
**Decision:** the UI derives a **needs-reply** indicator: `needsReply = lastInboundAt != null && (lastOutboundAt
== null || lastInboundAt > lastOutboundAt)`. The nav/inbox total = count of needs-reply over the loaded page.
**Options considered:** (a) add a server `unread` field — rejected: violates "no new backend"; (b) per-message
read-receipt store — rejected: out of scope, no schema; (c) derive from last-inbound-vs-outbound — **chosen.**
**Consequences:** it is "waiting for my reply", not a true unread count (and the copy says so); the total is
over the loaded page (size 50), a documented limitation; zero backend cost. Matches Nomsa's mental model
better than an unread counter.

### ADR-INY-026 — Refresh is visibility-gated polling (30 s list / 15 s open thread); no websockets; message sends are live-only for MVP
**Context:** realtime is explicitly out (brief §Out-of-scope). Nomsa is on an entry Android with expensive,
intermittent data and a battery budget.
**Decision:** poll the **list every 30 s** and the **open thread every 15 s**, both **paused when the tab is
hidden**, plus a manual refresh. No websockets. **Message/share sends are live-only**: while offline the
composer disables the POST and shows "will send when online" — they are **not** enqueued to the durable
IndexedDB outbox (which stays order/product/customer/stock only).
**Options considered:** websockets (rejected — out of scope, server + battery cost); always-on tight poll
(rejected — data/battery); visibility-gated poll (**chosen**); durable offline send-queue (deferred — adds a
new mechanism the brief says to avoid; order capture, the load-bearing offline case, already converges via the
existing outbox).
**Consequences:** near-real-time enough for a counter workflow at minimal cost; offline reads stay readable;
the one offline write that matters (order capture) is durable and converges exactly once; offline *replies*
are a known, accepted MVP gap.

### ADR-INY-027 — Order capture from chat reuses `<OrderForm>` + `useOrderStore`, pre-seeded, not a new picker or path
**Context:** open questions #3/#4 — chat-specific picker vs reuse, and where capture writes.
**Decision:** reuse the existing `<OrderForm>` item-picker and `useOrderStore.create()`, pre-seeded with
`channel:'WHATSAPP'`, `conversationId`, and the conversation's `customerId`. `<OrderForm>` gains additive,
defaulted props so the existing Orders screen is unchanged. Capture rides the existing `clientId`/`POST …/sync`
path (ADR-INY-024) — **no new order model, no new sync op, no re-implemented offline logic.**
**Consequences:** one order-capture mental model; RBAC sell-price-only and offline convergence inherited free;
requires the TASK-7 store fix so `channel`/`conversationId` actually reach the outbox payload (the current
store drops them) — this is the correctness lynchpin for S5.

### ADR-INY-028 — Plain-language window/error copy is centralised + i18n-ready; raw platform codes never reach the merchant
**Context:** comprehension risk is the milestone's top business risk (brief §Risks) — a technical window error
makes Nomsa think the app is broken and revert to the WhatsApp app.
**Decision:** all window-state, blocked-send (`409/422/403`), and non-AI-framing strings live in one
`src/lib/whatsapp/copy.ts` map; the UI **always** maps server error codes to plain-language copy and **never**
renders a raw code/message. English ships first; the map is structured for isiZulu/isiXhosa (open question #5,
founder call).
**Consequences:** consistent low-literacy copy; a single place to localise; the anti-metric "merchants fighting
the window UI" is measurable against this copy.

---

## 9. Risk class & rollback

- **Risk class: LOW–MEDIUM.** Pure client over a QA-approved backend; no new routes/schema/secrets. PII
  (`body`, `waContactId`) is **displayed** (already authorised by `whatsapp:read`), so the only new exposure
  surface is client logging/analytics — covered by the PII test gate (§7 QA-1c) and the existing `pii-mask`
  posture. No threat-model change beyond the M3-B STRIDE §8 already accepted (residual R1 unchanged — no
  per-customer consent UI is added; sends stay under the server default-deny stub).
- **Channel-dark inheritance:** the whole surface is sandbox-only until the GA gates (E2/E3) clear — no UI
  change needed; `whatsapp_channel_disabled` is rendered as plain copy.
- **Rollback:** the feature is additive and route-isolated under `/whatsapp/*` + one `navItems` entry + one
  additive `OrderForm` prop set + the TASK-7 store forwarding. Rollback = revert the feature branch / remove
  the nav item; the M2 Orders/Customers screens are untouched (TASK-7 is additive and regression-tested).
  No migration, no data backfill, nothing to undo server-side.

---

## 10. Proposed CLAUDE.md updates (for bukani-docs / DOCS-1)

Add to §3 conventions and §8 docs index:
- New merchant surface `/whatsapp` (list), `/whatsapp/[conversationId]` (thread + reply + share + capture +
  pay), `/whatsapp/auto-replies` (owner-only rules). Pure client of frozen M3-A/M3-B routes.
- **Unread = derived** (`lastInboundAt > lastOutboundAt`), not a server field (ADR-INY-025).
- **Refresh = visibility-gated polling**, no websockets; **message sends are live-only**, order capture is the
  only durable-offline write (ADR-INY-026).
- **Order capture reuses `<OrderForm>` + `useOrderStore`** with `channel='WHATSAPP'` + `conversationId`
  forwarded through the outbox payload (ADR-INY-027; required `orders/store.ts` + `OrderRow` change).
- Plain-language window/error copy centralised, i18n-ready (ADR-INY-028).
- Index this file under `docs/specs/`.
