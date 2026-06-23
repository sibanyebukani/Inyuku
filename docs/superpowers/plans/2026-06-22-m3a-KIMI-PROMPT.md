# KIMI build prompt — M3-A (WhatsApp BSP Plumbing)

> Paste the block below to KIMI SWARM. It builds M3-A phase-by-phase, then STOPS for Claude Code validation.
> Scope is **backend-only, sandbox-first, no commerce logic**. The merchant UI for conversations lands in M3-B.

---

You are building **M3-A — WhatsApp BSP Plumbing** for **Inyuku Digital** (South African informal-merchant
commerce platform). This is the server-side WhatsApp channel foundation: a signature-verified inbound webhook,
tenant routing, `Conversation`/`Message` persistence via a durable Postgres outbox + async drain, outbound
send gated by the 24h session window / consent / sub-processor enable flag, and an approved-template registry.
**Backend only. Sandbox-first. No commerce logic, no AI.**

## Read these first (in order), then follow the plan task-by-task
1. **`docs/superpowers/plans/2026-06-22-m3a-bsp-plumbing.md`** — your implementation plan (Tasks 0–14, with
   exact file paths, TDD steps, and acceptance criteria). Build in task order.
2. **`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`** — the FROZEN architect contract. **When the plan
   and the contract differ, the contract wins.** Field names, enums, indexes, route shapes, error codes, and
   the security pipeline come from here.
3. **`docs/THREAT-MODEL.md` §7** — the 5 security conditions (APPROVED-WITH-CONDITIONS). These are
   non-negotiable.
4. **`docs/POPIA.md` §7b** — the compliance seams (sub-processor enable flag, default-deny consent stub,
   `sendClass`, retention-as-config). Encode the seams; do not implement the open rulings.
5. **`CLAUDE.md`** — stack + conventions. **`docs/API.md`** + **`docs/SCHEMA.md`** — the M1/M2 envelope,
   auth/RBAC, tenancy/money/idempotency conventions your M3-A surface must match.

## Hard rules (failing any of these is a rejected build)
- **Signature verify before parse, fail-closed.** HMAC-SHA256 over the **raw** body vs `X-Hub-Signature-256`,
  constant-time compare, `401` + audit `(whatsapp_webhook, VERIFY_FAILED)` **before any JSON parse or DB
  write**. Secret from encrypted `Setting whatsapp.webhook.appSecret` — never env-plaintext, never in code,
  never in a response.
- **Provider-id idempotency** (`providerEventId` unique; `Message @@unique([businessId, providerMessageId])`,
  `ON CONFLICT DO NOTHING`) — **distinct from the M2 `clientId` convention; do not reuse `clientId`.**
- **Tenant routing is server-side only** (`phoneNumberId → WhatsAppChannel.businessId`, after verify).
  **Never read any tenant/`businessId` field from the payload.** Unmapped → `UNROUTED` + audit, no
  auto-provision.
- **PII-masked logging** — raw `Message.body` and phone numbers are **never** logged; audit carries masked
  metadata only.
- **Fast-ack then async** — persist the verified event to the `WhatsAppInboundEvent` outbox, return `200`,
  process in the interval drainer. **Durable Postgres outbox, NOT a new BullMQ queue** (ADR-INY-017 /
  ADR-007 scope).
- **Multi-tenancy:** `businessId` on every table (except the nullable `WhatsAppInboundEvent.businessId`, set
  by the drainer). All `/v1/businesses/:businessId/whatsapp/*` routes enforce the tenant.
- **RBAC:** OWNER = read+send+manage_channel; STAFF = read+send (no manage); AI_AGENT = read only.
- **Compliance seams (default-safe):** `WhatsAppChannel.enabled` default **false** (LIVE held, sandbox always
  on); consent enforcement = **default-DENY stub** before non-transactional/template send (wired to M1
  `Consent`/`ConsentRevocation`; `Customer.consentId` stays nullable); `sendClass` **required, never
  inferred**, transactional vs marketing branches never collapsed; retention = config Setting
  `whatsapp.message.retentionDays`, not hard-coded.
- **No commerce writes** (`Order`/`StockMovement`/`Customer`) from any webhook path. **No `lib/ai.js` / no AI.**
- Reuse the chassis: `utils/audit-logger.ts`, `utils/crypto.ts`, `utils/pii-mask.ts`, `utils/rate-limit.ts`,
  `utils/logger.ts`, `utils/route-helpers.ts`, `utils/client-ip.ts`, `services/settings.service.ts`,
  `middleware/auth.middleware.ts`, `middleware/require-permission.ts`, `auth/permissions.ts`. Do not
  re-author primitives.

## Workflow
- Work in **your own git worktree/clone** on branch `feature/m3a-bsp-plumbing`
  (`git worktree add ../inyuku-m3a -b feature/m3a-bsp-plumbing`) so your git ops don't collide with the
  validator's.
- **TDD per task:** write the failing test, see it fail, implement minimally, see it pass, commit. Frequent
  commits. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **CI is Node 20** (`.nvmrc`, strict `npm ci`). All gates must pass **on Node 20**: `typecheck`, `lint`,
  `test`, `build`, `openapi:check`. If you change dependencies, **regenerate `package-lock.json` under Node
  20** (not a newer local Node). Confirm the ACTUAL GitHub Actions run is green, not just local.
- Keep `docs/API.md` / `docs/SCHEMA.md` **untouched** — bukani-docs updates those after merge (the M2
  pattern). The contract doc is your source.
- When all 14 tasks are green: open a PR titled `M3-A: WhatsApp BSP Plumbing`, summarize what you built and
  the test evidence, and **STOP — do NOT merge.** Hand back to Claude Code for validation (review + actual-CI
  check) before merge.

## Definition of done
All 14 plan tasks complete; all backend gates green on Node 20; the 5 security conditions and the 4 compliance
seams demonstrably enforced by tests (bad-signature → 401 no-write; unrouted → UNROUTED no-write; duplicate →
no-op; window-closed free-form → 409; LIVE+disabled → 422; marketing-without-consent → 403); no PII in logs;
no commerce/AI in the slice; PR opened, not merged.
