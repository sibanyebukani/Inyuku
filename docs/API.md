# Inyuku Digital — API Reference (API.md)

> **Owner:** bukani-docs · **Source of truth:** the OpenAPI contract emitted by the backend (CI drift check).
> This doc mirrors the **M1 baseline** contract (bukani-architect, 2026-06-19), the **M2 Commerce Core**
> contracts (bukani-architect, 2026-06-21), and the **M3-A WhatsApp BSP plumbing** routes (merged PR #11 /
> `e530574`). When the OpenAPI spec / code and this doc disagree, **the spec/code wins** — file a docs fix.
> **Stack:** Fastify 5 (TypeScript) + Prisma 6 on Railway. API host: `api.inyuku.co.za` (provisional, ADR-004).
> See `docs/SCHEMA.md`, `CLAUDE.md`. **M2 contracts:** `docs/specs/2026-06-21-m2-commerce-core-contracts.md`.
> **M3-A contracts:** `docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`.

## Response envelope

Every endpoint returns the chassis envelope.

**Success:**
```json
{ "ok": true, "data": { } }
```

**Error:**
```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": {} } }
```

- `details` is optional (e.g. Zod field errors).
- Validation is Zod via `fastify-type-provider-zod`.
- Standard error codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403),
  `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL` (500). Cross-tenant access resolves
  to `403`/`404` (no resource-existence leak).

---

## Authentication

In-house JWT + refresh rotation, bcrypt-12, permission-RBAC. **Standalone identity silo — no Bukani SSO**
(ADR-004 / EA-ADR-013). All cookies are set on `COOKIE_DOMAIN` (unset → host-only in dev).

### Cookies

| Cookie | Contents | Flags | Lifetime | Path |
|---|---|---|---|---|
| `inyuku_at` | Access JWT (HS256) | HttpOnly, Secure, SameSite=Lax | **15 min** | `/` |
| `inyuku_rt` | Opaque refresh token (sha256-stored) | HttpOnly, Secure, SameSite=Lax | **30 days** | `/v1/auth` |

- **Access token:** 15-minute HS256 JWT, signed with `JWT_SECRET` (verify also accepts
  `JWT_SECRET_PREVIOUS` for rotation).
- **Refresh token:** 30-day opaque token; only its **sha256** is persisted (`RefreshToken`, ADR-INY-009).
- **Rotation + reuse-detection:** every `/refresh` issues a new token in the same **`familyId`** and
  invalidates the old one. Presenting an already-rotated token = **reuse** → the **entire family is revoked**
  (forces full re-login).
- **Logout** clears both cookies **server-side** and revokes the refresh family.

### Auth hardening

- **Escalating lockout:** 5 failures → 15 min · 10 → 1 h · 20 → 24 h (Redis-backed).
- **Constant-time** login comparison; **no email enumeration** (uniform responses whether or not an account
  exists).

### Auth endpoints (`/v1/auth/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/auth/signup` | No (rate-limited) | Create account. Emits `(auth, SIGNUP)`. |
| POST | `/v1/auth/login` | No (rate-limited, lockout) | Issue `inyuku_at` + `inyuku_rt`. `(auth, LOGIN)`. |
| POST | `/v1/auth/refresh` | Refresh cookie | Rotate tokens (family reuse-detection). `(auth, REFRESH)`. |
| POST | `/v1/auth/logout` | Access cookie | Clear cookies + revoke family. `(auth, LOGOUT)`. |
| POST | `/v1/auth/otp/request` | No (rate-limited) | Send phone OTP (BulkSMS, Redis-backed). |
| POST | `/v1/auth/otp/verify` | No (rate-limited) | Verify phone OTP. |
| POST | `/v1/auth/password/reset-request` | No (rate-limited) | Begin reset (no enumeration). |
| POST | `/v1/auth/password/reset-confirm` | Reset token | Set new password. `(auth, PASSWORD_RESET)`. |
| GET | `/v1/auth/me` | Access cookie | Current principal + memberships. |

**`POST /v1/auth/signup` — request body**

| Field | Type | Required | Validation |
|---|---|---|---|
| email | string | Yes | Valid email |
| password | string | Yes | Min 8 chars (bcrypt-12) |
| name | string | Yes | Max 100 chars |
| phone | string | No | E.164 |

