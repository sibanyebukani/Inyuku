# M3-A — WhatsApp BSP Plumbing Implementation Plan

> **For agentic workers (KIMI):** Build this slice phase-by-phase, then STOP for Claude Code validation.
> The **frozen contract is `docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`** — when this plan and the
> contract differ, the contract wins. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the server-side WhatsApp BSP plumbing — a signature-verified, replay-safe, idempotent
inbound webhook; tenant routing; `Conversation`/`Message` persistence via a durable Postgres outbox + async
drain; outbound send (free-form + template) gated by the 24h session window, consent, and the sub-processor
enable flag; and an approved-template registry — **sandbox-first, no commerce logic.**

**Architecture:** Backend-only (Fastify 5 + Prisma 6 + Postgres 16 + Redis 7), modelled on the existing M1/M2
chassis. Inbound follows a strict fail-closed pipeline (raw-body → HMAC verify → edge rate-limit → persist to
`WhatsAppInboundEvent` outbox → **fast 200**), then an interval sweeper drains the outbox async: resolve
tenant (server-side `phoneNumberId → businessId` map, **never** payload-trusted) → upsert `Conversation` →
dedup-insert `Message`. Outbound send is server-side only, chooses free-form vs template by window state, and
passes through the consent + enable-flag gates. 360dialog is reached via a thin BSP client pointed at a
sandbox base URL.

**Tech Stack:** TypeScript, Fastify 5, Prisma 6, Postgres 16, Redis 7 (ioredis), `@fastify/swagger` +
`fastify-type-provider-zod`, Zod, Vitest. Reuse chassis utils: `utils/audit-logger.ts`, `utils/crypto.ts`,
`utils/pii-mask.ts`, `utils/rate-limit.ts`, `utils/logger.ts`, `utils/route-helpers.ts`, `utils/errors.ts`,
`utils/client-ip.ts`, `services/settings.service.ts`, `middleware/auth.middleware.ts`,
`middleware/require-permission.ts`, `auth/permissions.ts`.

---

## Global Constraints (every task inherits these — copied from the frozen contract + project non-negotiables)

- **Sandbox-first / ships dark.** No production PII, no live number. `WhatsAppChannel.enabled` defaults
  **`false`**; LIVE send/receive is held when `enabled=false`; the **sandbox path is always available**.
- **Security gate conditions are NON-NEGOTIABLE** (THREAT-MODEL §7, APPROVED-WITH-CONDITIONS):
  1. **Signature verify before parse, fail-closed.** HMAC-SHA256 over the **raw** body vs
     `X-Hub-Signature-256` (`sha256=<hex>`), **constant-time compare**, `401` + audit
     `(whatsapp_webhook, VERIFY_FAILED)` **before any JSON parse or DB write**. Capture raw body before
     body-parsing (scoped to the webhook route only). Secret from encrypted `Setting`
     `whatsapp.webhook.appSecret` — never env-plaintext, never in code, never in a response.
  2. **Provider-id idempotency.** Event dedup on `WhatsAppInboundEvent.providerEventId` (unique); message
     dedup on `Message @@unique([businessId, providerMessageId])`; both `ON CONFLICT DO NOTHING`. **This is
     distinct from the M2 `clientId` convention — do not reuse `clientId` here.** Advisory ±5-min replay
     window where a trustworthy provider timestamp exists.
  3. **Server-side tenant routing only.** Resolve tenant via `phoneNumberId → WhatsAppChannel.businessId`,
     **after** verification. **Never read `businessId` or any tenant field from the payload.** Unmapped
     `phoneNumberId` → `UNROUTED` + audit `(whatsapp_webhook, UNROUTED)`, **no auto-provision**.
  4. **PII-masked logging.** Raw `Message.body` and customer phone numbers are **never** logged. Log/audit
     masked metadata only (`providerMessageId`, `direction`, masked msisdn, `businessId`, `type`).
  5. **Fast-ack then async.** Webhook persists the verified event durably, returns `200` immediately; heavy
     work runs in the outbox drainer.
- **Multi-tenancy:** `businessId` FK on every M3-A table (except `WhatsAppInboundEvent.businessId` which is
  **nullable** — set by the drainer after routing). All `/v1/businesses/:businessId/whatsapp/*` routes
  resolve + enforce the tenant; cross-tenant → 403/404.
