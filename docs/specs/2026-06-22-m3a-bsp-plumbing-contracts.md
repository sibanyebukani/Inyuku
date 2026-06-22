# Inyuku Digital — M3-A (WhatsApp BSP Plumbing) Frozen Architect Contracts

> **Author:** bukani-architect · **Date:** 2026-06-22 · **Status:** FROZEN for M3-A build.
> **Persisted by:** bukani-docs. These contracts implement the M3-A slice of the product brief in
> `docs/specs/2026-06-22-m3-whatsapp-commerce-product-brief.md` (§8 — first slice: BSP plumbing). The
> canonical human-readable mirrors are `docs/SCHEMA.md` (Prisma) and `docs/API.md` (routes/permissions),
> which **bukani-docs updates after M3-A merges** (the M2 pattern). When code/OpenAPI/Prisma disagree with
> this doc, **code wins** — file a docs fix.
> **Stack (unchanged):** Fastify 5 (TypeScript) + Prisma 6 on Railway Postgres 16 (EU) + Redis 7 + R2.
> **References:** ADR-INY-017/018/019/020 (`docs/DECISIONS.md`), EA-ADR-014 (topology / 360dialog BSP),
> EA-ADR-015 (POPIA / sub-processors), ADR-007 (BullMQ scope), ADR-INY-011 (`Setting` AES-256-GCM),
> ADR-INY-016 (M2 sync idempotency — **distinct** from M3 provider-id dedup), ADR-005 (tenant root).
> **Security gate:** `docs/THREAT-MODEL.md` §7 — **APPROVED-WITH-CONDITIONS**; the 5 conditions are baked
> in below (signature-verify-before-parse, provider-id idempotency, server-side tenant routing, PII-masked
> logging, fast-ack-then-async). **Compliance:** `docs/POPIA.md` §7b — sandbox-first, live messaging ships
> **DARK** behind the §6 sub-processor-enable seam.

---

## 0. Scope boundary (what M3-A is and is NOT)

**M3-A IS:** signature-verified, replay-safe, idempotent inbound webhook ingest; `WhatsAppChannel` tenant
routing map; `Conversation` / `Message` persistence; durable inbound outbox + async drain; outbound send
(free-form + template); 24h customer-care session-window tracking; approved-template registry; the consent
**enforcement point** (default-deny **stub**) and the sub-processor **enable flag** (default OFF).

**M3-A is NOT (deferred to M3-B/M3-C/M4/M5):** any commerce logic (no `Order`/`StockMovement`/`Customer`
writes from a webhook), catalog share, order capture, rule-based auto-replies, the **rules** the consent
check enforces (the responsible-party ruling — §7), AI/`lib/ai.js` (rule-based only, never in M3), payments.
M3-A **builds the seams** M3-B consumes; it wires none of the downstream commerce.

---

## 1. Schema conventions (carried from M1/M2)

Every M3-A table follows the baseline:

- PascalCase Prisma model + snake_case `@@map`; snake_case columns.
- **`cuid` primary key.**
- **`businessId` FK on every table** (tenant root = `Business`, ADR-005), non-null **except** where the
  brief explicitly allows a deferred link (none in M3-A — all M3-A tables are tenant-bound; see routing).
- `createdAt` / `updatedAt` (UTC). Time-of-event fields are explicit timestamps.
- Tenant isolation enforced at the route/query layer against the resolved `businessId`.
- **No money in M3-A** (commerce is M3-B) — but the convention (ZAR `Int` cents) is inherited for M3-B.

**M3-A idempotency convention (NEW, distinct from M2 `clientId`):** inbound dedup is on the **provider
message/event id**, `@@unique([businessId, providerMessageId])`, redelivery = `ON CONFLICT DO NOTHING`
(ADR-INY-018). This is **provider-id** dedup (server resolves the tenant), NOT the M2 client-generated
`clientId` (which stays the convention for offline-creatable merchant entities in M3-B).

---

## 2. Prisma models (M3-A)

