# Inyuku Digital — Database Schema (SCHEMA.md)

> **Owner:** bukani-docs · **Source of truth:** Prisma (`schema.prisma`). This doc is the human-readable
> mirror of the **M1 baseline** schema produced by bukani-architect (2026-06-19). When Prisma and this doc
> disagree, **Prisma wins** — file a docs fix.
> **Stack:** Fastify 5 (TypeScript) + **Prisma 6** on Railway Postgres 16 (EU). See `docs/API.md`, `CLAUDE.md`.

## Conventions (apply to every table)

- **Naming.** Prisma models are PascalCase; every model carries a snake_case `@@map` (e.g. `User` →
  `users`, `RefreshToken` → `refresh_tokens`). Columns map to snake_case in the DB.
- **Money.** All monetary amounts are **`Int` ZAR cents** — never `Float`/`Decimal`. (No money columns exist
  in the M1 baseline; the rule is stated here so it holds as commerce tables land in M2+.)
- **Multi-tenancy.** `Business` is the **tenant root**. The `businessId` FK is:
  - **non-null** on tenant-scoped tables (`Membership`, `Setting`, `Consent`, `AiUsage`, …),
  - **nullable** on governance/cross-tenant tables (`AuditLog`, `ErrorLog`, `Permission`) — these may record
    platform-level events with no business in scope,
  - **absent** on `Lead` — leads are captured **pre-tenant** (a visitor is not yet a business).
- **Tenant isolation** is enforced at the route/query layer against the resolved `businessId`
  (permission-RBAC; cross-tenant access → 403/404). See `docs/API.md` § Permission model.
- **Timestamps.** `createdAt` / `updatedAt` (snake_case `created_at` / `updated_at`), UTC.
- **Soft-delete.** Governance/audit rows (`AuditLog`, `ErrorLog`) are **append-only / immutable** — never
  updated or deleted. Tenant entities use **status enums** (e.g. `UserStatus`, `BusinessStatus`,
  `ConsentStatus`, `LeadStatus`) rather than hard deletes where a lifecycle exists; consent withdrawal is
  modelled additively via `ConsentRevocation`, not by deleting the `Consent` row.
- **Secrets at rest.** `Setting` rows flagged `isSecret = true` are stored AES-256-GCM-encrypted with the
  `enc:v1:` value prefix (ADR-INY-011); the encryption key is a separate trust boundary (`ENCRYPTION_KEY`).

---

## Enums

| Enum | Values |
|---|---|
| `MembershipRole` | `MERCHANT_OWNER`, `MERCHANT_STAFF`, `ADMIN`, `SUPPORT`, `AI_AGENT` |
| `UserStatus` | account lifecycle (active / suspended / etc.) |
| `BusinessStatus` | tenant lifecycle (active / suspended / etc.) |
| `ConsentStatus` | consent lifecycle (granted / revoked / etc.) |
| `LeadSource` | `CONTACT`, `IMPACT_REPORT`, `SHARE_STORY` |
| `LeadStatus` | lead lifecycle (`NEW` on create → triaged) |

> `AI_AGENT` is the least-privilege principal for the tool-using Business Agent — **read + `ai:invoke`
> only**, no writes (EA-ADR-012). See `docs/API.md` § role map.

---

## Identity & auth tables

### Table: User
**Purpose:** Person/principal accounts (merchants, staff, platform admins, support).
**PII fields:** email, name, phone (see `docs/POPIA.md`).
**Tenancy:** no `businessId` — a user joins one or more businesses via `Membership`.
- Belongs to many: `Business` (via `Membership`).
- Has many: `RefreshToken`, `PasswordResetToken`, `PhoneOtp`.
- Auth: bcrypt-12 password hash, never returned. Status via `UserStatus`.

### Table: RefreshToken
**Purpose:** Opaque refresh tokens for the access/refresh split (ADR-INY-009).
- Stored as **sha256 of the opaque token** (never the raw token), 30-day lifetime.
- Carries a **`familyId`** for rotation + **reuse-detection** — presenting a rotated/old token revokes the
  **whole family**.
- Belongs to: `User`. **Append + revoke** semantics (rotated tokens are marked, not silently dropped).

### Table: PasswordResetToken
**Purpose:** Single-use password-reset tokens (reset-request → reset-confirm flow).
- Hashed at rest, short TTL, single-use. Belongs to: `User`.

### Table: PhoneOtp
**Purpose:** Phone OTP challenges (request/verify), **Redis-backed** flow with a DB record.
**PII fields:** phone (see POPIA). Belongs to: `User` (or pending signup). Short TTL, attempt-limited.

---

## Tenant & access tables

### Table: Business
**Purpose:** **Tenant root.** A merchant business/organisation; every tenant-scoped row hangs off it.
**Tenancy:** the root — `businessId` elsewhere FKs here.
- Has many: `Membership`, `Setting`, `Consent`, `AiUsage`. Status via `BusinessStatus`.

### Table: Membership
**Purpose:** Join of `User` ↔ `Business` carrying the access grant.
**Tenancy:** `businessId` **non-null**.
- Fields of note: `role` (`MembershipRole`) supplying default permissions, plus an explicit
  **`permissions[]`** list unioned with the role defaults (ADR-INY-010).