- **RBAC:** `whatsapp:read` / `whatsapp:send` / `whatsapp:manage_channel`. OWNER = all three; STAFF = read +
  send (NOT manage_channel); AI_AGENT = read only (no send/manage). Use `app.requirePermission`.
- **Compliance seams (default-safe, do NOT block the build):** sub-processor enable flag
  (`WhatsAppChannel.enabled`, default off); consent enforcement point (**default-DENY stub** before any
  non-transactional/template send, wired to M1 `Consent`/`ConsentRevocation`; `Customer.consentId` stays
  nullable); `sendClass` (`TRANSACTIONAL`/`MARKETING`) **required on every send, never inferred**, two
  branches never collapsed; retention as the config `Setting whatsapp.message.retentionDays` (unset → no
  auto-purge), **not hard-coded**.
- **Async-ack = durable Postgres outbox** (`WhatsAppInboundEvent`) drained by an interval sweeper
  (`FOR UPDATE SKIP LOCKED`) — **NOT a new BullMQ queue** (ADR-INY-017; respects ADR-007 scope).
- **No money in M3-A** (commerce is M3-B). **No `Order`/`StockMovement`/`Customer` writes from a webhook.**
  **No AI / no `lib/ai.js`** (rule-based only; nothing on the WhatsApp surface in M3).
- **Conventions:** PascalCase Prisma model + snake_case `@@map` + snake_case columns; `cuid` PKs;
  `createdAt`/`updatedAt`; response envelope + error codes per `docs/API.md`; new audit `(entity, action)`
  tuples per contract §8; OpenAPI contract + CI drift check stays green.
- **CI discipline:** all gates green **on Node 20** (`.nvmrc`) — `typecheck`, `lint`, `test`, `build`,
  `openapi:check`. **Regenerate `package-lock.json` under Node 20** if and only if deps change. Verify the
  ACTUAL GitHub Actions run is green, not just local.
- **Branch:** work on a feature branch in **your own git worktree/clone** (e.g.
  `git worktree add ../inyuku-m3a feature/m3a-bsp-plumbing`) so your git ops never collide with the
  validator's. Commits end with the trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do NOT merge — hand back for
  validation.

---

## File Structure

- **Schema:** `server/prisma/schema.prisma` (add 5 models + 9 enums); new migration under
  `server/prisma/migrations/`; optionally extend `server/prisma/seed.ts` (a dev SANDBOX channel).
- **Permissions:** `server/src/auth/permissions.ts` (add 3 perms + role-map deltas);
  test `server/src/auth/__tests__/permissions.test.ts`.
- **Settings keys / env:** `server/src/services/settings.service.ts` (register new keys);
  `server/.env.example` (new env vars).
- **Signature/raw-body:** `server/src/utils/whatsapp-signature.ts` (+ `__tests__`).
- **BSP client:** `server/src/services/whatsapp-bsp.client.ts` (sandbox-aware outbound) (+ `__tests__`).
- **Domain services:** `server/src/services/whatsapp-ingest.service.ts` (drainer + persist),
  `server/src/services/whatsapp-send.service.ts`, `server/src/services/whatsapp-channel.service.ts`,
  `server/src/services/whatsapp-template.service.ts`, `server/src/services/whatsapp-window.ts`
  (window-state pure fn) (+ colocated `__tests__`).
- **Routes:** `server/src/routes/v1/whatsapp-webhook.routes.ts` (public edge),
  `server/src/routes/v1/whatsapp.routes.ts` (tenant-scoped) (+ `__tests__`).
- **Drainer wiring:** `server/src/services/whatsapp-drainer.ts` (interval worker) started from
  `server/src/app.ts` / `server/src/index.ts`; ensure graceful shutdown.
- **Bootstrap:** `server/src/app.ts` (register routes, scope raw-body parser to the webhook route, exclude
  webhook from the `*.inyuku.co.za` CORS lock, register OpenAPI schemas).

---

## Task 0: Prisma schema + enums + migration

**Files:** Modify `server/prisma/schema.prisma`; create migration; optionally `server/prisma/seed.ts`.

