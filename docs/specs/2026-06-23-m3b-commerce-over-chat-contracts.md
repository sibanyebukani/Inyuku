# Inyuku Digital — M3-B (Commerce-over-Chat) Architect Contracts

> **Author:** bukani-architect · **Date:** 2026-06-23 · **Status:** **DRAFT — pending bukani-security STRIDE before FREEZE.**
> **Persisted by:** bukani-docs (post-STRIDE, post-freeze; the M2/M3-A pattern — architect freezes here, docs
> bundles one PR into `docs/API.md`, `docs/SCHEMA.md`, `docs/DECISIONS.md`, `docs/POPIA.md`,
> `docs/THREAT-MODEL.md`, `docs/ROADMAP.md`). These contracts implement the M3-B product brief
> `docs/specs/2026-06-23-m3b-commerce-over-chat-product-brief.md`. **When code/OpenAPI/Prisma disagree with
> this doc, code wins — file a docs fix.**
> **Stack (unchanged):** Fastify 5 (TypeScript) + Prisma 6 on Railway Postgres 16 (EU) + Redis 7 + R2.
> **Consumes the FROZEN seams:** M3-A (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`) and M2
> (`docs/specs/2026-06-21-m2-commerce-core-contracts.md`). Verified against the merged
> `server/prisma/schema.prisma`, `server/src/routes/v1/{whatsapp,commerce}.routes.ts`,
> `server/src/services/{order,whatsapp-send}.service.ts`, and `server/src/services/sync.service.ts`.
> **References:** EA-ADR-014/015/016, ADR-005/006/007, ADR-INY-011 (Setting AES-256-GCM),
> ADR-INY-013/014/015/016 (M2 commerce / stock-as-movements / clientId sync), ADR-INY-017..020 (M3-A).
> **New ADRs (this doc):** ADR-INY-021 / 022 / 023 / 024 (see §11; next free number confirmed — M3-A ended at 020).
> **Security gate:** `docs/THREAT-MODEL.md` (new M3-B entry) — **NOT YET RUN**; the surfaces to gate on are
> enumerated in §12. **Freeze is blocked on a bukani-security PASS** (the M2/M3-A gating pattern).

---

## 0. Scope boundary (what M3-B IS / is NOT)

**M3-B IS** (brief §5): the **merchant value layer** on the M3-A channel — the chat/inbox **read** surface;
**free-form / status reply** within the M3-A window rules; **catalog share** from the live M2 catalog;
**order capture from chat** producing a real **M2 `Order(channel = WHATSAPP)`** (customer link/create +
`StockMovement` SALE ledger decrement + dashboard reflection, **no re-typing**, converging exactly once
offline via the **existing** M2 `clientId` + `POST .../sync` path); **deterministic, non-AI auto-replies**
(greeting / exact-normalised keyword / out-of-hours, SAST boundary, loop-safe); **order/payment-status
notifications** (window-auto-selected free-form vs approved template); and the **enforced consent rules** the
M3-A stub defers to (branch on `sendClass`, read M1 `Consent`/`ConsentRevocation`, default-deny marketing,
`Customer.consentId` stays nullable).

**M3-B is NOT** (brief §6): payments capture/collection (M4 — M3-B *notifies*, never collects; payment state
stays the M2 manual `PAID`/`UNPAID` flag); any AI/generative/intent-detection reply or any `lib/ai.js` call
(M5 — auto-replies are rule-based only; `AI_AGENT` stays read-only, untouched); a fulfilment/delivery
lifecycle (reuses the nullable M2 `fulfilmentStatus`/`paymentRef`/`escrowRef` seams only — Thandi's
validation point); marketing/broadcast blasts; Meta native-catalog/Shop sync (shares from the *Inyuku* M2
catalog); lending/credit (ADR-006 boundary holds); **the BSP plumbing itself** (webhook ingest,
`Conversation`/`Message` persistence, outbound send, window tracking, template registry, the consent
*point*, the `WhatsAppChannel.enabled` dark-flag — all already M3-A, consumed here, not rebuilt); and
**re-litigating the §7 compliance rulings** (M3-B builds under the default-safe stubs; it does not invent the
ruling). **No parallel order model.** Live messaging stays **DARK** behind `WhatsAppChannel.enabled` until the
EA-ADR-015 360dialog DPA/EU-pin/risk-assessment gate clears — that cutover is **not** in M3-B's build DoD.

---

## 1. Schema conventions (carried — unchanged)

Every M3-B table/field follows the M1/M2/M3-A baseline: PascalCase model + snake_case `@@map`; snake_case
columns; **`cuid` PK**; **`businessId` FK on every domain table** (tenant root = `Business`, ADR-005),
non-null; `createdAt`/`updatedAt` (UTC); **money is `Int` ZAR cents, never `Float`/`Decimal`**; tenant
isolation enforced at the route/query layer against the **server-resolved** `businessId`; PII
(`Message.body`, `waContactId`, customer phone) **masked in logs** (chassis `logger` + `pii-mask`).
Idempotency conventions are **reused, not forked**: M2 client-`clientId` (`@@unique([businessId, clientId])`)
for offline-creatable merchant entities (ADR-INY-016); M3-A provider-id dedup for inbound (ADR-INY-018).
**M3-B introduces no new idempotency mechanism.**

---

## 2. Schema additions (Prisma)

M3-B is deliberately **thin on schema** — the value is wiring existing M2 + M3-A seams. Two additions:
(a) the **Conversation→Order linkage** field, and (b) the **auto-reply config** table. No new money columns
(orders/lines reuse M2 ZAR-cents fields).

### 2.1 `Order.conversationId` — the Conversation→Order linkage seam (ADR-INY-021)

Add **one nullable FK column to the existing `Order` model** (no new table, no order fork):

```prisma
model Order {
  // ... all existing M2 fields unchanged ...
  conversationId String?  @map("conversation_id")   // M3-B: nullable; set only for channel=WHATSAPP captures
  conversation   Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  // existing @@unique([businessId, clientId]), @@unique([businessId, orderNumber]), @@map("orders")
  @@index([conversationId])
}
```

And the inverse on the existing `Conversation` model:

```prisma
model Conversation {
  // ... all existing M3-A fields unchanged ...
  orders Order[]   // M3-B: a conversation may produce many captured orders over time
}
```

- **Nullable** — the vast majority of orders are non-WhatsApp (IN_PERSON / ONLINE); only a WhatsApp capture
  sets it. Keeps the one-order-model intact (brief §10).
- **`onDelete: SetNull`** — consistent with M2 (`Order.customerId`, `OrderLine.productId` are `SetNull`): if a
  conversation is ever hard-removed, the **order (record of trade) must survive** with the link cleared. The
  order is the durable financial record; the conversation is the (purgeable, retention-bound — M3-A §6) chat
  context. Never cascade-delete an order from a conversation deletion.
- **`businessId` scoping:** the capture path MUST verify `Conversation.businessId === Order.businessId ===`
  the route-resolved `businessId` before writing the link (cross-tenant link is the §12 isolation surface).
- **`@@index([conversationId])`** — supports "show this conversation's captured orders" (S3/AC4) and the
  inbox "Order #N captured" badge without a table scan.

> **Justification (ADR-INY-021, §11):** a nullable FK on `Order` beats (a) a nullable `orderId` on
> `Conversation` — which is 1:1 and cannot model repeat orders on one thread — and (b) a thin join table —
> which adds a table and a query hop for a strict ≤many cardinality a single FK expresses. The FK lives on the
> *child that may not exist for most rows* (the WhatsApp order), keeping the column null-sparse on the hot
> `Order` table and zero-cost for the M2 path.

### 2.2 `WhatsAppAutoReplyRule` — auto-reply config (ADR-INY-022)

A **new tenant table** (NOT a `Setting` blob — see ADR-INY-022 justification): per-tenant, queryable,
RBAC-/audit-able, multiple typed rules with a SAST hours window.

```prisma
model WhatsAppAutoReplyRule {
  id            String              @id @default(cuid()) @map("id")
  businessId    String              @map("business_id")
  channelId     String?             @map("channel_id")        // optional scope to one channel; null = all channels
  trigger       AutoReplyTrigger    @map("trigger")           // GREETING | KEYWORD | OUT_OF_HOURS
  enabled       Boolean             @default(false) @map("enabled")  // ships OFF (merchant opts in)
  // GREETING: re-fire only after `cooldownMinutes` of silence (AC1 "first inbound / after long silence")
  // KEYWORD:  exact normalised match against `keyword` (lower+trim+collapse-ws; NO fuzzy/NLP)
  keyword       String?             @map("keyword")
  // action: what to send when the rule fires
  action        AutoReplyAction     @map("action")            // SEND_TEXT | SHARE_CATALOG
  replyText     String?             @map("reply_text")        // canned body for SEND_TEXT / out-of-hours
  // OUT_OF_HOURS window, evaluated in SAST (Africa/Johannesburg); inclusive open, exclusive close
  hoursStart    String?             @map("hours_start")       // "08:00" — business-hours OPEN (24h HH:mm)
  hoursEnd      String?             @map("hours_end")         // "17:00" — business-hours CLOSE
  daysActive    Int[]               @map("days_active")       // ISO weekday ints 1=Mon..7=Sun; [] = every day
  cooldownMinutes Int               @default(720) @map("cooldown_minutes") // once-per-period throttle (default 12h)
  createdAt     DateTime            @default(now()) @map("created_at")
  updatedAt     DateTime            @updatedAt @map("updated_at")
  business      Business            @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId])
  @@index([businessId, trigger, enabled])
  @@map("whatsapp_auto_reply_rules")
}
```

- **`enabled` default `false`** — auto-reply is opt-in per rule (AC1/AC6); no surprise sends.
- **`channelId` nullable** — a rule may scope to one channel or apply to all the tenant's channels. (Soft FK
  by id; not a hard relation to keep the model thin — the service validates `channelId` belongs to the tenant.)
- **SAST boundary** — `hoursStart`/`hoursEnd`/`daysActive` are evaluated in `Africa/Johannesburg`, consistent
  with the M2 dashboard day boundary (brief §10, S5/AC3). No UTC drift.
- **Loop/cooldown state is NOT stored on the rule** — see §6.3 (loop prevention reads from the existing
  `Message` ledger; the rule carries only the `cooldownMinutes` policy, not per-conversation fire timestamps).

### 2.3 New enums

```prisma
enum AutoReplyTrigger { GREETING  KEYWORD  OUT_OF_HOURS  @@map("auto_reply_trigger") }
enum AutoReplyAction  { SEND_TEXT  SHARE_CATALOG          @@map("auto_reply_action") }
```

### 2.4 No other schema changes

- `Customer.consentId` **stays nullable** (M2; the directory-consent ruling is OPEN — brief §8.1). M3-B does
  not populate it from a ruling it does not have.
- `Order.channel = WHATSAPP` already exists (M2 enum); `createOrder()` already accepts `channel` — M3-B only
  ensures the **capture path passes it** (the M2 `POST /orders` route currently writes `IN_PERSON` only —
  see §10 "code-vs-brief").
- `OrderLine` price-snapshotting, `StockMovement` SALE ledger, `clientId` idempotency — all reused unchanged.

---

## 3. Audit `(entity, action)` tuples

M3-B reuses existing tuples; adds two for the new config table and the auto-reply emission.

| entity | action(s) | When |
|---|---|---|
| `order` | `CREATE` (existing M2) | WhatsApp order captured — masked metadata; carries `channel=WHATSAPP`, `conversationId` |
| `stock_movement` | `CREATE` (existing M2) | SALE decrement(s) on capture |
| `customer` | `CREATE` (existing M2) | Customer created from `waContactId` on capture (masked) |
| `whatsapp_message` | `SEND` (existing M3-A) | catalog-share / status-notify / auto-reply send (masked) |
| `whatsapp_autoreply_rule` | `CREATE`, `UPDATE`, `DELETE` (NEW) | owner config CRUD |
| `whatsapp_autoreply` | `FIRE`, `SUPPRESSED` (NEW) | an auto-reply fired (or was suppressed by window/consent/cooldown/loop-guard) — masked, auditable for §12 |

All carry **masked metadata only** (no raw `body`, no raw msisdn). `(whatsapp_autoreply, SUPPRESSED)` is the
audit hook the STRIDE pass uses to prove loop/consent suppression is observable.

---

## 4. API contract — what M3-B adds / changes

> Convention: all tenant routes under **`/v1/businesses/:businessId/*`**; `businessId` **server-resolved**
> and enforced (cross-tenant → 403/404); standard response envelope (`docs/API.md`); Zod-validated bodies;
> cost/financial fields **hidden not zeroed** for `MERCHANT_STAFF`.

### 4.0 Reused unchanged from M3-A (the inbox read + reply surface — S1, S2)

M3-B's **inbox/thread UI is a pure client** of these **already-shipped M3-A routes** — M3-B adds **no new
read routes** (the brief flagged this: "inbox list/read already M3-A"):

| Method | Path | Permission | M3-B use |
|---|---|---|---|
| GET | `/whatsapp/conversations` | `whatsapp:read` | S1/AC1 inbox list (most-recent first; masked-where-displayed) |
| GET | `/whatsapp/conversations/:id` | `whatsapp:read` | S1/AC2-3 thread header + `windowState`/`windowExpiresAt` |
| GET | `/whatsapp/conversations/:id/messages` | `whatsapp:read` | S1/AC2 paginated messages w/ direction + status |
| POST | `/whatsapp/conversations/:id/messages` | `whatsapp:send` | S2 free-form reply; S4 catalog share; S7 status notify — server picks free-form vs template by window; `sendClass` required; consent + `enabled` gates apply |

> **S1/S2 are UI work over frozen seams.** The send route already returns the M3-A
> `409 whatsapp_window_closed` / `422 whatsapp_template_invalid` / `422 whatsapp_channel_disabled` /
> `403 whatsapp_consent_denied` envelope — M3-B's UI **renders these in plain language** (S1/AC3, S2/AC2); it
> does not change the contract. Offline (S1/AC5, S2/AC4) is a **client-side** concern: cached reads,
> queued-pending sends — no server contract change.

### 4.1 Order capture from chat (S3) — rides the EXISTING M2 order-create + sync paths

**M3-B adds NO new capture endpoint and NO new sync op type.** A WhatsApp order is an ordinary M2 `Order`
create. Two equivalent paths, both already in code, extended by one optional field:

**(a) Online capture** — the existing `POST /v1/businesses/:businessId/orders` (`order:write`), with the
request body extended by two optional, M3-B-only fields:

```jsonc
{
  "clientId": "c_…",                 // M2 idempotency (REQUIRED, client-generated)
  "channel": "WHATSAPP",             // NEW (optional; default IN_PERSON) — capture sets WHATSAPP
  "conversationId": "conv_…",        // NEW (optional) — the linkage seam (§2.1); validated same-tenant
  "customerId": "cust_…",            // optional — omit to trigger link/create-from-conversation (see below)
  "status": "COMPLETED",             // COMPLETED triggers the SALE ledger decrement (M2 behaviour)
  "paymentState": "UNPAID",          // notify-never-collect: WhatsApp orders default UNPAID (cash later)
  "lines": [ { "productId": "prod_…", "qty": 2 } ]
}
```

- `channel` and `conversationId` are **additive optional** — the M2 IN_PERSON path is unchanged when omitted.
- **Customer link/create (S3/AC2):** if `customerId` is omitted **and** `conversationId` is supplied, the
  order service resolves/creates the M2 `Customer` from the conversation's `waContactId` (see §5.2), links it
  to the order **and** back-links `Conversation.customerId` if currently null. **`Customer.consentId` is left
  nullable** — creating a directory record for a *transactional* sale is NOT gated on a messaging-consent
  grant (S6/AC5). This is distinct from *messaging* the customer (§6).
- **Stock (S3/AC3):** `status:"COMPLETED"` runs the existing `appendSaleMovements` → `StockMovement`
  (`type=SALE`, signed `qtyDelta`, `orderId` set, deterministic `clientId = "<orderId>:sale:<productId>"`).
  **Negative stock is allowed-and-flagged** (M2 ADR-INY-015) — a sale is never rejected for low stock.
- **Audit (S3/AC8):** `(order, CREATE)` (+ `(customer, CREATE)` if created, + `(stock_movement, CREATE)` per
  line) — masked metadata.

**(b) Offline capture** — the existing `POST /v1/businesses/:businessId/sync` (`sync:write`). The WhatsApp
order rides the **existing `entity:"order"`, `op:"create"`** sync op — **no new entity, no new op** (verified:
the merged `SyncOpSchema` enum is `entity ∈ {product,stock_movement,order,customer}`, `op ∈ {create,update}`;
WhatsApp capture is just an `order`/`create`). The `payload` carries the same extended order body as (a),
including `channel:"WHATSAPP"` and `conversationId`:

```jsonc
{ "clientId":"c_…", "entity":"order", "op":"create", "occurredAt":"2026-06-23T10:00:00Z",
  "payload": { "channel":"WHATSAPP", "conversationId":"conv_…", "lines":[…], "paymentState":"UNPAID", "status":"COMPLETED" } }
```

- **Convergence (S3/AC6):** `@@unique([businessId, clientId])` on `Order` + the existing LWW-on-`occurredAt`
  sync resolution (ADR-INY-016) means a capture submitted online and then re-submitted on reconnect resolves
  to `status: DUPLICATE` — **exactly once, never duplicated.** Stock movements inherit idempotency via their
  deterministic per-order `clientId`. **No parallel offline mechanism** (brief §10).
- **One order model (S3/AC7):** the captured order appears in `GET /orders`, the dashboard, and inherits the
  nullable `fulfilmentStatus`/`paymentRef`/`escrowRef` seams (Thandi). Not a parallel type.

> **Decision (ADR-INY-024, §11):** order-capture-over-sync reuses the M2 `clientId`/`sync` path verbatim;
> M3-B's only additions to the order create surface are the two optional fields `channel` + `conversationId`.
> No `entity:"whatsapp_order"`, no `op:"capture"`.

### 4.2 Catalog share (S4)

A **server-rendered, plain ZAR-priced text list** sent via the **existing M3-A send route** — M3-B adds a
small server helper so the merchant taps once and the server composes the message from the **live M2 catalog**
(it does NOT make the client assemble prices, which would leak `costPriceCents` logic to the client and
duplicate RBAC). One thin new route to compose-and-send:

| Method | Path | Permission | Audit | Notes |
|---|---|---|---|---|
| POST | `/whatsapp/conversations/:id/share-catalog` | `whatsapp:send` | `(whatsapp_message, SEND)` | composes catalog text from M2 `Product` (sell price only), then calls the M3-A send |

**Request:**
```jsonc
{ "productIds": ["prod_…", "prod_…"],   // optional subset; omit = all ACTIVE in-stock products
  "sendClass": "TRANSACTIONAL" }         // sharing in reply to an enquiry inside the window is TRANSACTIONAL
```
**Behaviour / response:** identical send envelope to M3-A `POST .../messages` (returns the queued `Message`,
or `409`/`422`/`403`). Server composition rules (S4/AC2, ADR-INY-023):
- **Source = live M2 catalog**, filtered to `status = ACTIVE`. **Archived products are excluded.**
- **Out-of-stock** (computed `SUM(qtyDelta) <= 0`): **included but flagged** `"(out of stock)"` — Nomsa often
  sells on back-order/cash, and excluding silently hides items she may still take an order for; the merchant
  may pass an explicit `productIds` subset to curate. (Architect call — see ADR-INY-023.)
- **`costPriceCents` is NEVER included** — customer-facing; also satisfies the RBAC split (Sipho's share is
  the identical sell-only view; the route never reads cost).
- **ZAR cents → display:** the server formats cents to `R{rands}.{cc}` in the composed text (the wire/UI stays
  cents; only the human-facing WhatsApp string is formatted).
- **Send rules (S4/AC3):** obeys the M3-A window/template gates and the §6 consent branch via the same send
  service. Offline (S4/AC4): client queues like S2.

> **Why a thin server route, not a client-built message:** keeps cost/RBAC and price-formatting **server-side**
> (no client price logic, no `costPriceCents` near the client), and keeps the *single* outbound send path
> through the M3-A gates. (ADR-INY-023.)

### 4.3 Order / payment-status notifications (S7)

**No new send route** — status notifications are an ordinary M3-A send (`POST .../conversations/:id/messages`)
with `sendClass: "TRANSACTIONAL"`, where the **server auto-chooses free-form (window OPEN) vs an APPROVED
template (window CLOSED)** exactly as M3-A already does (S7/AC1, S7/AC3). The merchant picks the *update*, not
the *mode*. Payment-status notify (S7/AC2) is triggered **after** the merchant sets `PAID`/`UNPAID` via the
**existing** `PATCH /orders/:id/payment` — **M3-B reads the M2 payment state and notifies; it never collects,
generates no link, touches no escrow** (M4 boundary). Consent branch (S7/AC4) per §6. Offline (S7/AC5):
client queues like S2. **M3-B adds no schema and no route for S7** — it is UI + the existing send + the
existing payment route.

### 4.4 Auto-reply config CRUD (S5/AC6)

New owner-only tenant routes for `WhatsAppAutoReplyRule`:

| Method | Path | Permission | Audit |
|---|---|---|---|
| GET | `/whatsapp/auto-reply-rules` | `whatsapp:read` | — (Sipho can *see* rules fire, AC6) |
| POST | `/whatsapp/auto-reply-rules` | `whatsapp:manage_autoreply` | `(whatsapp_autoreply_rule, CREATE)` |
| PATCH | `/whatsapp/auto-reply-rules/:id` | `whatsapp:manage_autoreply` | `(whatsapp_autoreply_rule, UPDATE)` |
| DELETE | `/whatsapp/auto-reply-rules/:id` | `whatsapp:manage_autoreply` | `(whatsapp_autoreply_rule, DELETE)` |

- **Read is `whatsapp:read`** (staff can see configured rules + that they fired — S5/AC6 "Sipho can see
  auto-replies fire but not reconfigure them").
- **Write is the NEW `whatsapp:manage_autoreply`** (owner-only) — see §6.1 for why a new permission, not
  reuse of `whatsapp:manage_channel`.
- **Create/update validation:** `KEYWORD` requires `keyword`; `OUT_OF_HOURS` requires `hoursStart`+`hoursEnd`
  (valid `HH:mm`); `SEND_TEXT` requires `replyText`; `SHARE_CATALOG` action reuses §4.2 composition.

### 4.5 Summary — new/changed routes

| # | Method | Path | Permission | New? |
|---|---|---|---|---|
| 1 | POST | `/orders` (extended body: `channel`, `conversationId`) | `order:write` | **changed** (additive) |
| 2 | POST | `/sync` (order op payload extended: `channel`, `conversationId`) | `sync:write` | **changed** (additive) |
| 3 | POST | `/whatsapp/conversations/:id/share-catalog` | `whatsapp:send` | **new** |
| 4 | GET | `/whatsapp/auto-reply-rules` | `whatsapp:read` | **new** |
| 5 | POST | `/whatsapp/auto-reply-rules` | `whatsapp:manage_autoreply` | **new** |
| 6 | PATCH | `/whatsapp/auto-reply-rules/:id` | `whatsapp:manage_autoreply` | **new** |
| 7 | DELETE | `/whatsapp/auto-reply-rules/:id` | `whatsapp:manage_autoreply` | **new** |

(S1/S2/S7 add **no** routes — UI + existing M3-A send/payment routes.)

---

## 5. Order-capture service contract (S3 internals)

### 5.1 `createOrder()` extension (additive, back-compatible)

Extend `CreateOrderInput` (`server/src/services/order.service.ts`) with two optional fields — **no behaviour
change when omitted**:

```ts
interface CreateOrderInput {
  // ...existing M2 fields...
  channel?: 'IN_PERSON' | 'WHATSAPP' | 'ONLINE';   // ALREADY present in code (verified)
  conversationId?: string;                          // NEW — written to Order.conversationId
}
```

- Before writing `conversationId`, the service **MUST** load the conversation and assert
  `conversation.businessId === input.businessId` (tenant isolation — §12). Mismatch → `ValidationError` /
  403; **never** write a cross-tenant link.
- Idempotency unchanged: existing `findUnique({ businessId_clientId })` short-circuit returns the prior order
  (`duplicate: true`) — so a re-played WhatsApp capture is a no-op (S3/AC6).

### 5.2 Customer link/create from `waContactId` (S3/AC2)

When `customerId` is omitted and `conversationId` is supplied, inside the same transaction:
1. If `Conversation.customerId` is already set → reuse it.
2. Else find an existing `Customer` for this tenant whose `phone` normalises to the conversation's
   `waContactId` (E.164-normalised compare). If found → link.
3. Else **create** a `Customer`: `name` defaults to a placeholder (e.g. `"WhatsApp +27•••••1234"` masked
   form for display; the architect sets the default — merchant can rename later), `phone = waContactId`
   (normalised), **`consentId = null`** (ruling OPEN). Carry a deterministic `clientId`
   (e.g. `wa:<conversationId>`) so offline re-capture converges to the same customer.
4. Back-link `Conversation.customerId` if it was null.

**`Customer.consentId` stays nullable** and creation is **never blocked** by absence of a messaging-consent
grant (S6/AC5) — capturing a transactional sale is a distinct lawful basis from sending optional messages.

---

## 6. Consent enforcement wiring (S6) — branch policy, not call sites

M3-B does **not** rebuild the consent point — it **calls the M3-A enforcement point** on every send path and
makes it **customer-aware** so per-customer revocation (S6/AC3) works, while keeping the **default-deny**
posture and the **transactional/marketing branch split** intact (S6/AC1) and **structured so the §8.1 ruling
changes the branch policy, not the call sites** (S6/AC4).

### 6.1 The wiring

- **Single enforcement point.** Every outbound send (S2 reply, S4 catalog share, S5 auto-reply, S7 status
  notify) flows through `sendWhatsAppMessage()` → `assertConsentGranted(...)` (M3-A). No send path bypasses it.
- **Make the check customer-aware (additive).** M3-B passes the **conversation context** into the consent
  point so it can resolve the customer:
  - `assertConsentGranted(businessId, sendClass, isTemplate, ctx)` where `ctx` carries `conversationId`
    (and, if linked, `customerId` / the conversation's `waContactId`).
  - **Branch on `sendClass` (S6/AC1), never collapse the two classes:**
    - `TRANSACTIONAL` free-form **inside an OPEN window** → allowed (replying to an active enquiry; M3-A
      behaviour preserved).
    - `MARKETING` / non-transactional → **default-DENY** until the §8.1 ruling lands (S6/AC4).
    - Template sends → require a recorded grant per the M3-A stub (the ruling may relax transactional
      templates later — a branch change, not a call-site change).
  - **Per-customer revocation (S6/AC3):** when the conversation is linked to a `Customer` with a non-null
    `consentId`, the check reads that `Consent` + its latest `ConsentRevocation` (M1 ledger); a revocation →
    refuse non-transactional/marketing with the M3-A **`403 whatsapp_consent_denied`** envelope.
- **Ledger is the source of truth (S6/AC2):** opt-in/revocation read **only** from M1
  `Consent`/`ConsentRevocation` — no new ad-hoc flag. `Customer.consentId` stays **nullable** (S6/AC4); when
  null, the marketing branch is default-deny (no grant ⇒ no marketing send).
- **Refusal is auditable + masked (S6/AC6):** a denied send writes `(whatsapp_autoreply, SUPPRESSED)` (for
  auto-replies) or surfaces the `403` envelope (for explicit sends) with **masked** customer identifiers.

### 6.2 Why this slots the §8.1 ruling in cleanly

The **branch policy** (what each `sendClass` requires) lives in **one function**. The ruling (merchant =
responsible party / Inyuku = operator) changes *that policy* — e.g. whether a transactional template needs a
grant, or whether merchant-as-responsible-party shifts the basis — **without touching any of the four call
sites**. This is exactly the M3-A design intent (M3-A §6, brief S6/AC4). M3-B **does not invent the ruling**.

### 6.3 Auto-reply respects the same gates + loop prevention (S5/AC5, S5/AC7) — non-negotiable

An auto-reply is an **ordinary outbound send through the same gate** — it can never bypass window/consent:
- It calls `sendWhatsAppMessage()` (window auto-selection + `assertConsentGranted` + `enabled` flag) like any
  other send. An out-of-window auto-reply is suppressed or template-only per M3-A (S5/AC5).
- **Loop prevention (S5/AC7) — fires ONLY on a genuine inbound customer message:** the auto-reply evaluator
  triggers from the **M3-A inbound drainer**, gated to fire **only** when the just-persisted `Message` has
  `direction = INBOUND` **and** `type ∈ {TEXT, INTERACTIVE, …}` (a real customer message) — **NEVER** on
  `direction = OUTBOUND`, **NEVER** on `type = STATUS` (status callbacks), **NEVER** on the platform's own
  echoes. (Echoes/status are not inbound customer text, so they cannot trigger a rule.)
- **Once-per-period (S5/AC1, AC3):** before sending, the evaluator checks the existing `Message` ledger for a
  prior **OUTBOUND auto-reply** of the same `trigger` on this conversation within `cooldownMinutes`
  (GREETING: re-fire only after `cooldownMinutes` silence; OUT_OF_HOURS: at most once per closed period).
  No per-conversation counter table — loop state is **derived from the append-only ledger**, keeping the
  rule table config-only.
- **Provably non-AI (S5/AC4):** the evaluator is a **deterministic rule matcher** — exact normalised keyword
  compare, SAST-clock hours check, ledger-based first-inbound/silence check. **It MUST NOT import or call
  `lib/ai.js`**, MUST NOT be generative, MUST NOT do intent detection. (STRIDE/CI check: the auto-reply
  module must have **zero** `lib/ai.js` references — §12.)

---

## 7. RBAC — permission registry additions + role-map deltas

### 7.1 New permission

| Permission | Grants |
|---|---|
| `whatsapp:manage_autoreply` | **Owner-only.** Create/update/delete `WhatsAppAutoReplyRule` (the canned greeting/keyword/out-of-hours config). |

### 7.2 Reused permissions (no change)

`whatsapp:read`, `whatsapp:send` (M3-A); `order:write`, `customer:write`, `inventory:write`, `sync:write`
(M2). Catalog share reads M2 `Product` via the share route under `whatsapp:send` (it composes server-side;
it does not require `catalog:read` because it never returns catalog data to the caller — it sends it to the
customer; sell-price-only, never cost).

### 7.3 Role-map deltas (M3-B)

| Permission | MERCHANT_OWNER | MERCHANT_STAFF | AI_AGENT |
|---|---|---|---|
| `whatsapp:read` | ✓ | ✓ | ✓ (read-only, M3-A) |
| `whatsapp:send` | ✓ | ✓ (Sipho operates) | ✗ |
| `whatsapp:manage_channel` | ✓ | ✗ | ✗ |
| **`whatsapp:manage_autoreply`** (new) | **✓** | **✗** (sees rules via `whatsapp:read`, cannot edit) | **✗** |
| `order:write` / `customer:write` / `inventory:write` / `sync:write` (capture) | ✓ | ✓ | ✗ |
| `catalog:read_cost` / `dashboard:read_financial` | ✓ | **✗ (hidden, not zeroed)** | ✗ |

- **Cost-split (S3/AC5, S1/AC4, brief §10):** `MERCHANT_STAFF` keeps every commerce/WhatsApp **operate**
  permission but **NOT** `catalog:read_cost`, `dashboard:read_financial`, `whatsapp:manage_channel`, or the
  new `whatsapp:manage_autoreply`. The catalog-picker and catalog-share Sipho sees are **sell-price-only** —
  cost is **hidden by omission**, never returned-as-zero.
- **`AI_AGENT` untouched** — read-only (`whatsapp:read` only on this surface, M3-A §10); no send, no config,
  no capture. M3-B has **no AI** on the conversational surface (brief §10).
- **Owner-configures / staff-operates is non-negotiable** (S5/AC6) — encoded by `manage_autoreply` being
  owner-only while `whatsapp:send` (operate) stays with staff.

---

## 8. Window / send-mode (reused, unchanged)

M3-B does not re-implement the 24h customer-care window or the template registry — both are **frozen M3-A**.
M3-B's UI **renders** `windowState`/`windowExpiresAt` in plain language (S1/AC3, S2/AC2) and lets the server
auto-select free-form vs APPROVED template (S7/AC1). A free-form send while CLOSED still returns the M3-A
`409 whatsapp_window_closed`; an unregistered/invalid-param template still returns
`422 whatsapp_template_invalid`. No contract change.

---

## 9. Compliance seams (default-safe; do NOT block sandbox build)

| Seam | Where | Default | M3-B behaviour |
|---|---|---|---|
| Sub-processor enable flag (LIVE 360dialog) | `WhatsAppChannel.enabled` (M3-A) | `false` | M3-B builds/tests **sandbox-first**; LIVE send held until the EA-ADR-015 360dialog DPA/EU-pin/risk-assessment clears (brief §8.2). Ships **dark**. |
| Consent enforcement point | `assertConsentGranted` (M3-A; M3-B makes it customer-aware, §6) | **default-DENY** marketing/non-transactional | `Customer.consentId` stays nullable; ruling slots into branch policy (§6.2). |
| Customer-directory consent ruling | brief §8.1 (OPEN — bukani-compliance) | — | **GA-gates non-transactional messaging.** M3-B builds under default-deny; **does NOT invent the ruling** (CLAUDE.md §7). |
| Message/Conversation retention | Setting `whatsapp.message.retentionDays` (M3-A; unset → no purge) | unset | M3-B may now turn `Message` PII into `Order`/`Customer` PII → POPIA register extends; period TBD with bukani-compliance (brief §8.3). **Not hard-coded.** |
| Transactional-vs-marketing classification | `Message.sendClass` (required input) | none | Never collapsed; consent branches on it (§6). |

**No production PII before** the EA-ADR-015 sub-processor risk assessment + signed DPAs (CLAUDE.md §4). M3-B
build is **sandbox-only, zero production PII** — not gated, but the live cutover is.

---

## 10. Code-vs-brief reconciliation (flagged for the team)

Verified against the merged code; two places where the **brief reads optimistically** and the contract
pins reality (code wins):

1. **M2 `POST /orders` does NOT currently accept `channel` or `conversationId`.** The `createOrder` **service**
   already accepts `channel` (incl. `WHATSAPP`), but the route's `CreateOrderBody` Zod schema does **not**
   expose it (it writes `IN_PERSON` only), and **no** `conversationId` exists anywhere. So S3 "create an
   `Order(channel=WHATSAPP)`" requires the **additive** body fields in §4.1 + the `Order.conversationId`
   column in §2.1. This is real M3-B work, not "already there." **Not a blocker** — additive and back-compatible.
2. **The M3-A consent point is business-scoped, not customer-scoped.** `assertConsentGranted(businessId,
   sendClass, isTemplate)` does a business-level `consent.findFirst` — it has **no customer identity**, so
   S6/AC3 "a customer who revoked gets no marketing send" cannot work until M3-B passes conversation/customer
   context in (§6.1). This is the principal §6 wiring task and a STRIDE-relevant change. Captured here so the
   security pass and KIMI build against reality, not the brief's summary.

No contradiction blocks the design; both are additive extensions of frozen seams.

---

## 11. ADR entries (continue ADR-INY-0xx; M3-A ended at 020)

### ADR-INY-021 — Conversation→Order linkage = nullable FK on `Order`
- **Context:** S3/AC4 needs a captured `Order` linked back to its `Conversation` without forking the one-order
  model (brief §10, §8.6).
- **Options:** (a) nullable `conversationId` FK on `Order`; (b) nullable `orderId` on `Conversation`;
  (c) thin join table.
- **Decision:** **(a)** — nullable `Order.conversationId`, `onDelete: SetNull`, `@@index([conversationId])`.
- **Consequences:** one-order-model preserved; null-sparse on the hot M2 `Order` table; models repeat orders
  per thread (which (b)'s 1:1 cannot); no extra table/hop (vs (c)). The order survives conversation deletion
  (record-of-trade durability) with the link cleared. Capture must assert same-tenant before linking.

### ADR-INY-022 — Auto-reply config = a tenant table (`WhatsAppAutoReplyRule`), not a `Setting`
- **Context:** S5/AC6 needs owner-configured greeting / keyword / out-of-hours rules.
- **Options:** (a) a `Setting` JSON blob; (b) a typed tenant table.
- **Decision:** **(b)** — `WhatsAppAutoReplyRule` (mirrors the M3-A ADR-INY-020 reasoning for the template
  registry: per-tenant, multiple typed rows, queryable, RBAC-/audit-able, SAST-hours fields).
- **Consequences:** clean RBAC (`whatsapp:manage_autoreply`), per-rule audit, indexable trigger lookup in the
  drainer; a `Setting` blob could not express keyword matching / hours / cooldown / per-rule enable cleanly.

### ADR-INY-023 — Catalog share = server-composed plain ZAR-priced text list
- **Context:** representation deferred to architect (brief §8.7); Nomsa's entry-level Android / low-literacy
  context; cost sensitivity.
- **Options:** (a) plain text list; (b) one product-message per item; (c) 360dialog interactive list.
- **Decision:** **(a)** plain ZAR-priced text list, **server-composed** behind a thin `share-catalog` route;
  ACTIVE only, archived excluded, out-of-stock **included-and-flagged**, cost **never** included; (c)
  reconsidered later only if a clearly-cheaper interactive variant is confirmed.
- **Consequences:** lowest cost / most robust on low-end devices; one outbound path through the M3-A gates;
  RBAC + price-formatting stay server-side (no client price logic, no `costPriceCents` near the client).

### ADR-INY-024 — Order-capture rides the M2 `clientId`/`sync` path; no new offline mechanism, no new sync op
- **Context:** S3/AC6 offline capture must converge exactly once (brief §10).
- **Decision:** reuse the existing `entity:"order"`, `op:"create"` sync op and the `@@unique([businessId,
  clientId])` + LWW-on-`occurredAt` resolution (ADR-INY-016). The only additions are two **optional** order
  fields (`channel`, `conversationId`). **No** `entity:"whatsapp_order"`, **no** `op:"capture"`.
- **Consequences:** one offline mechanism platform-wide; WhatsApp orders are ordinary M2 orders end-to-end
  (dashboard, ledger, RBAC, fulfilment seams); zero new convergence logic to test.

---

## 12. Security-sensitive surfaces for the bukani-security STRIDE (freeze gate)

This is the input the STRIDE pass must gate on (brief §8.4). M3-A's STRIDE covered the webhook/channel; M3-B
adds the commerce-from-chat surface. **Freeze is blocked until bukani-security PASSes these.**

- **Cross-tenant capture / inbox isolation (Tampering / Information Disclosure / Elevation).** Order capture
  writes `Order.conversationId` and a `Customer` from a `Conversation`. The capture path **MUST** assert
  `Conversation.businessId === route businessId === Order.businessId` before linking/creating (§5.1); the
  inbox/thread reads (M3-A routes) MUST stay scoped to the resolved `businessId`. **Threat:** a crafted
  `conversationId` from another tenant linked to this tenant's order, or reading another tenant's thread.
- **Consent-bypass via auto-reply (Repudiation / policy bypass).** An auto-reply MUST flow through the same
  `assertConsentGranted` + window + `enabled` gates as any send (§6.3) — it must **not** be a side-door that
  marketing-sends to a revoked customer. **Threat:** a `SHARE_CATALOG`/`SEND_TEXT` rule firing as a
  marketing send to a customer who revoked, or while LIVE-disabled.
- **PII-in-Order-created-from-Message (Information Disclosure).** Capture turns `waContactId` /
  `Message.body`-context into a `Customer` (phone PII) + an `Order`. **All** of: customer create, the
  `(customer,CREATE)`/`(order,CREATE)` audit, and every log line **MUST** be PII-masked (chassis
  `pii-mask`); raw msisdn/body never logged (M3-A control 4). `Customer.consentId` stays nullable
  (transactional capture ≠ messaging consent — S6/AC5).
- **Auto-reply loop / cost-DoS (Denial of Service).** The evaluator MUST fire **only** on genuine INBOUND
  customer messages (never OUTBOUND, never `type=STATUS`, never echoes) and MUST enforce
  `cooldownMinutes`/once-per-period from the ledger (§6.3). **Threat:** two auto-replying parties or a
  status-callback storm driving unbounded paid WhatsApp sends. `(whatsapp_autoreply, SUPPRESSED)` audit must
  make suppression observable.
- **Order-capture authorization (Elevation / cost-split).** Capture requires `order:write` (+ `sync:write`
  offline); `MERCHANT_STAFF` can capture but **must never** see `costPriceCents` / margin / financial totals
  on the picker, the catalog share, or the resulting order view — **hidden, not zeroed** (no
  `catalog:read_cost` / `dashboard:read_financial`). **Threat:** cost/margin leaking to staff via the
  capture or share surface.
- **Provably non-AI auto-reply (autonomy-boundary / EA-ADR-012 pre-emption).** The auto-reply module MUST
  have **zero** `lib/ai.js` references (deterministic only). **Threat:** a "smart reply" creeping in
  pre-empts the M5 AI-agent STRIDE/autonomy gate. CI/grep assertion recommended.
- **(Carried) Live-cutover gate.** Live 360dialog flow stays DARK behind `WhatsAppChannel.enabled` until the
  EA-ADR-015 DPA/EU-pin/risk-assessment clears (brief §8.2). M3-B is sandbox-only; **no production PII**.

---

## 13. Acceptance (definition-of-done pointers)

Per brief §11, against the 360dialog **sandbox**: inbox read + window-aware reply (S1/S2); capture into
`Order(channel=WHATSAPP)` with customer link/create + ledger decrement + dashboard reflection, converging
exactly once offline (S3); deterministic auto-replies / catalog share / status notifications obeying window +
consent gates (S4/S5/S7); RBAC cost-split + PII-masking on every surface; consent under the default-deny stub
with `Customer.consentId` nullable (S6); and **the bukani-security STRIDE entry (§12) is IN and its
conditions are reflected here before FREEZE.** Live messaging stays DARK (brief §8.2) — not in build DoD.

---

> **STATUS: DRAFT — pending bukani-security STRIDE before FREEZE.** Do not treat as frozen. KIMI must not
> begin M3-B build until this is frozen post-STRIDE-PASS (the M2/M3-A gating pattern).