> Full table-by-table detail is mirrored in `docs/SCHEMA.md` post-merge. This is the contract summary.

### WhatsAppChannel
**The tenant routing map (security control 3 — Elevation/CRITICAL). The ONLY tenant source for inbound.**
- `id` (cuid PK), `businessId` FK (non-null),
- **`phoneNumberId`** (text) — the WhatsApp/Meta **phone-number-id** 360dialog delivers in the payload
  metadata; the routing key. `@@unique([phoneNumberId])` (**global unique** — a phone-number-id maps to
  exactly one tenant across the platform; this is what makes routing unspoofable),
- `displayPhoneNumber` (text, the human msisdn — PII-masked in logs),
- `mode` (`WhatsAppChannelMode`: `SANDBOX` / `LIVE`) — sandbox-first; LIVE is the cutover seam,
- **`enabled`** (Boolean, **default `false`**) — the **sub-processor enable flag** (compliance seam, §6).
  When `false`, **outbound LIVE send is refused** and inbound LIVE processing is held; the **sandbox path
  is always available** regardless. Ships dark (POPIA §7b),
- `wabaId` (text, nullable) — WhatsApp Business Account id (provider metadata),
- `lastInboundAt` (timestamp, nullable) — most recent verified inbound on this channel,
- timestamps.
- Indexes: `@@unique([phoneNumberId])`; `@@unique([businessId, phoneNumberId])` (defensive); `businessId`.
- **Provisioning is admin-only** (`whatsapp:manage_channel`); a webhook **never auto-provisions** a channel
  (control 3 — unmapped `phoneNumberId` → reject + `(whatsapp_webhook, UNROUTED)`).

### Conversation
**One thread per (business, customer wa-id).**
- `id` (cuid PK), `businessId` FK (non-null),
- `channelId` FK → `WhatsAppChannel`,
- `customerId` FK → `Customer` (**nullable** — linkage deferred to M3-B order capture; an inbound is never
  dropped for lack of a directory match, brief AC M3-S1/AC2),
- **`waContactId`** (text) — the customer's WhatsApp id (their msisdn/wa-id; **PII**),
- **`lastInboundAt`** (timestamp, nullable) — drives the 24h customer-care window (§4),
- `lastOutboundAt` (timestamp, nullable),
- `status` (`ConversationStatus`: `OPEN` / `ARCHIVED`),
- timestamps.
- Indexes: `@@unique([businessId, channelId, waContactId])` (one thread per customer per channel);
  `businessId`; `customerId`.
- Relationships: belongs to `Business`, `WhatsAppChannel`, optional `Customer`; has many `Message`.

### Message
**Append-only (soft-delete only). Inbound + outbound.**
- `id` (cuid PK), `businessId` FK (non-null),
- `conversationId` FK → `Conversation`,
- **`providerMessageId`** (text) — the BSP/Meta message id; the **idempotency key** (control 2).
  `@@unique([businessId, providerMessageId])`. For outbound, set to the provider id returned by the send
  call (nullable until the send is acknowledged; see §3.3).
- `direction` (`MessageDirection`: `INBOUND` / `OUTBOUND`),
- `type` (`MessageType`: `TEXT` / `IMAGE` / `DOCUMENT` / `AUDIO` / `VIDEO` / `LOCATION` / `CONTACTS` /
  `TEMPLATE` / `INTERACTIVE` / `STATUS` / `UNSUPPORTED`),
- **`body`** (text, nullable — **PII**; raw content; **never logged**, control 4),
- `mediaKey` (text, nullable) — R2 object key if media is fetched/stored (private-by-default; M3-A may
  store the provider media id only and defer fetch — see §3.4),
- `mediaMimeType` (text, nullable),
- **`sendClass`** (`SendClass`: `TRANSACTIONAL` / `MARKETING` / nullable for inbound) — the
  **transactional-vs-marketing classification** (compliance seam, §6) — **a required input on every
  OUTBOUND send**, never inferred,