**Success — 201**
```json
{ "ok": true, "data": { "user": { "id": "…", "email": "…", "name": "…" } } }
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid email / password too short |
| 409 | CONFLICT | Email already registered |
| 429 | RATE_LIMITED | Too many attempts |

---

## Permission model

Route-layer **`requirePermission(perm)`** guard over the effective permission set:

```
effective = MembershipRole defaults  ∪  Membership.permissions[]
```

scoped to the **resolved `businessId`** for the request. Tenant isolation is enforced — a permission valid in
one business does not grant access to another (cross-tenant → 403/404). The `AI_AGENT` principal is
**read + `ai:invoke` only** (no writes, EA-ADR-012). (ADR-INY-010.)

### Permission registry

| Permission | Grants |
|---|---|
| `business:read` | Read business profile |
| `business:update` | Update business profile |
| `business:delete` | Delete business |
| `member:invite` | Invite a member |
| `member:read` | List/read members |
| `member:update` | Change a member's role/permissions |
| `member:remove` | Remove a member |
| `settings:read` | Read settings (secrets masked) |
| `settings:update` | Write settings |
| `settings:read_secret` | Read secret setting values in plaintext |
| `audit:read` | Read the audit log |
| `consent:read` | Read consents |
| `consent:write` | Create / revoke consents |
| `lead:read` | Read leads (platform) |
| `lead:update` | Triage leads (platform) |
| `platform:business:read` | Cross-tenant business read (platform) |
| `platform:business:suspend` | Suspend a business (platform) |
| `ai:invoke` | Invoke the AI gateway |
| `ai:usage:read` | Read AI usage/cost |
| `catalog:read` *(M2)* | Read products |
| `catalog:write` *(M2)* | Create / update / archive products + image |
| `catalog:read_cost` *(M2)* | **Owner-only** — read `costPriceCents` / margin |
| `inventory:read` *(M2)* | Read stock levels |
| `inventory:write` *(M2)* | Post stock movements |
| `order:read` *(M2)* | Read orders |
| `order:write` *(M2)* | Create / complete / void orders, set payment state |
| `customer:read` *(M2)* | Read the customer directory |
| `customer:write` *(M2)* | Create / update customers |
| `dashboard:read` *(M2)* | Read the dashboard (non-financial) |
| `dashboard:read_financial` *(M2)* | **Owner-only** — financial dashboard fields |
| `sync:write` *(M2)* | Submit a batch-sync request |
| `whatsapp:read` *(M3-A)* | Read WhatsApp channels, conversations, messages, templates |
| `whatsapp:send` *(M3-A)* | Send a WhatsApp message (free-form/template), subject to window + consent + enable gates |
| `whatsapp:manage_channel` *(M3-A)* | **Owner-only** — provision/configure `WhatsAppChannel` (incl. `enabled` / `mode`) + manage the template registry |
| `whatsapp:manage_autoreply` *(M3-B)* | **Owner-only** — create/update/delete `WhatsAppAutoReplyRule` (the canned greeting/keyword/out-of-hours auto-reply config) |

### Role map (defaults)

| Role | Default posture |
|---|---|
| `MERCHANT_OWNER` | Full tenant control: `business:*`, `member:*`, `settings:read/update`, `audit:read`, `consent:*`, `ai:invoke`, `ai:usage:read`. **M2:** all `catalog:*` (incl. `catalog:read_cost`), `inventory:*`, `order:*`, `customer:*`, `dashboard:read` + `dashboard:read_financial`, `sync:write`. **M3-A:** `whatsapp:read`, `whatsapp:send`, `whatsapp:manage_channel` (all three). **M3-B:** `whatsapp:manage_autoreply` (owner-only). (`settings:read_secret` explicit-grant.) |
| `MERCHANT_STAFF` | Operational subset: `business:read`, `member:read`, `settings:read`, `consent:read`, `ai:invoke`. **M2:** all commerce permissions **EXCEPT** `catalog:read_cost` and `dashboard:read_financial` — i.e. `catalog:read/write`, `inventory:read/write`, `order:read/write`, `customer:read/write`, `dashboard:read`, `sync:write`. (Sipho cannot see cost / margin / financial totals.) **M3-A:** `whatsapp:read` + `whatsapp:send` (operates the conversation), **NOT** `whatsapp:manage_channel` (owner configures the channel/template/enable-flag — mirrors the M2 cost-split: staff operate, owner configures). **M3-B:** captures WhatsApp orders (`order:write` + `sync:write`), shares the catalog and sends status notifications (`whatsapp:send`), and **sees** auto-reply rules fire (`whatsapp:read`), but **NOT** `whatsapp:manage_autoreply` (owner configures auto-replies — same staff-operate / owner-configure split). |
| `ADMIN` | Platform admin: `platform:business:read/suspend`, `lead:read/update`, `audit:read`, plus tenant reads as scoped. No per-tenant WhatsApp send. |
| `SUPPORT` | Read-mostly platform support: `platform:business:read`, `lead:read`, `audit:read`. |
| `AI_AGENT` | Read + `ai:invoke` only — **no writes** (EA-ADR-012). **M2:** read-only commerce — `catalog:read`, `inventory:read`, `order:read`, `customer:read`, `dashboard:read`. **No** `catalog:read_cost`, `dashboard:read_financial`, `sync:write`, or any `*:write`. **M3-A:** `whatsapp:read` only — **no** `whatsapp:send` / `whatsapp:manage_channel` (M3 has no AI on the WhatsApp surface — rule-based only; keeps the principal least-privilege for M5). **M3-B:** unchanged — **no** `whatsapp:manage_autoreply`, no capture, no send (auto-replies are deterministic and never call `lib/ai.js`; the AI principal stays read-only on this surface). |

> The role defaults above are the documented baseline; the authoritative defaults map ships in code with the
> permission registry. Explicit `Membership.permissions[]` entries are unioned on top.

---

## Route list (M1) — auth posture

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/health` | Public | — (liveness) |
| GET | `/ready` | Public | — (readiness: DB/Redis) |
| POST | `/v1/auth/*` | see Auth section | — |
| GET | `/v1/auth/me` | Access cookie | authenticated |
| GET | `/v1/businesses/:businessId` | Access cookie | `business:read` |
| PATCH | `/v1/businesses/:businessId` | Access cookie | `business:update` → `(business, UPDATE)` |
| GET | `/v1/businesses/:businessId/members` | Access cookie | `member:read` |
| POST | `/v1/businesses/:businessId/members` | Access cookie | `member:invite` → `(member, INVITE)` |
| GET | `/v1/businesses/:businessId/settings` | Access cookie | `settings:read` (secrets masked unless `settings:read_secret`) |
| PATCH | `/v1/businesses/:businessId/settings` | Access cookie | `settings:update` → `(settings, UPDATE)` |
| GET | `/v1/businesses/:businessId/audit` | Access cookie | `audit:read` |
| GET | `/v1/businesses/:businessId/consents` | Access cookie | `consent:read` |
| POST | `/v1/businesses/:businessId/consents` | Access cookie | `consent:write` → `(consent, CREATE)` |
| POST | `/v1/businesses/:businessId/consents/:id/revoke` | Access cookie | `consent:write` → `(consent, REVOKE)` |
| GET | `/v1/businesses/:businessId/ai-usage` | Access cookie | `ai:usage:read` |
| GET | `/v1/admin/leads` | Access cookie | `lead:read` |
| PATCH | `/v1/admin/leads/:id` | Access cookie | `lead:update` → `(lead, UPDATE)` |
| POST | `/v1/leads` | **Public** (rate-limited per IP) | — → `(lead, CREATE)` |