- Belongs to: `User`, `Business`. Unique on (`userId`, `businessId`).

### Table: Permission
**Purpose:** Registry of the discrete permission keys the route guard checks against.
**Tenancy:** `businessId` **nullable** (governance/registry). See `docs/API.md` § Permission registry for
the full key list.

---

## Governance / observability tables (append-only)

### Table: AuditLog
**Purpose:** Immutable record of security/governance-relevant actions. Append-only.
**Tenancy:** `businessId` **nullable** (platform-level events have no business in scope).
- Captures actor, `(entity, action)`, target, and context. **Never updated or deleted.**
- Audit-event `(entity, action)` tuples emitted in M1:
  | entity | action(s) | emitted when |
  |---|---|---|
  | `auth` | `SIGNUP`, `LOGIN`, `LOGOUT`, `REFRESH`, `PASSWORD_RESET` | auth lifecycle events |
  | `business` | `UPDATE`, `SUSPEND` | business mutated / platform suspend |
  | `member` | `INVITE`, `UPDATE`, `REMOVE` | membership changes |
  | `settings` | `UPDATE` | a Setting changed (secret values masked in the diff) |
  | `consent` | `CREATE`, `REVOKE` | consent granted / revoked |
  | `lead` | `CREATE`, `UPDATE` | lead captured / triaged |
  | `ai` | `INVOKE` | an AI gateway call |

  > The tuple set is the audit contract; new entities/actions are added as modules land — keep this table
  > and the route handlers in sync.

### Table: ErrorLog
**Purpose:** Captured server errors for triage (paired with Sentry). Append-only.
**Tenancy:** `businessId` **nullable**.
- Stores error class/code/message, request context, `GIT_COMMIT_SHA`. PII-masked (POPIA).

---

## Settings table

### Table: Setting
**Purpose:** **Unified** DB-backed config + secrets store — replaces the chassis `AppSetting` +
`notification_channel_configs` split (ADR-INY-011).
**Tenancy:** `businessId` **non-null** for tenant settings (platform-bootstrap settings may use a reserved
scope per the loader).
- Key columns: `key`, `value`, **`isSecret`** (bool). When `isSecret = true`, `value` is AES-256-GCM
  encrypted with the `enc:v1:` prefix and is **never returned in plaintext** unless the caller holds
  `settings:read_secret` (otherwise masked).
- Known secret keys (`isSecret = true`): `email.resend.apiKey`, `sms.bulksms.tokenId`,
  `sms.bulksms.tokenSecret`, `ai.apiKey`, `tradesafe.clientId` *(M4)*, `tradesafe.clientSecret` *(M4)*,
  `dialog360.apiKey` *(M3)*.
- Known non-secret keys: `ai.enabled` (kill switch), `ai.tier.classify`, `ai.tier.agent`,
  `ai.tier.complex`.

---

## Consent tables

### Table: Consent
**Purpose:** Consent ledger — records a data subject's grant for a given purpose. Additive (not deleted).
**PII fields:** linked subject identifier (see POPIA). **Tenancy:** `businessId` **non-null**.
- Status via `ConsentStatus`. Withdrawal recorded additively in `ConsentRevocation` — the original grant row
  is retained for the audit trail.

### Table: ConsentRevocation
**Purpose:** Records the withdrawal of a previously granted `Consent` (append-only).
- Belongs to: `Consent`. Created by the `POST .../consents/:id/revoke` route; emits `(consent, REVOKE)`.

---

## AI usage table

### Table: AiUsage
**Purpose:** Per-call AI cost/usage log behind the `lib/ai.js` gateway (ADR-002, EA-ADR-011).
**Tenancy:** `businessId` **non-null**.
- Captures feature, tier (`classify`/`agent`/`complex`), tokens, cost (Int cents), timestamp. Backs the
  R3,000/mo ceiling, the kill switch reporting, and `GET .../ai-usage`.

---

## Lead table (pre-tenant)

### Table: Lead
**Purpose:** Public lead capture from the marketing site — contact, impact-report requests, shared stories.
**PII fields:** name, email, message/payload, **ip**, **ua** (user agent) (see POPIA). **Tenancy:** **no
`businessId`** — leads predate any business.
- Fields of note: `source` (`LeadSource`), `status` (`LeadStatus`, `NEW` on create), captured
  `ip` / `ua` / consent flag, and a `payload` for the variable `share_story` shape.
- Created by the **public `POST /v1/leads`** route (discriminated by `source`); triaged via
  `PATCH /v1/admin/leads/:id`. Emits `(lead, CREATE)` / `(lead, UPDATE)`. See `docs/API.md` § /v1/leads.

---

## Relationship summary

```
User 1──* Membership *──1 Business (tenant root)
User 1──* RefreshToken (familyId rotation)
User 1──* PasswordResetToken
User 1──* PhoneOtp
Business 1──* Setting | Consent | AiUsage
Consent 1──* ConsentRevocation
Permission (registry; business-nullable)
AuditLog | ErrorLog (append-only; business-nullable)
Lead (standalone; no businessId)
```