Add models `WhatsAppChannel`, `Conversation`, `Message`, `WhatsAppInboundEvent`, `WhatsAppTemplate` and enums
`WhatsAppChannelMode`, `ConversationStatus`, `MessageDirection`, `MessageType`, `MessageStatus`, `SendClass`,
`InboundEventStatus`, `TemplateCategory`, `TemplateStatus` **exactly per contract §2 + §7** (field names,
nullability, indexes, `@@unique` constraints, `@@map`). Key invariants to get right:
`WhatsAppChannel.phoneNumberId` is **globally unique**; `WhatsAppChannel.enabled` defaults **`false`**;
`Conversation @@unique([businessId, channelId, waContactId])`; `Conversation.customerId` **nullable**;
`Message @@unique([businessId, providerMessageId])` + `@@index([businessId, occurredAt])`;
`WhatsAppInboundEvent.businessId` **nullable**, `providerEventId` unique, `@@index([status, receivedAt])`;
`WhatsAppTemplate @@unique([businessId, name, language])`.

- [ ] Write the models + enums.
- [ ] `cd server && npx prisma format && npx prisma validate`.
- [ ] `npx prisma migrate dev --name m3a_whatsapp_bsp_plumbing` (creates SQL + applies to dev DB).
- [ ] (Optional) seed a dev `WhatsAppChannel` in `SANDBOX` mode, `enabled=false`, for one dev business.
- [ ] Commit.

**Acceptance:** `prisma validate` passes; migration applies cleanly; `prisma generate` types resolve.

---

## Task 1: Permissions + role map

**Files:** `server/src/auth/permissions.ts`; test `server/src/auth/__tests__/permissions.test.ts`.

Add `whatsapp:read`, `whatsapp:send`, `whatsapp:manage_channel` to the registry. Role-map deltas per
contract §10: `MERCHANT_OWNER` → all three; `MERCHANT_STAFF` → read + send (NOT manage_channel); `AI_AGENT`
→ read only; `ADMIN`/`SUPPORT` unchanged (no per-tenant send).

- [ ] **Test first:** assert each role resolves the expected WhatsApp permission set (owner=3, staff=2 no
      manage, ai=1 read-only, staff/ai lack `whatsapp:manage_channel`, ai lacks `whatsapp:send`).
- [ ] Run it; expect FAIL.
- [ ] Add the permissions + role-map entries.
- [ ] Run; expect PASS. Commit.

---

## Task 2: Settings keys + env vars

**Files:** `server/src/services/settings.service.ts`; `server/.env.example`; test under settings `__tests__`.

Register Setting keys per contract §11: `whatsapp.webhook.appSecret` (**secret**),
`whatsapp.webhook.verifyToken` (**secret**), `whatsapp.message.retentionDays` (non-secret). `dialog360.apiKey`
already exists — do not duplicate. Add env vars `WHATSAPP_BSP_BASE_URL`, `WHATSAPP_INBOUND_DRAIN_INTERVAL_MS`
to `.env.example` (documented; the drainer reads the interval, default 1000ms).

- [ ] **Test:** secret keys round-trip through AES-256-GCM (`enc:v1:`) and are never returned in plaintext by
      the settings read path; non-secret key reads back plainly.
- [ ] Implement; run; PASS. Commit.

---

## Task 3: Raw-body capture + HMAC signature verify util

**Files:** Create `server/src/utils/whatsapp-signature.ts` + `__tests__/whatsapp-signature.test.ts`.

`verifySignature(rawBody: Buffer, header: string, appSecret: string): boolean` — HMAC-SHA256, compare against
`sha256=<hex>` using `crypto.timingSafeEqual` (constant-time; length-guard before compare). Plus the Fastify
raw-body capture approach (a content-type parser scoped to the webhook route that retains the raw `Buffer`
before JSON parsing) — document how Task 5 wires it.

- [ ] **Tests:** valid signature → true; tampered body → false; wrong secret → false; missing/garbage header
      → false; constant-time path exercised (length mismatch handled without throw).
- [ ] Implement; run; PASS. Commit.

---

## Task 4: Webhook GET (subscription verify / hub-challenge)

**Files:** Create `server/src/routes/v1/whatsapp-webhook.routes.ts` (GET handler) +
`__tests__/whatsapp-webhook.routes.test.ts`.

