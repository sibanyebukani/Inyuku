# KIMI fix brief — M3-A validation findings (PR #11)

> Paste to KIMI on branch `feature/m3a-bsp-plumbing` (same worktree). These are validation findings from a
> 3-reviewer gate against the frozen contract `docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`. CI is
> green and overall compliance is strong — fix the items below, keep everything else. TDD: add/adjust the
> failing test first where noted. Re-run the full backend gate suite on Node 20. Do NOT merge — hand back.

## FIX 1 — BLOCKER: restore `onDelete: SetNull` on 9 existing relations (schema↔DB drift)

`server/prisma/schema.prisma` lost `onDelete: SetNull` on **9 existing M1/M2 relations** during regeneration
(main has 10 `onDelete: SetNull`; the branch has 1). The migration does NOT `ALTER` those FKs, so the live DB
still has `ON DELETE SET NULL` — schema now disagrees with the DB. Restore the referential action on all of:

- `AuditLog.business`, `AuditLog.user`
- `ErrorLog.business`
- `Consent.user`
- `Customer.consent` (the `consentId` relation)
- `AiUsage.user`
- `StockMovement.order`
- `Order.customer`
- `OrderLine.product`
- `AnalyticsEvent.business`

(Restore exactly as on `main`: `@relation(fields: [...], references: [id], onDelete: SetNull)`.)

**Acceptance:**
- `git show main:server/prisma/schema.prisma | grep -c "onDelete: SetNull"` == the branch count (back to 10
  + the 1 new `Conversation.customer` = 11 if you keep the new one).
- `cd server && npx prisma migrate status` and `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations` (or equivalent) show **no drift** and generate **no new migration** for existing tables. The M3-A migration must remain additive-only (new tables/enums/FKs only; zero `ALTER`/`DROP` on existing tables).
- Commit.

## FIX 2 — HIGH: remove the un-contracted `WhatsAppTemplate → WhatsAppChannel` relation

The frozen §2 keys `WhatsAppTemplate` on `(businessId, name, language)` only — it has **no channel FK**. The
branch added `whatsAppChannelId String?` + `whatsAppChannel WhatsAppChannel?` on `WhatsAppTemplate` (schema
~lines 556–557) and a `whatsappTemplates WhatsAppTemplate[]` back-relation on `WhatsAppChannel` (and on
`Business`). The column is also camelCase, violating the snake_case `@@map`/column convention (§1).

- Remove `whatsAppChannelId` + the `whatsAppChannel` relation from `WhatsAppTemplate`.
- Remove the `whatsappTemplates` back-relation from `WhatsAppChannel` (keep the `Business.whatsappTemplates`
  back-relation — that one is required by the contracted `businessId` FK).
- **Regenerate the M3-A migration** so it does not create `whatsapp_templates_whatsAppChannelId_fkey` or that
  column. (Since the DB hasn't been migrated in prod, regenerate the single M3-A migration cleanly rather than
  stacking a second one.)

**Acceptance:** no `whatsAppChannelId` anywhere in schema or migration; `grep -rn whatsAppChannelId server/prisma` empty; template tests still pass; OpenAPI snapshot regenerated if the template shape changed.

## FIX 3 — HIGH: consent denial must emit the contracted machine code

`server/src/services/whatsapp-send.service.ts` (~line 60) throws `new ForbiddenError('whatsapp_consent_denied')`.
`ForbiddenError` hardcodes `code = 'FORBIDDEN'`, so the envelope emits `{ code: 'FORBIDDEN', message:
'whatsapp_consent_denied' }` — but §9.2 mandates `error.code = 'whatsapp_consent_denied'` (parallel to the
sibling gates `whatsapp_window_closed` / `whatsapp_channel_disabled`, which correctly use
`AppError(code, …, status)`).

- Replace with `throw new AppError('whatsapp_consent_denied', 'WhatsApp consent not granted', 403)` (match the
  AppError signature used at the window/disabled gates in the same file).