All `/v1/businesses/:businessId/*` routes resolve and enforce the tenant `businessId`; a caller without a
matching membership/permission gets 403/404.

---

## Route list (M2 — Commerce Core)

All routes are tenant-scoped under `/v1/businesses/:businessId/*` and require an access cookie.

| Method | Path | Permission | Audit |
|---|---|---|---|
| GET | `/products` | `catalog:read` | — |
| POST | `/products` | `catalog:write` | `(product, CREATE)` |
| GET | `/products/:id` | `catalog:read` | — |
| PATCH | `/products/:id` | `catalog:write` | `(product, UPDATE)` |
| DELETE | `/products/:id` | `catalog:write` | `(product, DELETE)` — **soft** (→ `ARCHIVED`) |
| POST | `/products/:id/image` | `catalog:write` | `(product, UPDATE)` |
| GET | `/products/:id/stock` | `inventory:read` | — (current stock = `SUM(qtyDelta)`) |
| POST | `/stock-movements` | `inventory:write` | `(stock_movement, CREATE)` |
| GET | `/orders` | `order:read` | — |
| POST | `/orders` | `order:write` | `(order, CREATE)` |
| GET | `/orders/:id` | `order:read` | — |
| POST | `/orders/:id/complete` | `order:write` | `(order, UPDATE)` — auto-decrement (`SALE`) |
| POST | `/orders/:id/void` | `order:write` | `(order, UPDATE)` — reverse (`SALE_REVERSAL`) |
| PATCH | `/orders/:id/payment` | `order:write` | `(order, UPDATE)` — set `PAID` / `UNPAID` |
| GET | `/customers` | `customer:read` | — |
| POST | `/customers` | `customer:write` | `(customer, CREATE)` |
| GET | `/customers/:id` | `customer:read` | — |
| PATCH | `/customers/:id` | `customer:write` | `(customer, UPDATE)` |
| GET | `/dashboard` | `dashboard:read` (financial fields need `dashboard:read_financial`) | — |
| POST | `/sync` | `sync:write` | per-applied-op audit |