`GET /v1/webhooks/whatsapp`: read `hub.mode`, `hub.verify_token`, `hub.challenge`; if
`hub.verify_token === Setting whatsapp.webhook.verifyToken` (constant-time) and `hub.mode=subscribe`, return
the **raw `hub.challenge` string** as `200 text/plain` (NOT JSON-enveloped — Meta requires the raw echo);
else `403`. Public route (no auth/cookie/CSRF guards).

- [ ] **Tests:** matching token → 200 with the exact challenge string + text/plain; wrong token → 403; the
      route is not JSON-wrapped.
- [ ] Implement; run; PASS. Commit.

---

## Task 5: Webhook POST ingest (fast-ack path)

**Files:** Extend `server/src/routes/v1/whatsapp-webhook.routes.ts` (POST) + tests.

Implement pipeline steps 1–6 (contract §3.1) **in order, fail-closed**:
1. Capture raw body (scoped parser from Task 3). 2. Verify signature → on fail `401` + audit
`(whatsapp_webhook, VERIFY_FAILED)` (masked), **no parse, no DB**. 3. Edge rate-limit (Redis, keyed on
`client-ip` honouring `TRUSTED_PROXY_HOPS`, + a global per-edge ceiling) → `429` on exceed. 4. Parse + extract
`providerEventId`, `phoneNumberId`. 5. `INSERT WhatsAppInboundEvent` (`signatureVerified=true`,
`status=PENDING`) `ON CONFLICT(providerEventId) DO NOTHING`. 6. Return `200 { ok: true }` immediately. Route
is exempt from auth/cookie/CSRF and from the CORS lock, but subject to signature + rate-limit. Logging
PII-masked throughout.

- [ ] **Tests (mock Redis + DB or use the test harness):** valid signed event → 200 + one
      `WhatsAppInboundEvent` row (PENDING); bad signature → 401, **zero** rows written, `VERIFY_FAILED`
      audited; duplicate `providerEventId` → 200 no-op (still one row); rate-limit exceeded → 429; no raw
      body/phone in logs.
- [ ] Implement; run; PASS. Commit.

---

## Task 6: Async outbox drainer + ingest persistence

**Files:** Create `server/src/services/whatsapp-ingest.service.ts` (resolve+persist logic) and
`server/src/services/whatsapp-drainer.ts` (interval worker) + tests.

Drainer: claim `PENDING` rows `FOR UPDATE SKIP LOCKED`, mark `PROCESSING`, then per contract §3.1 steps 7–12:
7. Resolve tenant `phoneNumberId → WhatsAppChannel.businessId` (**server-side only**); unmapped →
`status=UNROUTED` + audit `(whatsapp_webhook, UNROUTED)`, stop. 8. Per-tenant Redis rate-limit (keyed on
resolved `businessId`). 9. Upsert `Conversation` `(businessId, channelId, waContactId)`, set
`lastInboundAt = occurredAt` (opens the 24h window). 10. Insert `Message`(s)
`ON CONFLICT(businessId, providerMessageId) DO NOTHING`, `status=RECEIVED`, audit
`(whatsapp_message, RECEIVE)` masked. Apply the advisory ±5-min replay window where a trustworthy provider
timestamp exists (else idempotency is the primary control). 11. Status callbacks → update `Message.status`
(SENT/DELIVERED/READ/FAILED) by `providerMessageId`. 12. Mark event `PROCESSED`; on error increment
`attempts`, set `lastError`, bounded retry, then `FAILED`. Drainer interval from
`WHATSAPP_INBOUND_DRAIN_INTERVAL_MS`; ensure clean start/stop (graceful shutdown).

- [ ] **Tests:** mapped channel → Conversation upserted (lastInboundAt set) + Message persisted (RECEIVED);
      unmapped phoneNumberId → UNROUTED + audited + no Conversation/Message; duplicate providerMessageId →
      single Message; status callback advances Message.status; processing error → attempts increments then
      FAILED after the bound; concurrent claim does not double-process (SKIP LOCKED).
- [ ] Implement; run; PASS. Commit.

---

## Task 7: Session-window pure function

**Files:** Create `server/src/services/whatsapp-window.ts` + `__tests__`.