- `templateName` (text, nullable) — set when `type = TEMPLATE`; references the registry (§5),
- `templateParams` (Json, nullable) — the bound template variables,
- `status` (`MessageStatus`: `RECEIVED` / `QUEUED` / `SENT` / `DELIVERED` / `READ` / `FAILED`) — inbound
  lands `RECEIVED`; outbound walks `QUEUED → SENT → DELIVERED → READ` (or `FAILED`) via status callbacks,
- `failureReason` (text, nullable),
- **`occurredAt`** (timestamp) — provider timestamp where supplied (drives the advisory ±5-min replay
  window, control 2); else receipt time,
- `deletedAt` (timestamp, nullable) — **soft delete + retention-purge marker** (§6),
- timestamps.
- Indexes: `@@unique([businessId, providerMessageId])`; `conversationId`; `businessId`;
  `@@index([businessId, occurredAt])`.
- Relationships: belongs to `Business`, `Conversation`.

### WhatsAppInboundEvent  (durable outbox — ADR-INY-017, async-ack ruling)
**The fast-ack durability boundary. The verified raw event is persisted here BEFORE the 2xx, then drained
async.** This is the architect's async-ack ruling (§3.2): **durable Postgres outbox, NOT a new BullMQ queue.**
- `id` (cuid PK),
- `businessId` FK (**nullable** — written *before* routing resolves a tenant in the
  verify→persist→ack-fast path; the drainer resolves/sets it, or marks `UNROUTED`),
- `phoneNumberId` (text, nullable) — extracted post-verify for routing by the drainer,
- **`providerEventId`** (text) — the webhook delivery/event id; `@@unique([providerEventId])` (whole-event
  dedup at the edge, before per-message dedup),
- **`rawPayload`** (Json) — the verified raw body (signature already passed; PII — masked in logs, never
  in responses),
- `signatureVerified` (Boolean) — always `true` for a persisted row (unverified never persists; control 1),
- `status` (`InboundEventStatus`: `PENDING` / `PROCESSING` / `PROCESSED` / `UNROUTED` / `FAILED`),
- `attempts` (Int, default 0), `lastError` (text, nullable),
- `receivedAt` (timestamp), `processedAt` (timestamp, nullable),
- timestamps.
- Indexes: `@@unique([providerEventId])`; `@@index([status, receivedAt])` (drain query);
  `@@index([businessId])`.

### WhatsAppTemplate  (approved-template registry — table-backed, ADR-INY-020)
**The single source of which templates may be sent and their parameters (control: brief M3-S7/AC1).**
Table-backed (not Setting-backed) because templates are per-tenant, queryable, status-tracked, and
parameterised — a `Setting` blob cannot express the registry/RBAC/audit cleanly.
- `id` (cuid PK), `businessId` FK (non-null),
- **`name`** (text) — the Meta template name; `@@unique([businessId, name, language])`,
- `language` (text — BCP-47 / Meta locale, e.g. `en`, `zu`, `xh`, `st`, `af`),
- `category` (`TemplateCategory`: `UTILITY` / `MARKETING` / `AUTHENTICATION`) — Meta's category; drives the
  default `sendClass` mapping (UTILITY/AUTH → `TRANSACTIONAL`, MARKETING → `MARKETING`),
- **`status`** (`TemplateStatus`: `DRAFT` / `PENDING` / `APPROVED` / `REJECTED` / `PAUSED` / `DISABLED`) —
  **only `APPROVED` templates are sendable** (M3-S7/AC1),
- `bodyText` (text) — the template body with `{{n}}` placeholders (for merchant preview; not PII),
- **`paramSchema`** (Json) — ordered parameter spec (count + names + types) the send call must satisfy,
- `providerTemplateId` (text, nullable) — the BSP/Meta template id,
- timestamps.
- Indexes: `@@unique([businessId, name, language])`; `businessId`.

---

## 3. Inbound webhook ingest — the security-critical path

### 3.1 The pipeline (strict order — control 1 first, fail-closed)