### Products — cost-price gating

`costPriceCents` (and any derived margin) is **owner-only**: returned **only** to callers holding
`catalog:read_cost`; omitted/masked for `MERCHANT_STAFF` and `AI_AGENT`. This is the RBAC cost-split for
the Sipho persona (`docs/PERSONAS.md`). `DELETE /products/:id` is a **soft delete** → `status = ARCHIVED`.

### Stock — movements, not a column

There is **no settable stock field**. Stock changes are posted as **`StockMovement`** rows
(ADR-INY-013) and the current level is `SUM(StockMovement.qtyDelta)` (ADR-INY-014).
`POST /stock-movements` records manual `ADJUSTMENT` / `RECEIVE` / `OPENING`; `SALE` / `SALE_REVERSAL`
movements are emitted by order complete/void. **Negative stock is allowed-and-flagged** when it arrives
via offline sync (ADR-INY-015) — never hard-rejected.

### Dashboard — SAST day boundary + financial gating

`GET /dashboard` accepts an optional **`?date`** (defaults to today). The day boundary is computed in
**`Africa/Johannesburg` (SAST)**. Returns today's sales, order count, low-stock items, and catalog
counts. **Financial fields** (revenue / margin totals) are included **only** for callers holding
`dashboard:read_financial` (owner-only).

### Batch sync — offline-first contract

`POST /v1/businesses/:businessId/sync` (permission `sync:write`) accepts **≤ 100 ops** per batch with
**per-op idempotency** and **partial success** — the batch applies what it can and reports a status per
op. Conflict resolution is **last-writer-wins on `occurredAt`** (ADR-INY-016).

**Request op envelope**
```json
{
  "clientId": "c_01H...",
  "entity": "order",
  "op": "create",
  "occurredAt": "2026-06-21T10:00:00.000Z",
  "payload": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `clientId` | string | Yes | Client-generated idempotency key (uniqued per business) |
| `entity` | string | Yes | `product` / `stock_movement` / `order` / `customer` |
| `op` | string | Yes | e.g. `create` / `update` |
| `occurredAt` | string (ISO 8601) | Yes | When it happened on the client; drives LWW |
| `payload` | object | Yes | Entity body for the op |

**Per-op response status** (`SyncOpStatus`): `APPLIED`, `DUPLICATE` (same `clientId` already applied —
no-op), `CONFLICT` (lost the last-writer-wins compare), `REJECTED` (validation/permission failure).

**Success — 200 (partial success is still 200)**
```json
{
  "ok": true,
  "data": {
    "results": [
      { "clientId": "c_01H...", "status": "APPLIED" },
      { "clientId": "c_02J...", "status": "DUPLICATE" },
      { "clientId": "c_03K...", "status": "CONFLICT" }
    ]
  }
}
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Malformed batch / > 100 ops |
| 403 | FORBIDDEN | Missing `sync:write` / cross-tenant |