`windowState(lastInboundAt: Date | null, now: Date): { state: 'OPEN' | 'CLOSED'; windowExpiresAt: Date | null }`
— OPEN iff `now - lastInboundAt < 24h`; CLOSED if null or expired. Pure + deterministic (inject `now`).

- [ ] **Tests:** just-inside 24h → OPEN with correct `windowExpiresAt`; exactly/just-outside 24h → CLOSED;
      null → CLOSED.
- [ ] Implement; run; PASS. Commit.

---

## Task 8: Template registry service + routes

**Files:** `server/src/services/whatsapp-template.service.ts`; template handlers in
`server/src/routes/v1/whatsapp.routes.ts` + tests.

CRUD per contract §9.2: `GET /whatsapp/templates` (`whatsapp:read`), `POST` / `PATCH` / `DELETE`
(`whatsapp:manage_channel`), audited `(whatsapp_template, CREATE|UPDATE|DELETE)`. Enforce
`@@unique([businessId, name, language])`. Provide a validator `assertSendableTemplate(name, language,
params)` that resolves a row with `status=APPROVED` and validates `templateParams` against `paramSchema`
(count + types) → throws the `whatsapp_template_invalid` (422) error otherwise. `category → default sendClass`
mapping helper (UTILITY/AUTH → TRANSACTIONAL, MARKETING → MARKETING).

- [ ] **Tests:** CRUD happy paths + RBAC (read vs manage); non-APPROVED or unregistered template →
      `whatsapp_template_invalid`; param mismatch → `whatsapp_template_invalid`; tenant isolation.
- [ ] Implement; run; PASS. Commit.

---

## Task 9: Channel management service + routes

**Files:** `server/src/services/whatsapp-channel.service.ts`; channel handlers in
`server/src/routes/v1/whatsapp.routes.ts` + tests.

`GET /whatsapp/channels`, `POST`, `PATCH /:id` — all `whatsapp:manage_channel`; audited
`(whatsapp_channel, CREATE|UPDATE)` (incl. `enabled`/`mode` toggles). Enforce global-unique `phoneNumberId`
(surface a clean 409 on collision). **No auto-provision from any webhook path.**

- [ ] **Tests:** create/list/patch happy paths; `enabled` toggle audited; duplicate `phoneNumberId` → 409;
      RBAC (staff/ai cannot manage); tenant isolation.
- [ ] Implement; run; PASS. Commit.

---

## Task 10: 360dialog BSP client (sandbox)

**Files:** Create `server/src/services/whatsapp-bsp.client.ts` + `__tests__`.

Thin outbound client: `sendMessage(channel, payload)` POSTs to `WHATSAPP_BSP_BASE_URL` using
`dialog360.apiKey` (from Settings); returns `{ providerMessageId }`. Sandbox-mode aware. **Fully mockable** —
no real network in tests. The BSP key never leaves the server.

- [ ] **Tests (mocked HTTP):** success returns providerMessageId; non-2xx → typed error surfaced for the send
      service to map to `FAILED` + `ErrorLog`; api key read from Settings, never logged.
- [ ] Implement; run; PASS. Commit.

---

## Task 11: Outbound send service + route

**Files:** `server/src/services/whatsapp-send.service.ts`; send handler in
`server/src/routes/v1/whatsapp.routes.ts` + tests.

`POST /v1/businesses/:businessId/whatsapp/conversations/:id/messages` (`whatsapp:send`), body per contract
§9.2. Enforce, in order:
1. **`sendClass` required** (TRANSACTIONAL/MARKETING) — never inferred.
2. **Enable-flag gate:** if `WhatsAppChannel.mode=LIVE` and `enabled=false` → `422 whatsapp_channel_disabled`
   (sandbox always allowed).
3. **Consent enforcement point (default-deny stub):** for non-transactional/marketing (and template per the
   ruling), check the M1 `Consent`/`ConsentRevocation` ledger; deny → `403 whatsapp_consent_denied`.
   Transactional is a **distinct branch** (do not collapse). Keep the rule isolated so the M3-C ruling can
   replace the stub without touching the send path.
