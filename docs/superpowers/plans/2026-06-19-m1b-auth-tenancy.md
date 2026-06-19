# M1-B: Auth & Tenancy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Inyuku's in-house authentication (JWT access + refresh-rotation with reuse-detection, OTP, password reset), the route-layer permission-RBAC guard, multi-tenant isolation (`Business`/`Membership`), and the tenant-scoped management routes — all against the M1-A Fastify chassis and the frozen contract in `docs/API.md`.

**Architecture:** Builds on the M1-A `server/` package. Adds JWT + cookie + auth-middleware + permission-guard layers (net-new — the DrAppv2 chassis is single-tenant Bearer + role-rank, so adapt its `auth.service`/`jwt` *patterns* but the cookie/refresh/RBAC/tenancy code is new). Everything returns the standard envelope. Money stays integer ZAR cents. The baseline tables (User, RefreshToken, PasswordResetToken, PhoneOtp, Business, Membership, Permission, AuditLog, etc.) already exist from M1-A.

**Tech Stack:** Fastify 5, Prisma 6 (existing client), bcryptjs (existing), jose or node:crypto for JWT (HS256), ioredis (OTP/rate-limit), BulkSMS (existing `sms.ts`), Vitest.

## Global Constraints

- **Contract is `docs/API.md` (auth) + `docs/SCHEMA.md` + architect M1 contract.** Build exactly to it; if ambiguous, STOP and ask.
- **Security behaviours are non-negotiable** (all contract-specified): bcrypt-12; access token 15m HS256 in `inyuku_at`; refresh 30d opaque, **sha256-stored**, in `inyuku_rt` (path `/v1/auth`); **rotation on every refresh**; **reuse-detection revokes the whole family**; constant-time login (dummy-hash compare); **no email enumeration**; escalating lockout 5→15m / 10→1h / 20→24h; OTP hashed + attempt-capped + expiring; password-reset confirm **revokes all refresh families**.
- **Cookies:** `HttpOnly, Secure, SameSite=Lax`; domain from `COOKIE_DOMAIN` (unset → host-only for dev).
- **Tenant isolation is structural:** every tenant-scoped query filters on the guard-resolved `businessId`; services never trust a client-supplied businessId beyond the membership check. Cross-tenant access MUST return 403/404.
- **Audit every mutation** (best-effort, PII-masked) per the `(entity, action)` tuples in `docs/SCHEMA.md`.
- **Seed data only** — EA-ADR-015 prod-PII gate in force.
- Branch `feature/m1b-auth-tenancy` off `main`; TDD; frequent commits; backend gate (typecheck/lint/test/build/openapi:check) green; update `openapi.snapshot.json`.
- **Security review gate:** this is an auth surface — the PR validation includes a `bukani-security` STRIDE review before merge.

## Platform-principal decision (ADR-INY-013 — record in `docs/DECISIONS.md`)

ADMIN/SUPPORT are cross-tenant platform staff with no single merchant business. Decision: seed a singleton **platform-sentinel `Business`** (`slug: "platform"`); ADMIN/SUPPORT hold a `Membership` to it carrying the platform permissions (`platform:business:*`, `lead:*`). Platform routes (`/v1/admin/*`) resolve this sentinel business. AI_AGENT principals get a least-privilege `Membership` in the *merchant* business they serve (read + `ai:invoke` only). Keeps the model uniformly Membership-based (no parallel `platformRole` path).

---

### Task 1: JWT utilities (access + refresh) — ADR-INY-009

**Files:** Create `server/src/utils/jwt.ts`, `server/src/utils/__tests__/jwt.test.ts`

**Interfaces / Produces:**
- `signAccessToken(payload: {sub:string; email:string; memberships:{businessId:string;role:string;permissions:string[]}[]}): string` — HS256, 15m, secret `JWT_SECRET`.
- `verifyAccessToken(token:string): AccessClaims` — throws `AuthError('AUTH_INVALID_TOKEN')` on bad/expired; supports `JWT_SECRET_PREVIOUS` for rotation.
- `generateRefreshToken(): {token:string; tokenHash:string}` — 32 random bytes (token = base64url), `tokenHash = sha256(token)`.
- `hashRefreshToken(token:string): string` — sha256 hex.