- **Fix the test** in `server/src/routes/v1/__tests__/whatsapp.routes.test.ts` (marketing-without-consent
  case) that currently asserts `error: { code: 'FORBIDDEN' }` → assert `error.code === 'whatsapp_consent_denied'`
  and status 403. (The test as written locks in the deviation — that's why CI stayed green.)

**Acceptance:** the marketing-without-consent test asserts the contract code and passes; the two sibling gate
codes still pass.

## FIX 4 — MEDIUM: the ±5-min replay window must not silently drop legitimate inbound

`server/src/services/whatsapp-ingest.service.ts` (~lines 144–148) does a hard `continue` (silent drop, no
audit) on any message whose provider `timestamp` is >5 min from server clock. Contract §3.1 control 2 / §3.2:
the window is **advisory**, **idempotency is the primary control**, and the window applies **only where a
trustworthy provider timestamp exists**. In the target environment (load-shedding drainer backlog, 360dialog
redelivery, clock skew) a >5-min-old provider stamp is normal, legitimate inbound — dropping it silently loses
the customer message AND fails to open the 24h window (so the merchant can't reply), invisibly.

- Do **not** silently drop. Keep idempotency (`ON CONFLICT DO NOTHING`) as the gate. On an out-of-window
  message: still persist it (the unique constraint already prevents double-processing) and **audit/flag** that
  it was outside the advisory window, rather than `continue`-ing.
- At minimum, if you keep any drop path, it MUST emit an audit event so the drop is observable — never silent.
- Note: `parseTimestamp` already falls back to `now` when the stamp is missing/invalid, so the check only ever
  fires on a *present-but-old* stamp — which is exactly the advisory case the contract says not to treat as
  fatal.

**Acceptance:** add a test: an inbound whose provider timestamp is >5 min old is **persisted** (Message row
created, Conversation `lastInboundAt` set) and produces an audit/flag — not dropped. Existing dedup test
(duplicate `providerMessageId` → single row) still passes.

## FIX 5 — LOW: don't surface the raw provider error string to the client

`server/src/routes/v1/whatsapp.routes.ts` (~line 238) returns the raw BSP/provider error string inside
`data.error` on a send failure (HTTP 200, Message `FAILED`). The message-created-as-FAILED + `ErrorLog`
behaviour is correct per §3.3, but the raw provider string may carry internal/PII detail.

- Keep writing the full provider error to `ErrorLog` (server-side), but return a **generic** client-facing
  message in `data` (e.g. `failureReason: 'send_failed'`) — do not echo the raw provider string to the caller.

**Acceptance:** send-failure test asserts the Message is `FAILED` + an `ErrorLog` is written, and the response
`data` does not contain the raw provider error text.

## NOT in this round (ruled by Claude Code as validator)

- **F3 (ingest LIVE-but-disabled gate)** — defence-in-depth: ingest does not refuse a LIVE channel whose
  `enabled=false` (the send path does). **Ruling: fast-follow before any LIVE cutover, NOT a sandbox-merge
  blocker** — M3-A ships dark, there is no LIVE webhook subscription and zero LIVE PII until the 360dialog DPA
  clears. Tracked for the M3 live-cutover gate; do not implement now (it would need a new event status and is
  out of the sandbox slice). If you want to add a cheap guard, an audited skip is acceptable, but it is not
  required to merge.
- **`docs/API.md` (+6)** — accurate and matches §11; leave it (bukani-docs owns it post-merge).

## Definition of done (this round)
FIX 1–5 done; full backend gate suite green **on Node 20** (`typecheck`/`lint`/`test`/`build`/`openapi:check`);
`prisma migrate status` shows no drift; the M3-A migration is additive-only; no `whatsAppChannelId` remains;
the consent test asserts the contract code; the out-of-window inbound is persisted-not-dropped. Push to the
same PR #11 branch and hand back to Claude Code — do NOT merge.