```
1. Capture RAW body         (raw-body plugin; BEFORE any JSON body-parser mutates it)
2. Signature verify         HMAC-SHA256(appSecret, rawBody) === X-Hub-Signature-256 (constant-time)
                            FAIL → 401, audit (whatsapp_webhook, VERIFY_FAILED), NO parse, NO DB, STOP
3. Edge rate-limit          Redis, keyed on req.ip (TRUSTED_PROXY_HOPS) + global per-edge ceiling
4. Parse + extract          providerEventId, phoneNumberId, message ids (now safe to parse)
5. Persist durably          INSERT WhatsAppInboundEvent (ON CONFLICT(providerEventId) DO NOTHING)
6. ACK FAST                 return 200 immediately (heavy work is async — control 5)
--- async drain (sweeper) ---
7. Resolve tenant           phoneNumberId → WhatsAppChannel.businessId  (control 3; NEVER from payload)
                            unmapped → status=UNROUTED, audit (whatsapp_webhook, UNROUTED), STOP
8. Per-tenant rate-limit    Redis, keyed on resolved businessId
9. Upsert Conversation      (businessId, channelId, waContactId)  → set lastInboundAt (opens 24h window)
10. Persist Message(s)      INSERT (ON CONFLICT(businessId, providerMessageId) DO NOTHING)  ← control 2
                            audit (whatsapp_message, RECEIVE) with MASKED metadata only  ← control 4
11. Handle status callbacks update Message.status (SENT/DELIVERED/READ/FAILED) by providerMessageId
12. Mark event PROCESSED
```

**Control 1 — signature verify (Spoofing).** HMAC-SHA256 over the **raw** request body compared against
`X-Hub-Signature-256` (`sha256=<hex>`) with a **constant-time compare**. **Fail-closed → `401` before any
parse or DB write.** The raw body MUST be captured before body-parsing (Fastify `addContentTypeParser` /
raw-body plugin on this route only). Secrets from encrypted `Setting` (`whatsapp.webhook.appSecret`) —
never env-plaintext, never in code, never in a response.

**Control 2 — replay + idempotency.** Whole-event dedup on `WhatsAppInboundEvent.providerEventId`
(unique); per-message dedup on `Message @@unique([businessId, providerMessageId])`; both `ON CONFLICT DO
NOTHING`. **Advisory ±5-min replay window:** where the provider supplies a trustworthy message timestamp,
reject (drop + audit) events older than ±5 min skew; where no trustworthy timestamp exists, **idempotency
is the primary control** and the window is advisory only.

**Control 3 — tenant routing (Elevation/CRITICAL).** Tenant is resolved **only** by
`phoneNumberId → WhatsAppChannel.businessId`, server-side, **after** verification. **No `businessId` or any
tenant field is ever read from the payload.** Unmapped `phoneNumberId` → `UNROUTED`, audited, no
auto-provision.

**Control 4 — logging/PII.** Chassis `logger` + `pii-mask` mandatory on this surface. **Raw `Message.body`
and customer phone numbers are NEVER logged.** Log only masked metadata: `providerMessageId`, `direction`,
masked msisdn, `businessId`, `type`. Audit tuples carry masked metadata only.

**Control 5 — DoS / async-ack (ADR-INY-017).** **Durable Postgres outbox + async drain** (ruling in §3.2).
Redis rate-limit on the webhook route: edge limiter keyed on `req.ip` (honouring `TRUSTED_PROXY_HOPS` per
the M1-B finding) + a **global per-edge ceiling**; a second per-tenant limiter keyed on the resolved
`businessId` in the drainer.

### 3.2 Async-ack ruling (ADR-INY-017) — durable outbox, NOT a new BullMQ queue