- [ ] **Step 1: Test** `jwt.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken } from '../jwt.js'
const base = { sub: 'u1', email: 'a@b.co.za', memberships: [{ businessId: 'b1', role: 'MERCHANT_OWNER', permissions: ['business:read'] }] }
describe('jwt', () => {
  it('signs + verifies an access token round-trip', () => {
    const t = signAccessToken(base); const c = verifyAccessToken(t)
    expect(c.sub).toBe('u1'); expect(c.memberships[0].businessId).toBe('b1')
  })
  it('rejects a tampered token', () => {
    expect(() => verifyAccessToken('x.y.z')).toThrow()
  })
  it('refresh token hashes deterministically', () => {
    const { token, tokenHash } = generateRefreshToken()
    expect(tokenHash).toBe(hashRefreshToken(token)); expect(token).not.toBe(tokenHash)
  })
})
```
- [ ] **Step 2: Run** → fail (no jwt.ts). **Step 3: Implement** `jwt.ts` (HS256 via jose or `node:crypto` HMAC; 15m exp). **Step 4: Run** → pass. **Step 5: Commit** `feat(m1b): JWT access + refresh token utils (ADR-INY-009)`

---

### Task 2: Cookie helpers

**Files:** Create `server/src/utils/auth-cookies.ts` + test

- [ ] **Step 1:** Implement `setAuthCookies(reply, {accessToken, refreshToken})`, `clearAuthCookies(reply)` using `@fastify/cookie`. `inyuku_at`: path `/`, 15m maxAge; `inyuku_rt`: path `/v1/auth`, 30d maxAge. Both `httpOnly, secure, sameSite:'lax'`, `domain: process.env.COOKIE_DOMAIN || undefined`.
- [ ] **Step 2: Test** (via `app.inject`, assert `set-cookie` headers contain both names, HttpOnly, correct paths). Run → pass.
- [ ] **Step 3: Commit** `feat(m1b): auth cookie helpers (inyuku_at/inyuku_rt)`

---

### Task 3: Auth middleware

**Files:** Create `server/src/middleware/auth.middleware.ts` + test; register in `app.ts`

**Produces:** a Fastify `preHandler`/decorator `authenticate` that reads `inyuku_at` from cookie (Bearer header fallback), verifies it, sets `req.user = AccessClaims` + `req.auditCtx` (userId, ip, ua, requestId). On failure emits envelope codes `AUTH_MISSING_BEARER` (401) / `AUTH_INVALID_TOKEN` (401) / `AUTH_ACCOUNT_INACTIVE` (403).

- [ ] **Step 1: Test** — a route guarded by `authenticate`: no cookie → 401 `AUTH_MISSING_BEARER`; valid `inyuku_at` → 200 with `req.user` populated; tampered → 401 `AUTH_INVALID_TOKEN`. (Mint the cookie via `signAccessToken` in the test.)
- [ ] **Step 2–4:** implement (cookie-first, Bearer fallback), run → pass.
- [ ] **Step 5: Commit** `feat(m1b): cookie-first auth middleware`

---

### Task 4: Permission guard + tenant isolation — ADR-INY-010

**Files:** Create `server/src/middleware/require-permission.ts`, `server/src/auth/permissions.ts` (role→permission map), + tests

**Produces:** `requirePermission(permission: string)` Fastify preHandler that (runs after `authenticate`): resolves `businessId` from `req.params.businessId | header 'x-business-id' | body.businessId`; loads the caller's `Membership` for that business (per-request cached); computes effective set = `rolePermissions[role] ∪ membership.permissions`; returns 403 `FORBIDDEN` if permission absent or no membership for that tenant; else sets `req.membership` and continues. `permissions.ts` holds the role→default-permission map from `docs/API.md` §permission model.