### M3-B additive fields on `POST /orders` and the sync order-create op

M3-B captures a WhatsApp order as an **ordinary M2 `Order`** — **no new capture endpoint, no new sync op,
no parallel order model** (ADR-INY-024). Both the online `POST /orders` body and the offline `sync`
`entity:"order"` / `op:"create"` `payload` gain **two optional, additive, back-compatible** fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `channel` | enum | No | `IN_PERSON` (default) / `WHATSAPP` / `ONLINE` — a WhatsApp capture sets `WHATSAPP` |
| `conversationId` | string | No | The Conversation→Order linkage seam (SCHEMA `Order.conversationId`); set only for `WHATSAPP` captures |

- When `channel`/`conversationId` are omitted the M2 `IN_PERSON` path is **unchanged**.
- **Tenant isolation (STRIDE §8 Condition 1):** when `conversationId` and/or `customerId` are present, the
  handler MUST load each and reject **403/404** unless `conversation.businessId === customer.businessId ===
  route businessId` **before any write** — never write a cross-tenant link. This applies identically to the
  online and the offline `sync` paths.
- **Customer link/create:** if `customerId` is omitted **and** `conversationId` is supplied, the order
  service resolves/creates the M2 `Customer` from the conversation's `waContactId` (E.164-normalised),
  links it, and back-links `Conversation.customerId` if null. `Customer.consentId` **stays nullable** —
  capturing a transactional sale is not gated on a messaging-consent grant.
- **Typed sync payload (STRIDE §8 Condition 8):** the `sync` order-create op MUST validate its `payload`
  with the **same typed Zod schema as the online `POST /orders` body** (incl. the new optional `channel` /
  `conversationId`) before it reaches `createOrder` — the `z.record(z.unknown())` passthrough is **forbidden
  for the order op**. A payload that fails validation returns that op's status as a per-op failure **without
  failing the batch** (per-op partial-success preserved).
- **Convergence:** `@@unique([businessId, clientId])` on `Order` + LWW-on-`occurredAt` (ADR-INY-016) means a
  capture submitted online then re-submitted on reconnect resolves to `DUPLICATE` — exactly once, never
  duplicated. SALE `StockMovement`s inherit idempotency via their deterministic per-order `clientId`.

---

## Route list (M3-A — WhatsApp BSP plumbing)