**Decision: a durable Postgres outbox table (`WhatsAppInboundEvent`) drained by an interval sweeper, NOT a
new BullMQ queue.** Justification (one line): **BullMQ is ADR-007-scoped to orders/fulfilment only, and a
Postgres outbox keeps the verified event in the same transactional/durable boundary as `Message` — survives
a Redis flush/load-shedding event (no lost webhooks), is replay-safe via the same unique constraints, and
avoids standing up a second queue infrastructure for M3-A.** The drainer is a simple `setInterval` worker
(claim `PENDING` rows `FOR UPDATE SKIP LOCKED`, process, mark `PROCESSED`/`FAILED` with bounded retry on
`attempts`). Re-eval trigger: if sustained inbound volume needs fan-out/priority/backoff semantics a poller
can't give, promote to a dedicated queue under a follow-up ADR (and reconcile ADR-007's scope).

### 3.3 Outbound send

- Send is **server-side only** (the BSP key never reaches the client). Free-form vs template is **chosen by
  the server from window state** (§4) — the caller does not guess (brief M3-S6/AC2, M3-S7/AC2).
- **`sendClass` (`TRANSACTIONAL` / `MARKETING`) is a required input** — never inferred (compliance seam §6).
- **Consent enforcement point (default-deny stub, §6):** before any **non-transactional** send (and any
  template send per the ruling), check the M1 `Consent`/`ConsentRevocation` ledger; **deny unless a recorded
  grant exists.** Until the §7 responsible-party ruling lands, the check is **default-deny** for
  marketing/non-transactional; transactional may pass per the ruling (kept as a distinct branch — do not
  collapse the two classes).
- **LIVE send requires `WhatsAppChannel.enabled = true`** (sub-processor enable flag, §6) — else refused
  (`422` `whatsapp_channel_disabled`); sandbox path always available.
- A send creates a `Message` (`direction=OUTBOUND`, `status=QUEUED`), calls 360dialog, stores the returned
  `providerMessageId`, transitions `QUEUED → SENT`; status callbacks advance `DELIVERED`/`READ`/`FAILED`.
- Audit `(whatsapp_message, SEND)` with masked metadata; `ErrorLog` on send failure.

### 3.4 Media

M3-A persists the message envelope + provider media id/mime; **fetching+storing media bytes to R2 is
optional in M3-A** (private-by-default, short-TTL signed URLs if fetched — ADR-INY-008 storage driver).
`mediaKey` is the R2 seam. Full media handling may defer to M3-B.

---

## 4. The 24-hour customer-care session-window state machine

| State | Meaning | Allowed sends |
|---|---|---|
| **OPEN** | `now - Conversation.lastInboundAt < 24h` | **Free-form** OR **approved template** |
| **CLOSED** | no inbound in the last 24h (or never) | **Approved template ONLY** (M3-S4/AC2, M3-S7) |

- **Each verified INBOUND customer message sets `Conversation.lastInboundAt = occurredAt`**, (re)opening/
  extending the window (brief M3-S6/AC1).
- The server exposes window state per conversation (`windowState` + `windowExpiresAt`) so the UI never makes
  the merchant guess (M3-S6/AC2).
- **Send-mode selection is server-enforced at the boundary, not the UI** (M3-S7/AC2): a free-form send
  attempted while `CLOSED` is rejected (`409` `whatsapp_window_closed`) and the approved-template path is
  offered. An unregistered/unapproved template is impossible to send (M3-S7/AC1).