- [ ] **Step 1: Tests** (the critical isolation tests):
```ts
// pseudo: seed user U in business A as MERCHANT_OWNER; business B exists with another owner.
// 1. U calls a business:read route for A → 200.
// 2. U calls the same route for B → 403 FORBIDDEN (no membership in B). [CROSS-TENANT]
// 3. MERCHANT_STAFF calls a business:update route → 403 (staff lacks business:update).
// 4. unauthenticated → 401.
```
Write these as real `app.inject` tests with seeded data (use a test helper that creates users/businesses/memberships).
- [ ] **Step 2–4:** implement guard + map, run → all pass (cross-tenant returns 403).
- [ ] **Step 5: Commit** `feat(m1b): permission-RBAC guard + tenant isolation (ADR-INY-010)`

---

### Task 5: Signup + login (constant-time, lockout)

**Files:** Create `server/src/auth/auth.service.ts`, `server/src/routes/v1/auth.routes.ts` (signup, login) + tests; register routes

**Contract (`docs/API.md`):**
- `POST /v1/auth/signup` `{email, phone?, password, name, surname, businessName, locale?, acceptTerms:true}` → creates `User` (bcrypt-12) + `Business` + owner `Membership`, mints tokens, sets cookies, returns `{user:SafeUser, business:{id,slug}, membership:{role:"MERCHANT_OWNER"}}`. Errors `VALIDATION_ERROR`, `CONFLICT_DUPLICATE`.
- `POST /v1/auth/login` `{email,password}` → `{user, memberships}` + cookies. Constant-time compare (dummy bcrypt hash when user absent — no enumeration). Escalating lockout via `failedAttempts`/`lockedUntil` (5→15m, 10→1h, 20→24h; never reset on lock). Errors `AUTH_INVALID_CREDENTIALS` (401), `AUTH_ACCOUNT_LOCKED` (403), `AUTH_ACCOUNT_INACTIVE` (403).

- [ ] **Step 1: Tests** — signup creates user+business+membership and sets both cookies; duplicate email → `CONFLICT_DUPLICATE`; login success sets cookies + returns memberships; wrong password → `AUTH_INVALID_CREDENTIALS`; **unknown email takes ~same time and returns the same `AUTH_INVALID_CREDENTIALS`** (no enumeration); N failures → `AUTH_ACCOUNT_LOCKED`. Use Zod validation via `fastify-type-provider-zod`.
- [ ] **Step 2–4:** implement (wrap signup in a Prisma `$transaction`; bcrypt-12; audit `(users, CREATE)`, `(users, LOGIN|LOGIN_FAILED)`), run → pass.
- [ ] **Step 5: Commit** `feat(m1b): signup + login (constant-time, escalating lockout)`

---

### Task 6: Refresh rotation + reuse-detection + logout (the load-bearing security)

**Files:** extend `auth.service.ts`, `auth.routes.ts` (refresh, logout) + tests

**Contract:** `POST /v1/auth/refresh` (reads `inyuku_rt`): if token valid+unrevoked+unexpired → mint new refresh in the **same `familyId`**, set old `replacedById` + `revokedAt`, issue new cookies (rotation). **Reuse:** if a presented refresh is already revoked → **revoke the entire family**, return `AUTH_REFRESH_REUSE` (401). `POST /v1/auth/logout` (authenticated) → revoke the presented token's family, clear cookies.

- [ ] **Step 1: Tests** (critical):
```ts
// 1. login → rt1. refresh(rt1) → rt2 (rotation); rt1 now revoked. me() works with new at.
// 2. refresh(rt1) AGAIN (reuse) → 401 AUTH_REFRESH_REUSE; AND rt2 is now also revoked (family killed).
// 3. logout → subsequent refresh(current rt) → 401.
```
- [ ] **Step 2–4:** implement rotation + family-revoke-on-reuse; audit `(refresh_tokens, REVOKE)`; run → pass.
- [ ] **Step 5: Commit** `feat(m1b): refresh rotation + reuse-detection + logout`

---

### Task 7: OTP (request/verify) via BulkSMS

**Files:** extend `auth.service.ts`, `auth.routes.ts` (otp/request, otp/verify) + tests