> Mirror of the shipped routes (PR #11 / `e530574`) and the frozen M3-A contract. WhatsApp **live messaging
> ships DARK** behind the per-business `WhatsAppChannel.enabled` flag (default `false`) — sandbox-only until
> the 360dialog sub-processor DPA + EU-pin clear (POPIA §7b).

### Inbound webhook — PUBLIC at the edge (tenant resolved server-side; NOT under `:businessId`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/v1/webhooks/whatsapp` | **Public** | Subscription verify / hub-challenge handshake |
| POST | `/v1/webhooks/whatsapp` | **Public + HMAC signature** | Inbound messages + status callbacks |

- **`GET`** — Meta/360dialog hub-challenge: query `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
  If `hub.verify_token` === `Setting whatsapp.webhook.verifyToken` (**constant-time** compare), echoes
  `hub.challenge` as **`200 text/plain`**; else `403 text/plain`. **Not JSON-enveloped** (Meta's contract
  requires the raw challenge string).
- **`POST`** — the security-critical fast-ack pipeline: capture **raw** body → **HMAC-SHA256 verify the raw
  body against `X-Hub-Signature-256` before any parse/DB write** (fail-closed) → edge rate-limit → parse →
  insert the durable outbox row (`WhatsAppInboundEvent`, `ON CONFLICT(providerEventId) DO NOTHING`) →
  **return `200 { ok: true }` fast**; heavy work (tenant routing, `Conversation`/`Message` persistence,
  status callbacks) runs **async** in the outbox drainer.
- Responses: `200 { ok: true }` (accepted; processing async — **fast-ack**); `401 UNAUTHORIZED` (signature
  verify failed — audited `(whatsapp_webhook, VERIFY_FAILED)`, no parse/persist); `400 VALIDATION_ERROR`
  (signature passed but body is not valid JSON); `429 RATE_LIMIT_EXCEEDED` (per-IP or global edge ceiling).
- **Idempotent:** a redelivered `providerEventId` / `providerMessageId` is a no-op (still `200`).
- This route is **exempt** from the standard auth/cookie/CSRF guards and the `*.inyuku.co.za` CORS lock
  (server-to-server), but **subject to the signature check + rate-limit**. Tenant is resolved **only** by
  `phoneNumberId → WhatsAppChannel.businessId` server-side (ADR-INY-019) — never from the payload; unmapped
  → `(whatsapp_webhook, UNROUTED)`.

### Tenant-scoped routes — under `/v1/businesses/:businessId/whatsapp/*`, access cookie + RBAC

| Method | Path | Permission | Audit |
|---|---|---|---|
| GET | `/whatsapp/channels` | `whatsapp:manage_channel` | — |
| POST | `/whatsapp/channels` | `whatsapp:manage_channel` | `(whatsapp_channel, CREATE)` — `201` |
| PATCH | `/whatsapp/channels/:id` | `whatsapp:manage_channel` | `(whatsapp_channel, UPDATE)` — incl. `enabled` / `mode` |
| GET | `/whatsapp/conversations` | `whatsapp:read` | — (paginated: `?page` / `?limit ≤ 100`) |
| GET | `/whatsapp/conversations/:id` | `whatsapp:read` | — (includes computed `windowState` + `windowExpiresAt`) |
| GET | `/whatsapp/conversations/:id/messages` | `whatsapp:read` | — (paginated; `body` is PII) |
| POST | `/whatsapp/conversations/:id/messages` | `whatsapp:send` | `(whatsapp_message, SEND)` — server picks free-form vs template by window; `sendClass` required; consent + `enabled` gates apply |
| GET | `/whatsapp/templates` | `whatsapp:read` | — |
| POST | `/whatsapp/templates` | `whatsapp:manage_channel` | `(whatsapp_template, CREATE)` — `201` |
| PATCH | `/whatsapp/templates/:id` | `whatsapp:manage_channel` | `(whatsapp_template, UPDATE)` |
| DELETE | `/whatsapp/templates/:id` | `whatsapp:manage_channel` | `(whatsapp_template, DELETE)` |

All `/v1/businesses/:businessId/whatsapp/*` routes resolve and enforce the tenant `businessId`; cross-tenant
→ 403/404.

### Send a message — `POST /whatsapp/conversations/:id/messages`

The server chooses free-form vs template **from the 24h window state**, not the caller. `sendClass` is a
**required** input (never inferred). LIVE send requires `WhatsAppChannel.enabled = true` (sandbox always
available).

**Request body**
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
| `sendClass` | `SendClass` | **Yes** | `TRANSACTIONAL` / `MARKETING` — never inferred (compliance seam) |
| `body` | string | for free-form | PII; ignored for `TEMPLATE` |
| `templateName` | string | for templates | must resolve an `APPROVED` `WhatsAppTemplate` |
| `templateParams` | object | for templates | must satisfy the template `paramSchema` |
| `language` | string | for templates | template locale |

**The 24h customer-care session window** — each verified **inbound** message sets
`Conversation.lastInboundAt`, (re)opening a 24h window. `OPEN` (`now - lastInboundAt < 24h`) allows
free-form **or** approved template; `CLOSED` allows **approved template only**. Outbound never opens the
window.

**Send responses / error codes** (standard error envelope):

| Status | Code | When |
|---|---|---|
| 200 | — | Message queued/sent (or, on BSP failure, persisted `FAILED` with an `error: "send_failed"` field) |
| 409 | `whatsapp_window_closed` | Free-form `TEXT` attempted while the window is `CLOSED` (use an approved template) |
| 422 | `whatsapp_template_invalid` | Template not `APPROVED`, unregistered, or `templateParams` don't satisfy `paramSchema` |
| 422 | `whatsapp_channel_disabled` | `LIVE` channel with `enabled = false` (sub-processor enable flag) |
| 403 | `whatsapp_consent_denied` | Non-transactional / template send without a recorded consent grant (default-deny stub) |

---

## Route list (M3-B — Commerce over Chat)

> Source: `docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md` (**FROZEN**; bukani-security
> APPROVED-WITH-CONDITIONS, 2026-06-23). M3-B is **thin on new routes** — most value is UI over the frozen
> M3-A read/send surface + the M2 order/sync paths. **S1 (inbox read), S2 (free-form reply), S7 (status
> notification) add NO new routes** — they are UI over the M3-A `GET …/conversations*` reads and the M3-A
> `POST …/conversations/:id/messages` send (which already auto-picks free-form vs template by window).

All routes are tenant-scoped under `/v1/businesses/:businessId/whatsapp/*` and require an access cookie + RBAC.

| Method | Path | Permission | Audit |
|---|---|---|---|
| POST | `/whatsapp/conversations/:id/share-catalog` | `whatsapp:send` | `(whatsapp_message, SEND)` — composes catalog text from M2 `Product` (sell price only), then dispatches via the single M3-A send |
| GET | `/whatsapp/auto-reply-rules` | `whatsapp:read` | — (staff can **see** rules + that they fired, not edit) |
| POST | `/whatsapp/auto-reply-rules` | `whatsapp:manage_autoreply` | `(whatsapp_autoreply_rule, CREATE)` |
| PATCH | `/whatsapp/auto-reply-rules/:id` | `whatsapp:manage_autoreply` | `(whatsapp_autoreply_rule, UPDATE)` |
| DELETE | `/whatsapp/auto-reply-rules/:id` | `whatsapp:manage_autoreply` | `(whatsapp_autoreply_rule, DELETE)` |

(Order capture rides the existing `POST /orders` + `POST /sync` paths — see *M3-B additive fields* above.)

### Catalog share — `POST /whatsapp/conversations/:id/share-catalog`

A **server-composed, plain ZAR-priced text list** sent via the **single M3-A send choke-point** (ADR-INY-023).
The merchant taps once; the server composes the message from the **live M2 catalog** so no price/RBAC logic
leaks to the client.

**Request body**
```json
{
  "productIds": ["prod_…", "prod_…"],
  "sendClass": "TRANSACTIONAL"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `productIds` | string[] | No | Optional subset; omit = all `ACTIVE` products |
| `sendClass` | `SendClass` | Yes | Sharing in reply to an enquiry inside the window is `TRANSACTIONAL` |

- **Source = live M2 catalog**, filtered to `status = ACTIVE` (archived excluded). **Out-of-stock**
  (`SUM(qtyDelta) <= 0`) is **included but flagged** `"(out of stock)"`.
- **`costPriceCents` is NEVER read** (STRIDE §8 Condition 2): a sell-price-only query — cost/margin absent
  **by omission, never zeroed**. The composed string formats cents to `R{rands}.{cc}` (the wire/UI stays cents).
- **Single send choke-point** (STRIDE §8 Condition 4): dispatched through `sendWhatsAppMessage()` →
  `assertConsentGranted` + window-selection + `WhatsAppChannel.enabled`. Returns the **identical send
  envelope** as `POST …/messages` (the queued `Message`, or `409` / `422` / `403`).

### Auto-reply rules — `…/whatsapp/auto-reply-rules`

Owner-configured (`whatsapp:manage_autoreply`), staff-visible (`whatsapp:read`) deterministic rules
(`WhatsAppAutoReplyRule`, SCHEMA). Auto-replies are **provably non-AI** — the evaluator never imports/calls
`lib/ai.js` (CI grep assertion; STRIDE §8 Condition 6c) — and every fire/suppress is audited
(`(whatsapp_autoreply, FIRE)` / `(whatsapp_autoreply, SUPPRESSED)`, masked).

**Create/update validation:** `KEYWORD` requires `keyword`; `OUT_OF_HOURS` requires `hoursStart`+`hoursEnd`
(valid `HH:mm`, evaluated in **SAST / `Africa/Johannesburg`**); `SEND_TEXT` requires `replyText`;
`SHARE_CATALOG` reuses the share-catalog composition. Rules ship `enabled = false` (opt-in). The evaluator
fires only on a genuine inbound (`direction = INBOUND`, `type ∈ {TEXT, INTERACTIVE}`) and enforces
`cooldownMinutes` / once-per-period from the ledger (STRIDE §8 Condition 7); every send still flows through
the single `sendWhatsAppMessage()` gate (Condition 4).

---

## Public lead capture

### POST /v1/leads
**Description:** Public marketing lead capture. **Discriminated union by `source`.** The Next BFF
`/api/leads` proxies to this endpoint (ADR-001).
**Auth required:** No.
**Rate limited:** Yes (per IP).
**Side effects:** records `ip` / `ua` / consent flag; best-effort **Resend** notification; audits
`(lead, CREATE)`.

**Request body — by `source`**

| `source` | Required fields | Optional |
|---|---|---|
| `contact` | `name`, `email`, `message` | — |
| `impact_report` | `email` | — |
| `share_story` | — | `name?`, `email?`, plus free fields → stored in `payload` |

**Success — 201**
```json
{ "ok": true, "data": { "id": "lead_…", "status": "NEW" } }
```

**Errors**

| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Missing/invalid fields for the given `source` |
| 429 | RATE_LIMITED | Per-IP limit exceeded |

---

## Environment & Settings contract

### Runtime env vars (Railway backend / Vercel frontend)

> **Owned by DevOps in `.env.example` and the deploy targets — this section documents, it does not define.**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres 16 (EU) connection |
| `REDIS_URL` | Redis 7 (cache / rate-limit / OTP) |
| `JWT_SECRET` | Access-token signing (HS256) |
| `JWT_SECRET_PREVIOUS` | Previous access secret (rotation verify) |
| `JWT_REFRESH_SECRET` | Refresh-token signing/derivation |
| `ENCRYPTION_KEY` | 32-byte base64 — AES-256-GCM for secret Settings (separate trust boundary) |
| `BLOB_SIGN_SECRET` | Signed-URL boundary for blobs (separate from `ENCRYPTION_KEY`) |
| `STORAGE_DRIVER` | `r2` (ADR-INY-008) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_ENDPOINT` | Cloudflare R2 (EU) |
| `R2_PUBLIC_BASE_URL` | Public-CDN base for public objects (e.g. product images) |
| `COOKIE_DOMAIN` | Cookie domain (unset → host-only in dev) |
| `CORS_ALLOWED_ORIGINS` | Locked to `*.inyuku.co.za` |
| `RESEND_API_KEY` | Email bootstrap fallback (live key normally in Settings) |
| `SENTRY_DSN` | Error reporting |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry export |
| `GIT_COMMIT_SHA` | Build provenance (stamped on `ErrorLog`) |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend → API base URL |
| `WHATSAPP_BSP_BASE_URL` | 360dialog WABA API base URL (M3-A) |
| `WHATSAPP_INBOUND_DRAIN_INTERVAL_MS` | Outbox drainer sweep interval (M3-A) |
| `WHATSAPP_DRAINER_DISABLED` | Set `true` to kill the inbound drainer (M3-A) |

### DB-backed Settings (encrypted when `isSecret`)

The live, hot-swappable config lives in the `Setting` table (ADR-INY-011). Secret values are AES-256-GCM
encrypted (`enc:v1:` prefix) and masked unless the caller holds `settings:read_secret`.

| Setting key | Secret? | Notes |
|---|---|---|
| `email.resend.apiKey` | Yes | Resend live key (env is bootstrap fallback) |
| `sms.bulksms.tokenId` | Yes | BulkSMS |
| `sms.bulksms.tokenSecret` | Yes | BulkSMS |
| `ai.apiKey` | Yes | `lib/ai.js` provider key |
| `ai.enabled` | No | AI **kill switch** |
| `ai.tier.classify` | No | Model for the `classify` tier |
| `ai.tier.agent` | No | Model for the `agent` tier |
| `ai.tier.complex` | No | Model for the `complex` tier |
| `tradesafe.clientId` | Yes | TradeSafe (M4) |
| `tradesafe.clientSecret` | Yes | TradeSafe (M4) |
| `dialog360.apiKey` | Yes | 360dialog WhatsApp (M3) |
| `whatsapp.webhook.appSecret` | Yes | WhatsApp webhook HMAC secret (M3-A) |
| `whatsapp.webhook.verifyToken` | Yes | Meta/360dialog hub verify token (M3-A) |
| `whatsapp.message.retentionDays` | No | Inbound message retention policy (M3-A) |
