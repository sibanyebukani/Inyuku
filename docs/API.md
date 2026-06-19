# Inyuku Digital — API Reference (API.md)

> **Owner:** bukani-docs · **Source of truth:** the OpenAPI contract emitted by the backend (CI drift check).
> This doc mirrors the **M1 baseline** contract produced by bukani-architect (2026-06-19). When the OpenAPI
> spec and this doc disagree, **the spec wins** — file a docs fix.
> **Stack:** Fastify 5 (TypeScript) + Prisma 6 on Railway. API host: `api.inyuku.co.za` (provisional, ADR-004).
> See `docs/SCHEMA.md`, `CLAUDE.md`.

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

### Role map (defaults)

| Role | Default posture |
|---|---|
| `MERCHANT_OWNER` | Full tenant control: `business:*`, `member:*`, `settings:read/update`, `audit:read`, `consent:*`, `ai:invoke`, `ai:usage:read`. (`settings:read_secret` explicit-grant.) |
| `MERCHANT_STAFF` | Operational subset: `business:read`, `member:read`, `settings:read`, `consent:read`, `ai:invoke`. |
| `ADMIN` | Platform admin: `platform:business:read/suspend`, `lead:read/update`, `audit:read`, plus tenant reads as scoped. |
| `SUPPORT` | Read-mostly platform support: `platform:business:read`, `lead:read`, `audit:read`. |
| `AI_AGENT` | Read + `ai:invoke` only — **no writes** (EA-ADR-012). |

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