**Contract:** `POST /v1/auth/otp/request` `{phone, purpose}` → store `PhoneOtp` (sha256 of 6-digit code, expiry 300s), send via `sms.ts` (BulkSMS), Redis rate-limit per phone → `{requested:true, expiresInSec:300}`; `429 RATE_LIMIT_EXCEEDED`. `POST /v1/auth/otp/verify` `{phone, code, purpose}` → check hash/expiry/attempts → `{verified:true}` (+cookies if purpose login/signup). Errors `AUTH_OTP_INVALID` (400), `AUTH_OTP_EXPIRED` (400), `AUTH_OTP_ATTEMPTS` (429).

- [ ] **Step 1: Tests** — request stores a hashed code + (mocked) sends SMS; verify with correct code → verified; wrong code increments attempts → after cap `AUTH_OTP_ATTEMPTS`; expired → `AUTH_OTP_EXPIRED`; rapid requests → `RATE_LIMIT_EXCEEDED`. (Mock `sendSms`; read the stored code via the test DB to compute the right input, or expose a test seam.)
- [ ] **Step 2–4:** implement, run → pass. **Step 5: Commit** `feat(m1b): phone OTP request/verify (BulkSMS, Redis rate-limit)`

---

### Task 8: Password reset (no enumeration; revoke all families)

**Files:** extend `auth.service.ts`, `auth.routes.ts` (password/reset-request, password/reset-confirm) + tests

**Contract:** `reset-request` `{email}` → **always** `{ok:true}` (no enumeration); if user exists, create `PasswordResetToken` + email via Resend. `reset-confirm` `{token, password}` → validate token+expiry, set new bcrypt-12 password, **revoke ALL of the user's refresh families**, `{ok:true}`. Errors `AUTH_TOKEN_EXPIRED` (400), `VALIDATION_ERROR` (weak pw).

- [ ] **Step 1: Tests** — reset-request returns `{ok:true}` for both known and unknown emails (same shape); reset-confirm with a valid token changes the password and **invalidates all existing refresh tokens** (a pre-existing rt now fails refresh); expired token → `AUTH_TOKEN_EXPIRED`.
- [ ] **Step 2–4:** implement (audit `(users, PASSWORD_RESET_REQUESTED|PASSWORD_CHANGE)`), run → pass. **Step 5: Commit** `feat(m1b): password reset (no enumeration, full family revoke)`

---

### Task 9: `GET /v1/auth/me` + tenant management routes

**Files:** `auth.routes.ts` (me), `server/src/routes/v1/businesses.routes.ts`, `server/src/routes/v1/admin.routes.ts` + tests; seed platform-sentinel business (ADR-INY-013)

**Routes (all per `docs/API.md`, permission-gated + tenant-scoped):**
- `GET /v1/auth/me` (auth) → `{user, memberships}`.
- `GET/PATCH /v1/businesses/:businessId` (`business:read`/`business:update`).
- `GET /v1/businesses/:businessId/members` (`member:read`), `POST .../members/invite` (`member:invite`, sends Resend invite).
- `GET/PATCH .../settings` (`settings:read`/`settings:update`; secrets masked unless `settings:read_secret`).
- `GET .../audit` (`audit:read`, paginated), `GET/POST .../consents` + `POST .../consents/:id/revoke` (`consent:read`/`consent:write`).
- `GET /v1/admin/leads` (`lead:read`), `PATCH /v1/admin/leads/:id` (`lead:update`) — resolve the platform-sentinel business.

- [ ] **Step 1:** Seed update — add the platform-sentinel `Business` (slug `platform`) to `server/prisma/seed.ts`.
- [ ] **Step 2: Tests** — `me` returns memberships; owner PATCHes their business (200) but not another (403); settings PATCH encrypts a secret + read masks it unless `settings:read_secret`; admin lead routes require `lead:read`/`lead:update` (a merchant owner → 403). 
- [ ] **Step 3–4:** implement, run → pass. **Step 5: Commit** `feat(m1b): /me + tenant business/members/settings/consents + admin leads routes`

---

### Task 10: OpenAPI snapshot + audit-event review

