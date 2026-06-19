# M1-A: Backend Chassis, Infra & Baseline Tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Inyuku **Fastify 5 + Prisma 6** backend as a new `server/` package — the cross-cutting chassis (envelope, errors, crypto, audit, rate-limit, storage, email/sms, settings), the baseline Prisma schema + migration, `/health` + `/ready`, and OpenAPI + CI — so M1-B (auth) and M1-C (frontend integration) build on a solid spine. **No auth endpoints and no feature logic in this phase.**

**Architecture:** Two deployables in one repo (EA-ADR-014): the existing Next.js frontend stays at the repo root (Vercel); the backend is a self-contained `server/` package (Fastify 5, own `package.json`, Dockerfile, deployed to Railway). The reusable primitives are **vendored from the DrAppv2 Fastify chassis** (`/home/sibnaye/Development/DrAppv2/backend/src/`); framework-coupled pieces are adapted to Inyuku's needs (cookies, Redis rate-limit, R2 driver, multi-tenant audit). Canonical contracts: `docs/API.md`, `docs/SCHEMA.md`, `docs/DECISIONS.md` (ADR-001..011), and the architect's M1 contract.

**Tech Stack:** Fastify 5 (TypeScript), `@fastify/{helmet,cors,cookie,swagger,swagger-ui}`, `fastify-type-provider-zod`, Prisma 6 + Postgres 16, ioredis + Redis 7, `@aws-sdk/client-s3` (R2), Resend, BulkSMS, Vitest, Docker.

## Global Constraints

- **EA-ADR-014/016:** backend is **Fastify 5**, modelled on the DrAppv2 chassis. Vendor the framework-agnostic utils **verbatim**; adapt the framework-coupled ones. Keep the response-envelope, error, and audit shapes **byte-identical** to the chassis.
- **Money = integer ZAR cents** everywhere. **snake_case** Prisma `@@map`/`@map`. cuid PKs.
- **Multi-tenant from day one:** `businessId` per the schema; governance tables nullable, tenant tables non-null (M2+).
- **Secrets:** runtime boot keys in env (`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `ENCRYPTION_KEY`, `BLOB_SIGN_SECRET`, `R2_*`); all vendor API keys live in the encrypted `Setting` table (`isSecret`→`enc:v1:`). No secrets in the repo.
- **Seed data only.** The EA-ADR-015 pre-production-PII gate is in force — never point this at real merchant data until compliance clears it.
- **`COOKIE_DOMAIN`** is read from env (unset → host-only) so dev works without the (still-provisional) brand domain.
- Branch `feature/m1a-backend-foundation` off `main`; frequent commits; backend gate (lint/typecheck/test/build) must pass.

## Repo layout decision (ADR-INY-012 — record in `docs/DECISIONS.md`)

Backend lives in **`server/`** as an independent package (own `package.json`, no npm workspace for now — the two deployables install/build/deploy independently). Frontend stays at repo root. CI gains a second job scoped to `server/`.

---

### Task 1: Scaffold the `server/` Fastify package + local dev infra

**Files:** Create `server/package.json`, `server/tsconfig.json`, `server/.gitignore`, `server/.env.example`, `server/src/index.ts`, `docker-compose.dev.yml`

- [ ] **Step 1: Branch**
```bash
cd /home/sibnaye/Development/Inyuku && git checkout -b feature/m1a-backend-foundation
```

- [ ] **Step 2: Create `server/package.json`**
```json
{
  "name": "inyuku-api",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20 <23" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate deploy",
    "prisma:migrate:dev": "prisma migrate dev",
    "openapi:check": "tsx scripts/openapi-drift.ts"
  },
  "dependencies": {
    "fastify": "^5", "@fastify/helmet": "^12", "@fastify/cors": "^10",
    "@fastify/cookie": "^11", "@fastify/swagger": "^9", "@fastify/swagger-ui": "^5",
    "fastify-type-provider-zod": "^4", "zod": "^3",
    "@prisma/client": "^6", "ioredis": "^5",
    "@aws-sdk/client-s3": "^3", "bcryptjs": "^2", "resend": "^4"
  },
  "devDependencies": {
    "prisma": "^6", "tsx": "^4", "typescript": "~5.9", "vitest": "^2",
    "eslint": "^9", "@types/node": "^24", "@types/bcryptjs": "^2"
  }
}
```
> Versions are floors; install resolves exact. Confirm Fastify-plugin majors are mutually compatible at install (the chassis `package.json` is the reference — match its plugin majors if they differ).

- [ ] **Step 3: `server/tsconfig.json`** (NodeNext, strict, outDir dist)
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "lib": ["ES2022"], "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "outDir": "dist", "rootDir": "src",
    "baseUrl": ".", "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", "scripts/**/*"], "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: `server/.gitignore`** → `node_modules`, `dist`, `.env`, `.env.local`
- [ ] **Step 5: `server/.env.example`** — document the full env contract from `docs/API.md` (DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_SECRET_PREVIOUS, JWT_REFRESH_SECRET, ENCRYPTION_KEY, BLOB_SIGN_SECRET, STORAGE_DRIVER=r2, R2_*, R2_PUBLIC_BASE_URL, COOKIE_DOMAIN, CORS_ALLOWED_ORIGINS, RESEND_API_KEY, SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT, GIT_COMMIT_SHA), values blank/placeholder.

- [ ] **Step 6: `docker-compose.dev.yml`** (repo root) — local Postgres 16 + Redis 7 for tests/dev
```yaml
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_USER: inyuku, POSTGRES_PASSWORD: inyuku, POSTGRES_DB: inyuku_dev }
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