4. **Window selection (server-enforced):** compute window (Task 7). `type=TEXT` while CLOSED →
   `409 whatsapp_window_closed` (offer the template path). `type=TEMPLATE` → `assertSendableTemplate`
   (Task 8) → `422 whatsapp_template_invalid` on failure. The **server** picks free-form vs template — the
   caller does not guess.
5. Create `Message` (OUTBOUND, QUEUED) → call the BSP client (Task 10) → store `providerMessageId`,
   transition `QUEUED → SENT` → audit `(whatsapp_message, SEND)` masked. On BSP failure → `FAILED` +
   `failureReason` + `ErrorLog`.

- [ ] **Tests:** transactional free-form inside window → 200/SENT; free-form while CLOSED → 409; approved
      template while CLOSED → 200; missing `sendClass` → 400; marketing without consent grant → 403; LIVE +
      disabled → 422; invalid template → 422; BSP failure → Message FAILED + ErrorLog; SEND audited masked.
- [ ] Implement; run; PASS. Commit.

---

## Task 12: Conversation + message read routes

**Files:** Read handlers in `server/src/routes/v1/whatsapp.routes.ts` + tests.

`GET /whatsapp/conversations` (list), `GET /whatsapp/conversations/:id` (include computed `windowState` +
`windowExpiresAt` from Task 7), `GET /whatsapp/conversations/:id/messages` (paginated) — all `whatsapp:read`,
tenant-enforced, envelope per `docs/API.md`. `body` is PII in the payload (allowed in the authorized response;
never in logs).

- [ ] **Tests:** list/detail/messages happy paths; detail includes window fields; pagination; tenant
      isolation (cross-tenant → 403/404); RBAC (no read perm → 403).
- [ ] Implement; run; PASS. Commit.

---

## Task 13: App bootstrap wiring + OpenAPI + drainer lifecycle

**Files:** `server/src/app.ts`, `server/src/index.ts`; OpenAPI/Zod schemas alongside the routes.

Register both route modules; scope the raw-body parser to the webhook route only (do not disturb global JSON
parsing); **exclude `/v1/webhooks/whatsapp` from the `*.inyuku.co.za` CORS lock** and from auth/cookie/CSRF
guards; register Zod/OpenAPI schemas for all new routes so `openapi:check` stays green; start the outbox
drainer on boot and stop it on graceful shutdown (alongside the existing Redis/Prisma lifecycle).

- [ ] Wire registration + drainer start/stop.
- [ ] `npm run openapi:check` (or equivalent) → no drift.
- [ ] Full suite + `typecheck` + `lint` + `build` green **on Node 20**.
- [ ] If deps changed, regenerate `package-lock.json` under Node 20.
- [ ] Commit.

---

## Task 14: Final hardening pass (self-review)

- [ ] Grep for any `console.log`/logger calls that could emit `body` or raw phone numbers → remove/mask.
- [ ] Confirm no webhook path can write `Order`/`StockMovement`/`Customer` (M3-A scope boundary).
- [ ] Confirm no payload field is ever used to resolve `businessId` (control 3).
- [ ] Confirm secrets only ever read via Settings, never returned by any route, never in OpenAPI examples.
- [ ] Confirm `enabled` defaults false and LIVE send is refused when false; sandbox path works.
- [ ] Confirm the consent check is default-deny for marketing and isolated (one function).
- [ ] Run the full backend gate suite on Node 20; verify the **actual GitHub Actions** run is green.
- [ ] Open the PR (do NOT merge). Hand back to Claude Code for validation.

---

## Self-Review (plan author — completed)

- **Spec coverage:** every contract section maps to a task — schema/enums §2/§7 → T0; idempotency/security
  §3 → T3/T5/T6; window §4 → T7/T11; template registry §5 → T8; seams §6 → T2/T9/T11; audit tuples §8 → woven
  into T5/T6/T8/T9/T11; routes §9 → T4/T5/T8/T9/T11/T12; perms §10 → T1; env/Settings §11 → T2/T10/T13;
  ADRs §12 are already frozen. ✓
- **No commerce / no AI** asserted in Global Constraints + T14. ✓
- **Distinct idempotency** (provider-id, not `clientId`) called out in Global Constraints + T0/T5/T6. ✓
- **Type consistency:** field/enum names taken verbatim from contract §2/§7; window fn signature reused in
  T11/T12. ✓