**Files:** update `server/openapi.snapshot.json`; verify audit calls

- [ ] **Step 1:** Regenerate the OpenAPI snapshot (all new `/v1/auth/*`, `/v1/businesses/*`, `/v1/admin/*` routes now present); `npm run openapi:check` → pass.
- [ ] **Step 2:** Grep that each mutation route calls `auditLog(...)` with the right `(entity, action)` tuple (`docs/SCHEMA.md` list); add any missing.
- [ ] **Step 3: Commit** `chore(m1b): update OpenAPI snapshot + audit coverage`

---

### Task 11: Final verification, push & PR

- [ ] **Step 1: Full gate (DB+Redis up)** — `cd server && npm ci && npm run prisma:generate && npx prisma migrate deploy && npm run typecheck && npm run lint && npm test && npm run build && npm run openapi:check` → all green. Run root `npm run typecheck && npm run test && npm run build` (frontend unaffected).
- [ ] **Step 2: Manual probes** — `npm run dev`; via curl: signup → cookies; me; refresh rotates; reuse → 401 + family dead; cross-tenant → 403; otp request/verify; logout. Stop.
- [ ] **Step 3: Push + PR** — `gh pr create --title "M1-B: auth & tenancy" --body "In-house JWT + refresh rotation/reuse-detection, OTP, password reset, permission-RBAC, tenant isolation, tenant+admin routes. Seed data only. Auth surface — needs bukani-security review." --base main`
- [ ] **Step 4: STOP for validation** (includes a `bukani-security` STRIDE review). Do not merge or start M1-C.

---

## Acceptance Criteria (validated in Claude Code before merge)

- [ ] Signup/login/logout/me work; cookies set with correct attrs (HttpOnly, paths, domain from env).
- [ ] **Refresh rotates; reusing a rotated token returns `AUTH_REFRESH_REUSE` and revokes the whole family.**
- [ ] Login is constant-time + non-enumerating; escalating lockout enforced.
- [ ] OTP request/verify with hashing, attempt cap, expiry, rate-limit.
- [ ] Password-reset confirm revokes ALL refresh families; reset-request never enumerates.
- [ ] **Permission guard enforced; cross-tenant access returns 403/404** (the isolation test passes).
- [ ] Tenant + admin routes permission-gated; secret settings masked unless `settings:read_secret`.
- [ ] Every mutation audited (PII-masked); platform-sentinel business seeded (ADR-INY-013).
- [ ] Backend gate green (typecheck/lint/test/build/openapi:check) **in CI**; frontend unaffected; seed data only.
- [ ] `bukani-security` STRIDE review passed.

## Self-Review

**Spec coverage** (vs architect contract §4 auth + §3 permissions + §7 M1-B deliverables): JWT (T1), cookies (T2), middleware (T3), permission guard + isolation (T4), signup/login (T5), refresh rotation/reuse + logout (T6), OTP (T7), password reset (T8), me + tenant/admin routes (T9), OpenAPI + audit (T10). All §4 endpoints (1–9) covered. Tenant isolation is the headline acceptance test.

**Placeholder scan:** No "TODO/implement later". Test bodies for the security-critical paths (rotation/reuse, cross-tenant, constant-time/lockout, OTP, full-family-revoke) are specified concretely; the contract details (exact field shapes, error codes) live in `docs/API.md` which the builder reads — referenced, not duplicated.

**Type/name consistency:** `signAccessToken`/`verifyAccessToken`/`generateRefreshToken`/`hashRefreshToken` (T1) consumed by middleware (T3) and auth.service (T5/T6). `requirePermission` (T4) used by all tenant/admin routes (T9). `authenticate` (T3) precedes `requirePermission` (T4) on guarded routes. Cookie names `inyuku_at`/`inyuku_rt`, error codes (`AUTH_REFRESH_REUSE`, `AUTH_OTP_*`, `FORBIDDEN`), and the role→permission map all match `docs/API.md`. Builds on M1-A's `app.ts`, prisma client, `settings.service`, `sms.ts`, `auditLog`, rate-limit.