- [ ] **Step 7: Minimal boot `server/src/index.ts`** (replaced in Task 4; just proves the toolchain)
```ts
import Fastify from 'fastify'
const app = Fastify({ logger: true })
app.get('/health', async () => ({ ok: true, data: { status: 'ok' } }))
const port = Number(process.env.PORT ?? 8080)
app.listen({ port, host: '0.0.0.0' }).then(() => app.log.info(`api on :${port}`))
```

- [ ] **Step 8: Install + boot check**
```bash
cd server && npm install && npm run typecheck && (npm run dev & sleep 3; curl -s localhost:8080/health; kill %1)
```
Expected: typecheck exit 0; curl returns `{"ok":true,"data":{"status":"ok"}}`.

- [ ] **Step 9: Record ADR-INY-012** (repo layout) in `docs/DECISIONS.md` and commit.
```bash
cd /home/sibnaye/Development/Inyuku && git add server docker-compose.dev.yml docs/DECISIONS.md
git commit -m "feat(m1a): scaffold Fastify 5 server package + local dev infra (ADR-INY-012)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Vendor-in the framework-agnostic primitives (+ tests)

**Files:** Copy into `server/src/utils/`: `route-helpers.ts`, `errors.ts`, `crypto.ts`, `password.ts`, `pii-mask.ts`, `logger.ts`, `client-ip.ts`. Create `server/src/utils/__tests__/*.test.ts`.

**Source (copy verbatim, fix import extensions for NodeNext):** `/home/sibnaye/Development/DrAppv2/backend/src/utils/{route-helpers,errors,crypto,password,pii-mask,logger,client-ip}.ts`. Swap chassis password lib for `bcryptjs` if the chassis uses native `bcrypt` (keep cost 12 + the `validatePasswordStrength` policy).

- [ ] **Step 1: Copy the seven files** from the chassis paths above into `server/src/utils/`. Adjust relative imports to ESM/NodeNext (`.js` extensions). Do not change logic.

- [ ] **Step 2: Write tests** `server/src/utils/__tests__/primitives.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { okEnvelope, errorEnvelope } from '../route-helpers.js'
import { AppError } from '../errors.js'
import { encrypt, decrypt, isEncrypted } from '../crypto.js'
import { hashPassword, comparePassword } from '../password.js'
import { maskEmail } from '../pii-mask.js'

describe('envelope', () => {
  it('wraps ok and error', () => {
    expect(okEnvelope({ a: 1 })).toEqual({ ok: true, data: { a: 1 } })
    expect(errorEnvelope('X', 'm')).toEqual({ ok: false, error: { code: 'X', message: 'm' } })
  })
})
describe('crypto', () => {
  it('round-trips and marks ciphertext', () => {
    const c = encrypt('secret-value'); expect(isEncrypted(c)).toBe(true)
    expect(decrypt(c)).toBe('secret-value')
  })
})
describe('password', () => {
  it('hashes (bcrypt-12) and verifies', async () => {
    const h = await hashPassword('Str0ng!pass'); expect(h).not.toBe('Str0ng!pass')
    expect(await comparePassword('Str0ng!pass', h)).toBe(true)
    expect(await comparePassword('wrong', h)).toBe(false)
  })
})
describe('pii-mask', () => { it('masks email', () => expect(maskEmail('a@b.com')).not.toContain('a@b.com')) })
describe('errors', () => { it('carries code+status', () => { const e = new AppError('C','m',418); expect([e.code,e.statusCode]).toEqual(['C',418]) } ) })
```

- [ ] **Step 3: Run** — `cd server && ENCRYPTION_KEY=$(openssl rand -base64 32) npm test -- primitives` → all pass. (The crypto test needs `ENCRYPTION_KEY`.)
- [ ] **Step 4: Commit** `feat(m1a): vendor framework-agnostic chassis primitives + tests`

---

### Task 3: Prisma schema + migration + client

**Files:** Create `server/prisma/schema.prisma`, `server/src/db.ts`

- [ ] **Step 1: Write `server/prisma/schema.prisma`** — copy the full baseline schema from `docs/SCHEMA.md` (the 14 models + 6 enums: User, RefreshToken, PasswordResetToken, PhoneOtp, Business, Membership, Permission, AuditLog, ErrorLog, Setting, Consent, ConsentRevocation, AiUsage, Lead). Datasource Postgres via `env("DATABASE_URL")`, generator prisma-client-js.

- [ ] **Step 2: Prisma client singleton `server/src/db.ts`**
```ts
import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient()
```

- [ ] **Step 3: Generate + migrate against local Postgres**
```bash
cd /home/sibnaye/Development/Inyuku && docker compose -f docker-compose.dev.yml up -d
cd server && export DATABASE_URL="postgresql://inyuku:inyuku@localhost:5432/inyuku_dev"
npm run prisma:generate && npx prisma migrate dev --name m1a_baseline
```
Expected: migration created + applied; client generated; `npx prisma studio` (optional) shows all 14 tables.

- [ ] **Step 4: Schema sanity test** `server/src/__tests__/schema.test.ts` — assert the client exposes the expected models:
```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '../db.js'
describe('schema', () => {
  it('exposes baseline models', () => {
    for (const m of ['user','business','membership','permission','auditLog','errorLog','setting','consent','aiUsage','lead','refreshToken','phoneOtp'])
      expect((prisma as any)[m]).toBeDefined()
  })
})
```
Run with the local DB up. Expected: pass.
- [ ] **Step 5: Commit** `feat(m1a): baseline Prisma schema + migration + client`

---

### Task 4: Fastify app bootstrap (adapted from chassis)

**Files:** Create `server/src/app.ts`; replace `server/src/index.ts`

**Source pattern:** `/home/sibnaye/Development/DrAppv2/backend/src/app.ts` (Fastify `buildApp()`), adapted: add `@fastify/cookie` (domain from `COOKIE_DOMAIN`), CORS with `credentials:true` locked to `CORS_ALLOWED_ORIGINS` (`*.inyuku.co.za`), the envelope error handler (AppError + ZodError + Prisma `P2002`→409 `CONFLICT_DUPLICATE` / `P2025`→404 / `P2003`→400), and a 404 handler returning the envelope.

- [ ] **Step 1: Write `server/src/app.ts`** exporting `buildApp(): FastifyInstance` — register helmet, cors (credentials, origin allow-list), cookie, set `fastify-type-provider-zod` validator/serializer compilers, `setErrorHandler` mapping to `errorEnvelope(...)`, `setNotFoundHandler` returning `errorEnvelope('NOT_FOUND','Route not found')` with 404.

- [ ] **Step 2: `server/src/index.ts`** → `buildApp().listen({port,host:'0.0.0.0'})`.

- [ ] **Step 3: Test** `server/src/__tests__/app.test.ts` (use `app.inject`, no network):
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { buildApp } from '../app.js'
let app: Awaited<ReturnType<typeof buildApp>>
beforeAll(async () => { app = buildApp(); await app.ready() })
describe('app', () => {
  it('404 returns the error envelope', async () => {
    const r = await app.inject({ method: 'GET', url: '/nope' })
    expect(r.statusCode).toBe(404)
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})
```
Run → pass. **Step 4: Commit** `feat(m1a): Fastify app bootstrap (cors+cookie+helmet+envelope error handler)`

---

### Task 5: Redis client + Redis-backed rate-limit

**Files:** Create `server/src/redis.ts`, `server/src/utils/rate-limit.ts` (adapted from chassis)

- [ ] **Step 1: `server/src/redis.ts`** — ioredis singleton from `REDIS_URL`.
- [ ] **Step 2: `rate-limit.ts`** — keep the chassis signature `checkRateLimit(key, limit, windowMs): Promise<{allowed,remaining,resetAt}>` and the `RATE_LIMIT_DISABLED` escape hatch, but implement with Redis `INCR`+`PEXPIRE` (fixed-window) instead of the in-memory Map.
- [ ] **Step 3: Test** `server/src/utils/__tests__/rate-limit.test.ts` (local Redis up): 3 calls with limit 2 → first two `allowed:true`, third `allowed:false`. Run → pass.
- [ ] **Step 4: Commit** `feat(m1a): Redis client + Redis-backed rate-limit`

---

### Task 6: Settings service (encrypted) + permission registry seed

**Files:** Create `server/src/services/settings.service.ts`, `server/prisma/seed.ts`

- [ ] **Step 1: `settings.service.ts`** — `getSetting(key, businessId?)`, `setSetting(key, value, {isSecret, businessId, updatedById})`. When `isSecret`, store `encrypt(value)`; on read, `decrypt` only for callers with `settings:read_secret` (the route layer enforces; the service exposes `getSecretSetting` vs `getSetting` which returns `maskSecret(...)` for secret keys).
- [ ] **Step 2: `seed.ts`** — upsert the Permission registry rows (business:read, …, ai:usage:read — full list from `docs/API.md`). Add `prisma db seed` config to `server/package.json`.
- [ ] **Step 3: Tests** `settings.test.ts` (local DB): a secret setting persists as `enc:v1:` ciphertext and `getSecretSetting` returns plaintext; a non-secret returns plaintext; `getSetting` masks a secret. Run → pass.
- [ ] **Step 4:** Run `npx prisma db seed`; assert `permission` table row count == registry size. **Commit** `feat(m1a): encrypted settings service + permission registry seed`

---

### Task 7: Storage abstraction + R2 driver (ADR-INY-008)

**Files:** `server/src/utils/storage.ts`, `server/src/utils/blob.ts` (vendor + extend)

- [ ] **Step 1: Vendor** `storage.ts` + `blob.ts` from the chassis. **Add an `'r2'` driver** to `storageDriver()` (selected when `STORAGE_DRIVER=r2`) implemented with `@aws-sdk/client-s3` against `R2_ENDPOINT` (put/delete/read/open/publicUrl). **Replace** the Vercel host allow-list in `blob.ts` with the R2 host(s): `<account>.r2.cloudflarestorage.com` + `R2_PUBLIC_BASE_URL`.
- [ ] **Step 2: Tests** `blob.test.ts` (no live R2 — test pure logic): `getSignedBlobUrl` + `verifySignedBlobUrl` round-trip with `BLOB_SIGN_SECRET`; TTL cap at 3600; a non-allow-listed host is rejected. And `storage.test.ts`: `storageDriver()` returns `'r2'` when `STORAGE_DRIVER=r2`. Run → pass.
- [ ] **Step 3: Commit** `feat(m1a): storage abstraction + Cloudflare R2 driver (ADR-INY-008)`

---

### Task 8: Email (Resend) + SMS (BulkSMS) utils

**Files:** `server/src/utils/email.ts`, `server/src/utils/email-templates.ts`, `server/src/utils/sms.ts` (vendor + re-point config)

- [ ] **Step 1: Vendor** the three files; **drop the SMTP/nodemailer path** (keep Resend only); re-point credential lookup from the chassis channel-config to `settings.service` keys (`email.resend.apiKey`, `email.resend.fromAddress/Name`, `sms.bulksms.tokenId/tokenSecret`). Rebrand template copy DrApp→Inyuku. Keep `toE164ZA` and the never-throw `SmsResult`/`EmailResult` contracts.
- [ ] **Step 2: Tests** `comms.test.ts` — `toE164ZA('0821234567')` → `+27821234567`; `sendEmail`/`sendSms` return a structured failure (not throw) when the Setting key is absent (mock fetch). Run → pass.
- [ ] **Step 3: Commit** `feat(m1a): Resend email + BulkSMS sms utils (settings-sourced)`

---

### Task 9: `/health` + `/ready`

**Files:** `server/src/routes/health.routes.ts`; register in `app.ts`

- [ ] **Step 1: Routes** — `GET /health` → `okEnvelope({status:'ok', commit: process.env.GIT_COMMIT_SHA ?? 'dev', uptime: process.uptime()})`. `GET /ready` → ping DB (`prisma.$queryRaw\`SELECT 1\``) + Redis (`redis.ping()`); 200 `okEnvelope({db:true,redis:true})` or 503 `errorEnvelope('NOT_READY',...)` if either fails.
- [ ] **Step 2: Test** `health.test.ts` via `app.inject` (DB+Redis up): `/health`→200 ok; `/ready`→200 with `db:true,redis:true`. Run → pass.
- [ ] **Step 3: Commit** `feat(m1a): /health + /ready endpoints`

---

### Task 10: OpenAPI + CI drift check

**Files:** register `@fastify/swagger` + `@fastify/swagger-ui` in `app.ts`; create `server/scripts/openapi-drift.ts`

- [ ] **Step 1:** Register `@fastify/swagger` (zod transform via `fastify-type-provider-zod`'s `jsonSchemaTransform`) + swagger-ui at `/v1/docs`. Every route declares its zod schema.
- [ ] **Step 2:** `openapi-drift.ts` — build the app, read the generated spec, compare against a committed `server/openapi.snapshot.json`; exit 1 on drift (regenerate-and-commit workflow). Seed the snapshot now (only `/health`,`/ready` exist; M1-B/C add routes + update the snapshot).
- [ ] **Step 3:** `npm run openapi:check` → pass. **Commit** `feat(m1a): OpenAPI (@fastify/swagger) at /v1/docs + CI drift check`

---

### Task 11: Dockerfile, Railway config, backend CI job

**Files:** `server/Dockerfile`, `server/railway.json`, `.github/workflows/ci.yml` (add backend job)

- [ ] **Step 1: `server/Dockerfile`** — multi-stage: build (`npm ci`, `prisma generate`, `tsc`), runtime (node:20-alpine, copy `dist` + `node_modules` + `prisma`), CMD runs `prisma migrate deploy` then `node dist/index.js`.
- [ ] **Step 2: `server/railway.json`** — build via Dockerfile; `healthcheckPath: "/health"`; start command runs migrate-then-serve.
- [ ] **Step 3: Add a `server` job** to `.github/workflows/ci.yml` — spin up Postgres + Redis service containers, `cd server`, `npm ci`, `prisma generate`, `typecheck`, `lint`, `test` (with `DATABASE_URL`/`REDIS_URL`/`ENCRYPTION_KEY`/`BLOB_SIGN_SECRET` test env), `build`, `openapi:check`. Keep the existing frontend job intact.
- [ ] **Step 4:** Validate the workflow YAML parses; `cd server && npm run build` succeeds. **Commit** `ci(m1a): backend Dockerfile + Railway config + CI job`

---

### Task 12: Final verification, push & PR

- [ ] **Step 1: Full backend gate (DB+Redis up)**
```bash
cd /home/sibnaye/Development/Inyuku && docker compose -f docker-compose.dev.yml up -d
cd server && export DATABASE_URL=... REDIS_URL=... ENCRYPTION_KEY=$(openssl rand -base64 32) BLOB_SIGN_SECRET=$(openssl rand -base64 32)
npm ci && npm run prisma:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run openapi:check
```
Expected: all green.
- [ ] **Step 2: Boot + probe** — `npm run dev`; `curl /health` → 200 envelope; `curl /ready` → 200 `db:true,redis:true`; `/v1/docs` serves. Stop.
- [ ] **Step 3: Confirm frontend untouched** — `cd .. && npm run build` (root Next app) still succeeds.
- [ ] **Step 4: Push + PR**
```bash
git push -u origin feature/m1a-backend-foundation
gh pr create --title "M1-A: Fastify backend chassis, infra & baseline tables" \
  --body "New server/ Fastify 5 + Prisma package: vendored cross-cutting chassis, baseline schema + migration, /health + /ready, OpenAPI + CI. No auth/feature logic (M1-B/C). Seed data only — prod-PII gate (EA-ADR-015) still in force." --base main
```
- [ ] **Step 5: STOP for validation.** Do not merge or start M1-B.

---

## Acceptance Criteria (validated in Claude Code before merge)

- [ ] `server/` Fastify 5 package boots; `/health` 200 + `/ready` 200 (DB+Redis) / 503 when down.
- [ ] Baseline Prisma schema migrates clean; all 14 tables present; snake_case maps; money Int cents.
- [ ] Vendored primitives pass tests (crypto round-trip, bcrypt-12, envelope, pii-mask, error→envelope).
- [ ] Rate-limit is Redis-backed; settings secret values stored `enc:v1:`; permission registry seeded.
- [ ] R2 driver selectable; signed-URL HMAC round-trips; non-allow-listed host rejected.
- [ ] OpenAPI served at `/v1/docs`; CI drift check green; backend CI job runs (Postgres+Redis services).
- [ ] Response envelope + error mapping byte-identical to the chassis contract.
- [ ] Frontend (root Next app) build still passes; no auth/feature code added.
- [ ] No secrets committed; `ENCRYPTION_KEY`/`BLOB_SIGN_SECRET` separate boundaries; seed data only.

## Self-Review

**Spec coverage** (vs architect M1 contract §7 M1-A deliverables): Express→**Fastify** app bootstrap (T4) ✅; vendor primitives (T2) ✅; audit-logger+businessId — *deferred to M1-B* where audit writes begin (the util is vendored in T2/used in T6 settings-change audit; full audit wiring lands with mutations in M1-B — noted); rate-limit Redis (T5) ✅; storage+r2 (T7) ✅; email/sms (T8) ✅; Prisma schema+migration (T3) ✅; /health+/ready (T9) ✅; settings+permission seed (T6) ✅; OpenAPI+drift (T10) ✅; Docker/Railway/CI (T11) ✅. Auth, tenancy routes, and `/v1/leads` are **M1-B/M1-C** by the contract's decomposition — correctly out of scope.

**Placeholder scan:** No "TODO/implement later" in executable steps. "Vendor verbatim from chassis path X" is a concrete copy instruction with the exact source path, not a placeholder; KIMI reads the real file. The OpenAPI snapshot is intentionally seeded small (only health routes exist now).

**Type/name consistency:** `buildApp()` (T4) is consumed by T3/T4/T9 tests via `app.inject`. `okEnvelope`/`errorEnvelope` (T2) used by the error handler (T4) and health routes (T9). `checkRateLimit` signature (T5) matches the chassis contract. `prisma` singleton (T3) used by settings (T6) and `/ready` (T9). Env var names match `docs/API.md` and `server/.env.example` (T1/T5).