- Outbound sends do **not** open the window (only inbound does — WhatsApp's rule).

---

## 5. Approved-template registry contract

- `WhatsAppTemplate` (§2) is the **single source** of sendable templates + their parameters (M3-S7/AC1).
- A send referencing `templateName` MUST: resolve a row `(businessId, name, language)` with
  `status = APPROVED`, and the bound `templateParams` MUST satisfy `paramSchema` (count + types) — else
  `422` `whatsapp_template_invalid`. Sending a non-`APPROVED` or unregistered template is impossible.
- Template CRUD/sync is `whatsapp:manage_channel` (admin/owner). Registry reads are `whatsapp:read`.
- `category` → default `sendClass` (UTILITY/AUTH → `TRANSACTIONAL`, MARKETING → `MARKETING`); the send call
  may still pass `sendClass` explicitly (it is required), and the consent check keys off it (§6).

---

## 6. Compliance seams (encoded, default-safe — see POPIA §7b, do NOT block)

| Seam | Where it lives | Default | Behaviour |
|---|---|---|---|
| **Sub-processor enable flag** (LIVE 360dialog gate) | `WhatsAppChannel.enabled` (per-business) | **`false`** | LIVE send/receive held; **sandbox path always on**. Channel ships **dark** until the 360dialog DPA + EU-pin + risk assessment clear (EA-ADR-015 extension). |
| **Consent enforcement point** | a single server-side check before non-transactional/template send, wired to M1 `Consent`/`ConsentRevocation` | **default-DENY** | No non-transactional/template send without a recorded grant. Stubbed until the §7 ruling. `Customer.consentId` stays **nullable**. |
| **Transactional vs marketing classification** | `Message.sendClass` (`SendClass`) — required input on send | none (must be supplied) | The two classes are **never collapsed** — the ruling may give them different lawful bases. Consent check branches on it. |
| **Message/Conversation retention** | a **config value** (Setting `whatsapp.message.retentionDays`, no secret) | **unset → no auto-purge** | Purge `Message.body` (+ soft-delete) per the ruled period; **not hard-coded** (POPIA §6/§7b). `deletedAt` is the purge marker. |

> Per the security gate, **the architect MUST rule the async-ack** (done — §3.2) and the contract MUST carry
> the 5 conditions (done — §3.1). The seams above leave the **founder/compliance rulings open** without
> blocking the sandbox build (POPIA §7b: M3-A build is NOT gated).

---

## 7. New enums

| Enum | Values |
|---|---|
| `WhatsAppChannelMode` | `SANDBOX`, `LIVE` |
| `ConversationStatus` | `OPEN`, `ARCHIVED` |
| `MessageDirection` | `INBOUND`, `OUTBOUND` |
| `MessageType` | `TEXT`, `IMAGE`, `DOCUMENT`, `AUDIO`, `VIDEO`, `LOCATION`, `CONTACTS`, `TEMPLATE`, `INTERACTIVE`, `STATUS`, `UNSUPPORTED` |
| `MessageStatus` | `RECEIVED`, `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED` |
| `SendClass` | `TRANSACTIONAL`, `MARKETING` |
| `InboundEventStatus` | `PENDING`, `PROCESSING`, `PROCESSED`, `UNROUTED`, `FAILED` |
| `TemplateCategory` | `UTILITY`, `MARKETING`, `AUTHENTICATION` |
| `TemplateStatus` | `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `PAUSED`, `DISABLED` |

---

## 8. New audit `(entity, action)` tuples

| entity | action(s) |
|---|---|
| `whatsapp_message` | `RECEIVE`, `SEND` |
| `whatsapp_webhook` | `VERIFY_FAILED`, `UNROUTED` |
| `whatsapp_channel` | `CREATE`, `UPDATE` (incl. `enabled` toggle), `DELETE` |
| `whatsapp_template` | `CREATE`, `UPDATE`, `DELETE` |

All carry **masked metadata only** (control 4). (Extend the M1 audit contract in `docs/SCHEMA.md`
§ AuditLog.)

---

## 9. API contract (M3-A)

### 9.1 Inbound webhook — PUBLIC at the edge (NOT under `:businessId`; tenant resolved server-side)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/v1/webhooks/whatsapp` | **Public** | Subscription verify / hub-challenge handshake |
| POST | `/v1/webhooks/whatsapp` | **Public + HMAC signature** | Inbound messages + status callbacks |

**`GET` (subscription verify)** — Meta/360dialog hub-challenge: query `hub.mode=subscribe`,
`hub.verify_token`, `hub.challenge`. If `hub.verify_token` === `Setting whatsapp.webhook.verifyToken`
(constant-time), **echo `hub.challenge` as `200 text/plain`**; else `403`. (This route is NOT JSON-enveloped
— it must return the raw challenge string, per Meta's contract.)

**`POST` (ingest)** — pipeline §3.1. Responses:
- `200 { "ok": true }` — accepted (signature verified, event persisted; processing is async). **Fast-ack.**
- `401` — signature verification failed (audited `VERIFY_FAILED`). No body parse, no persist.
- `429` — edge rate-limit exceeded.
- Idempotent: a redelivered `providerEventId`/`providerMessageId` still returns `200` (no-op).
- This route is exempt from the standard auth/cookie/CSRF guards (no Inyuku caller) but **subject to the
  signature check + rate-limit**. It is **excluded from the `*.inyuku.co.za` CORS lock** (server-to-server).

### 9.2 Tenant-scoped routes — under `/v1/businesses/:businessId/*`, access cookie + RBAC

| Method | Path | Permission | Audit |
|---|---|---|---|
| GET | `/whatsapp/channels` | `whatsapp:manage_channel` | — |
| POST | `/whatsapp/channels` | `whatsapp:manage_channel` | `(whatsapp_channel, CREATE)` |
| PATCH | `/whatsapp/channels/:id` | `whatsapp:manage_channel` | `(whatsapp_channel, UPDATE)` — incl. `enabled`, `mode` |
| GET | `/whatsapp/conversations` | `whatsapp:read` | — |
| GET | `/whatsapp/conversations/:id` | `whatsapp:read` | — (includes `windowState` + `windowExpiresAt`) |
| GET | `/whatsapp/conversations/:id/messages` | `whatsapp:read` | — (paginated; `body` is PII) |
| POST | `/whatsapp/conversations/:id/messages` | `whatsapp:send` | `(whatsapp_message, SEND)` — server picks free-form vs template by window; `sendClass` required; consent + `enabled` gates apply |
| GET | `/whatsapp/templates` | `whatsapp:read` | — |
| POST | `/whatsapp/templates` | `whatsapp:manage_channel` | `(whatsapp_template, CREATE)` |
| PATCH | `/whatsapp/templates/:id` | `whatsapp:manage_channel` | `(whatsapp_template, UPDATE)` |
| DELETE | `/whatsapp/templates/:id` | `whatsapp:manage_channel` | `(whatsapp_template, DELETE)` |

All `/v1/businesses/:businessId/whatsapp/*` routes resolve and enforce the tenant `businessId`; cross-tenant
→ 403/404. Response envelope per `docs/API.md`.

**Send request body (POST .../messages)**
```json
{
  "type": "TEXT",
  "sendClass": "TRANSACTIONAL",
  "body": "Your order is ready for collection.",
  "templateName": null,
  "templateParams": null,
  "language": "en"
}
```
| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `MessageType` | Yes | `TEXT` (free-form) or `TEMPLATE` |
| `sendClass` | `SendClass` | **Yes** | `TRANSACTIONAL` / `MARKETING` — never inferred (§6) |
| `body` | string | for free-form | PII; ignored for `TEMPLATE` |
| `templateName` | string | for templates | must resolve an `APPROVED` `WhatsAppTemplate` (§5) |
| `templateParams` | object | for templates | must satisfy the template `paramSchema` |
| `language` | string | for templates | template locale |

**Send responses:** `200` (queued/sent) · `409 whatsapp_window_closed` (free-form outside window) ·
`422 whatsapp_template_invalid` / `whatsapp_channel_disabled` · `403 whatsapp_consent_denied` (default-deny
stub) — all via the standard error envelope.

---

## 10. New permissions + role-map deltas

| Permission | Grants |
|---|---|
| `whatsapp:read` | Read channels' conversations, messages, templates |
| `whatsapp:send` | Send a WhatsApp message (free-form/template), subject to window + consent + enable gates |
| `whatsapp:manage_channel` | Provision/configure `WhatsAppChannel` (incl. `enabled`/`mode`) + manage the template registry |

**Role-map deltas (M3-A):**
- **`MERCHANT_OWNER`** — all three (`whatsapp:read`, `whatsapp:send`, `whatsapp:manage_channel`).
- **`MERCHANT_STAFF`** — `whatsapp:read` + `whatsapp:send` (Sipho runs the conversation), **NOT**
  `whatsapp:manage_channel` (channel/template/sub-processor-enable config is owner-only — mirrors the M2
  cost-split principle: staff operate, owner configures).
- **`AI_AGENT`** — **`whatsapp:read` only** (read-only commerce/channel surface, EA-ADR-012). **No
  `whatsapp:send`**, no `whatsapp:manage_channel`. (M3 has no AI on the WhatsApp surface anyway — rule-based
  only; this keeps the principal least-privilege for M5.)
- `ADMIN` / `SUPPORT` — platform-scoped reads as already defined; no per-tenant WhatsApp send.

---

## 11. Env / Settings additions (consistent with the M1 env contract)

### Runtime env vars (DevOps-owned `.env.example`)

| Var | Purpose |
|---|---|
| `WHATSAPP_BSP_BASE_URL` | 360dialog API base (sandbox vs live base) |
| `WHATSAPP_INBOUND_DRAIN_INTERVAL_MS` | Outbox sweeper interval (default e.g. 1000ms) |

> `TRUSTED_PROXY_HOPS` (existing, M1-B) governs the webhook edge rate-limit `req.ip` keying — must be set
> correctly in prod (M1-B prod-deploy gate).

### DB-backed Settings (encrypted when `isSecret`)

| Setting key | Secret? | Notes |
|---|---|---|
| `whatsapp.webhook.appSecret` | **Yes** | HMAC-SHA256 key for `X-Hub-Signature-256` verify (control 1) |
| `whatsapp.webhook.verifyToken` | **Yes** | Subscription hub-challenge verify token (control 1) |
| `dialog360.apiKey` | **Yes** | **Existing** — outbound BSP send key (already in `docs/API.md` §Settings) |
| `whatsapp.message.retentionDays` | No | Retention purge period — **config value, not hard-coded** (§6/POPIA §7b); unset → no auto-purge |

Secrets are AES-256-GCM (`enc:v1:`), key from the Railway-secret `ENCRYPTION_KEY` (separate trust boundary,
ADR-INY-011). **Never env-plaintext, never in code, never returned by any API, never in the client bundle.**

---

## 12. Decisions frozen for M3-A (see `docs/DECISIONS.md`)

- **ADR-INY-017** — inbound webhook async-ack via a **durable Postgres outbox** (`WhatsAppInboundEvent`),
  **not** a new BullMQ queue (respects ADR-007 scope; load-shedding-resilient).
- **ADR-INY-018** — inbound idempotency on the **provider message/event id** (`@@unique([businessId,
  providerMessageId])` + event-level `providerEventId` unique), **distinct** from the M2 client-`clientId`
  convention (ADR-INY-016).
- **ADR-INY-019** — **server-side tenant routing** via an Inyuku-owned `phoneNumberId → businessId`
  (`WhatsAppChannel`) map; **never trust a payload tenant field**; routing after signature verify; unmapped
  → reject + audit.
- **ADR-INY-020** — approved-template registry is **table-backed** (`WhatsAppTemplate`), not Setting-backed
  (per-tenant, parameterised, status-tracked, RBAC-/audit-able).

## 13. Compliance / security routing

- Security: `docs/THREAT-MODEL.md` §7 — **APPROVED-WITH-CONDITIONS**; the 5 conditions are baked into §3/§6
  above. Live-number cutover re-gates under EA-ADR-015 (360dialog DPA + EU-pin) and the §7 consent ruling.
- Compliance: `docs/POPIA.md` §7b — `Message`/`Conversation` PII added to the register; **360dialog = new
  sub-processor (gated, ships dark)**; consent enforcement **default-deny stub**; retention is a **config
  value (TBD with bukani-compliance)**. **M3-A build is NOT gated** (sandbox-first, zero production PII).
