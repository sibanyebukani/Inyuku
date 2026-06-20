# M1-C: Frontend Integration, Leads, i18n & Observability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the M1 spine end-to-end: implement the public `POST /v1/leads` endpoint, wire the three M0-C marketing forms through the Next BFF to it (replacing the `TODO(M1)` markers), add a browser auth client that round-trips the cookie session, scaffold `next-intl` (8 SA languages), wire Sentry + OpenTelemetry, and land the `AiUsage` write path (table + helper + settings — NOT the full `lib/ai.js` gateway, which is M5).

**Architecture:** Backend = the M1-A/B Fastify `server/` package (adds the leads route, observability, AiUsage helper). Frontend = the root Next.js app (adds an API client, wires the forms via the existing `/api/leads` BFF, a minimal auth flow, next-intl, Sentry). Integration runs against the live local stack (API :8080, UI :3001, Postgres/Redis). Everything uses the standard envelope; money stays integer ZAR cents.

**Tech Stack:** Fastify 5, Prisma 6, Zod, Resend (existing), `@sentry/node` + `@sentry/nextjs`, OpenTelemetry SDK, `next-intl`, Vitest.

## Global Constraints

- Build to the contracts in `docs/API.md` (`POST /v1/leads`, env) + `docs/SCHEMA.md` (`Lead`, `AiUsage`). If ambiguous, STOP and ask.
- **No full `lib/ai.js` gateway** — M1-C only lands the `AiUsage` table write + `ai.enabled`/tier settings (the gateway is the EA-ADR-009 promotion item, due M5). No real AI calls.
- **Seed data only** — EA-ADR-015 prod-PII gate in force; the live local stack is dev data.
- Lead `source` from the forms is lowercase (`contact`/`impact_report`/`share_story`); the backend maps to the `LeadSource` enum (`CONTACT`/`IMPACT_REPORT`/`SHARE_STORY`).
- **Dev CORS/cookies:** add `http://localhost:3001` (and the UI dev origin) to `CORS_ALLOWED_ORIGINS` for local browser→API calls; `COOKIE_DOMAIN` stays unset in dev (host-only).
- Branch `feature/m1c-frontend-integration` off `main`; TDD; frequent commits; both gates green (backend + root frontend); update `server/openapi.snapshot.json`.

---

## Part A — Backend

### Task 1: `POST /v1/leads` public endpoint

**Files:** Create `server/src/routes/v1/leads.routes.ts` + test; register in `app.ts`; create `server/src/services/leads.service.ts`

**Contract (`docs/API.md`):** public, Zod **discriminated union on `source`**:
- `contact` → `{source:'contact', name, email, message, consentGiven?}`
- `impact_report` → `{source:'impact_report', email, consentGiven?}`
- `share_story` → `{source:'share_story', name?, email?, ...extra→payload, consentGiven?}`

Behaviour: per-IP rate limit (`leads:${req.ip}`, 10/60s → 429 `RATE_LIMIT_EXCEEDED`); persist `Lead` (map source→enum, `status:NEW`, record `ipAddress`/`userAgent` from `req.ip`/header, `consentGiven`, unknown share_story fields → `payload`); best-effort Resend notify the platform inbox (never blocks the 201); audit `(leads, CREATE, lead.id)` platform-level (businessId null). Returns `201 {ok:true,data:{id, status:'NEW'}}`; `422 VALIDATION_ERROR`.

- [ ] **Step 1: Test** `leads.routes.test.ts` (via `app.inject`):
```ts
// 1. POST {source:'contact', name, email, message} → 201, data.status==='NEW', a Lead row exists w/ source CONTACT.
// 2. POST {source:'impact_report', email:'x'} (invalid email) → 422 VALIDATION_ERROR.
// 3. POST {source:'share_story', name, email, businessType:'spaza', story:'...'} → 201; payload holds the extra fields.
// 4. 11 rapid posts from one IP → the 11th is 429 RATE_LIMIT_EXCEEDED.
// 5. No auth/cookies required (public).
```
- [ ] **Step 2–4:** implement service + route (Zod discriminated union; mock/guard Resend so a missing key doesn't throw); run → pass.
- [ ] **Step 5: Commit** `feat(m1c): POST /v1/leads public lead capture`

---

### Task 2: AiUsage write path (table + helper + settings) — NOT the gateway

**Files:** Create `server/src/services/ai-usage.service.ts` + test; extend `server/prisma/seed.ts`

- [ ] **Step 1:** Implement `recordAiUsage({businessId?, userId?, feature, tier, model, inputTokens, outputTokens, cacheHit, costCents, requestId?})` → writes an `AiUsage` row (costCents integer ZAR cents). Add a `aiEnabled()` read of the `ai.enabled` setting (kill switch) — helper only; no AI calls yet.
- [ ] **Step 2:** Seed the AI governance settings (`ai.enabled=false`, `ai.tier.classify/agent/complex` placeholders) in `seed.ts` (EA-ADR-011 — wired now so M5 conforms).
- [ ] **Step 3: Test** — `recordAiUsage(...)` persists a row with integer `costCents`; `aiEnabled()` reads the seeded setting. Run → pass.
- [ ] **Step 4: Commit** `feat(m1c): AiUsage write helper + AI governance settings (table only; gateway is M5)`

---

### Task 3: Observability — Sentry + OpenTelemetry (backend)

**Files:** Create `server/src/observability.ts`; wire in `server/src/index.ts`/`app.ts`

- [ ] **Step 1:** Init `@sentry/node` from `SENTRY_DSN` (no-op when unset, so dev/tests don't error); register Sentry error capture in the Fastify error handler (alongside the existing `ErrorLog` write). Init OpenTelemetry tracing (OTLP exporter from `OTEL_EXPORTER_OTLP_ENDPOINT`, no-op when unset).
- [ ] **Step 2: Test/smoke** — with `SENTRY_DSN` unset, the app still boots and the error handler still returns the envelope (no crash); a thrown error is passed to the Sentry capture shim (assert the shim is called via a spy).
- [ ] **Step 3: Commit** `feat(m1c): backend Sentry + OpenTelemetry (no-op when unconfigured)`

---

### Task 4: Dev CORS + env

**Files:** `server/.env.example`, confirm `parseCorsOrigins` handles explicit localhost origins

- [ ] **Step 1:** Document `CORS_ALLOWED_ORIGINS=http://localhost:3001` for dev in `.env.example`; confirm `parseCorsOrigins` accepts explicit origins (not just `*.inyuku.co.za`) so the browser UI can call the API in dev. Add `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT` to the example if absent.
- [ ] **Step 2:** Update `server/openapi.snapshot.json` (the new `/v1/leads` route) and run `npm run openapi:check` → pass.
- [ ] **Step 3: Commit** `chore(m1c): dev CORS origins + OpenAPI snapshot for /v1/leads`

---

## Part B — Frontend

### Task 5: API client

**Files:** Create `src/lib/api-client.ts` + test

- [ ] **Step 1:** Implement a typed `apiFetch(path, opts)` against `process.env.NEXT_PUBLIC_API_BASE_URL` with `credentials: 'include'`, JSON handling, and envelope unwrapping (`{ok,data}` → data; `{ok:false,error}` → throw a typed `ApiError`). Helpers `getJson`/`postJson`.
- [ ] **Step 2: Test** — `apiFetch` returns `data` on `{ok:true}`, throws `ApiError(code)` on `{ok:false}` (mock `fetch`). Run → pass.
- [ ] **Step 3: Commit** `feat(m1c): frontend API client (credentials-include, envelope-aware)`

---

### Task 6: Wire the BFF + the three marketing forms

**Files:** Modify `src/app/api/leads/route.ts` (BFF target), `src/app/contact/ContactForm.tsx`, `src/app/impact/ImpactClient.tsx`, `src/app/stories/StoriesClient.tsx`

- [ ] **Step 1: Fix the BFF target** — `src/app/api/leads/route.ts` must POST to **`${apiBase}/v1/leads`** (M0-B used `/leads`); keep it a thin proxy returning the backend envelope/status. (Backend is `/v1/leads`.)
- [ ] **Step 2: Wire ContactForm** — replace the `TODO(M1)` in `handleSubmit` with `await postJson('/api/leads', { source:'contact', name, email, message, consentGiven:true })`; add loading + error states (show the API error), keep the existing success UI. (Same-origin call to the Next BFF — no CORS.)
- [ ] **Step 3: Wire ImpactClient ReportCTA** — `{ source:'impact_report', email }`; loading/error/success.
- [ ] **Step 4: Wire StoriesClient ShareStorySection** — `{ source:'share_story', name, email, businessName, businessType, story }` (extras land in `payload`); loading/error/success.
- [ ] **Step 5: Test** — a component test (or the route test) asserts each form POSTs the right `source` + payload to `/api/leads` and renders success on `{ok:true}` / error on failure (mock `fetch`).
- [ ] **Step 6: Commit** `feat(m1c): wire contact/impact/stories forms to /api/leads (capture live)`

---

### Task 7: Minimal browser auth flow (cookie round-trip)

**Files:** Create `src/lib/auth.ts` (client helpers), `src/app/login/page.tsx` (+ `LoginForm.tsx`) + test

> Scope: enough to prove the cookie session round-trips (login → me → logout). Full merchant dashboard auth UX is M2.

- [ ] **Step 1:** `src/lib/auth.ts` — `login(email,password)`, `logout()`, `getMe()` using the API client (credentials-include) against `/v1/auth/*`.
- [ ] **Step 2:** Minimal `/login` page (client) — email/password form → `login()` → on success redirect to `/` (or show `me`). Show envelope errors (e.g. `AUTH_INVALID_CREDENTIALS`).
- [ ] **Step 3: Test** — `login()` posts credentials and, on `{ok:true}`, `getMe()` returns the user (mock fetch with cookie semantics); `logout()` calls the endpoint. (Cross-subdomain cookie behaviour is a deferred manual verification — no real domain yet.)
- [ ] **Step 4: Commit** `feat(m1c): minimal browser auth flow (login/logout/me cookie round-trip)`

---

### Task 8: next-intl scaffolding (8 SA languages)

**Files:** `next.config.ts` (next-intl plugin), `src/i18n/` (config + `messages/en.json` + stubs), wrap `src/app/layout.tsx`

- [ ] **Step 1:** Install `next-intl`; configure the plugin + request config. Create `src/i18n/messages/en.json` with the existing visible nav/CTA strings extracted; add stub message files for `zu, xh, af, st, tn, nso, ts` (copy en values as placeholders — full translation is later).
- [ ] **Step 2:** Wrap the app with `NextIntlClientProvider` (locale from a cookie/default `en`); add a minimal language switcher in the Navbar (sets the locale cookie). Keep default `en` so existing pages render unchanged.
- [ ] **Step 3: Verify** — `npm run build` succeeds; site still renders in `en`; switching locale to a stub keeps the page working (placeholder strings). Test: the i18n config loads `en` messages.
- [ ] **Step 4: Commit** `feat(m1c): next-intl scaffolding (en + 7 SA-language stubs + switcher)`

---

### Task 9: Sentry (frontend)

**Files:** `@sentry/nextjs` config files; `next.config.ts`

- [ ] **Step 1:** Add `@sentry/nextjs` (client/server/edge configs) gated on `NEXT_PUBLIC_SENTRY_DSN` (no-op when unset). Wrap `next.config.ts` with `withSentryConfig`.
- [ ] **Step 2: Verify** — `npm run build` succeeds with DSN unset (no-op); no runtime error on a normal page load.
- [ ] **Step 3: Commit** `feat(m1c): frontend Sentry (no-op when unconfigured)`

---

### Task 10: Final verification, live-env smoke, push & PR

- [ ] **Step 1: Backend gate** (DB+Redis up) — `cd server && npm ci && prisma generate && migrate deploy && db:seed && typecheck && lint && test && build && openapi:check` → green.
- [ ] **Step 2: Frontend gate** — root `npm ci && npm run typecheck && npm run lint && npm run test && npm run build` → green.
- [ ] **Step 3: Live-env smoke** (the whole point) — with API :8080 (CORS incl. localhost:3001) + UI :3001 running: submit the **contact form** in the browser → a `Lead` row (source `CONTACT`) is persisted (`psql`/Prisma studio confirms); submit impact + stories likewise; `/login` round-trips a cookie session against the live API. Capture evidence.
- [ ] **Step 4: Push + PR** — `gh pr create --title "M1-C: frontend integration, leads, i18n, observability" --body "POST /v1/leads + wired marketing forms (live capture), browser auth round-trip, next-intl scaffolding, Sentry+OTel, AiUsage write path. Seed data only." --base main`
- [ ] **Step 5: STOP for validation.** Do not merge or start M2.

---

## Acceptance Criteria (validated in Claude Code before merge)

- [ ] `POST /v1/leads` persists Leads for all 3 sources (enum-mapped), validates, rate-limits, audits, best-effort notifies; public.
- [ ] The 3 marketing forms submit through the BFF to the backend and persist real Leads (live-env smoke proven), with loading/error/success states.
- [ ] Browser auth round-trips a cookie session (login → me → logout) against the live API.
- [ ] `next-intl` scaffolded (en + 7 stubs + switcher); site still renders; build green.
- [ ] Sentry (frontend + backend) + OTel wired, no-op when unconfigured, no crash.
- [ ] `AiUsage` row writable via `recordAiUsage`; `ai.enabled` kill-switch setting seeded; **no real AI calls / no lib/ai.js gateway**.
- [ ] Dev CORS allows the UI origin; both gates green **in CI**; ZAR integer cents; seed data only.

## Self-Review

**Spec coverage** (vs architect contract §7 M1-C): `/v1/leads` (T1), BFF + form wiring (T6), browser auth round-trip (T5/T7), next-intl (T8), Sentry+OTel (T3/T9), AiUsage table+settings (T2), dev CORS (T4). The architect's M1-C acceptance ("forms persist Leads; login round-trips; Sentry captures; trace; AiUsage row writable") is each a task. `lib/ai.js` gateway correctly deferred to M5.

**Placeholder scan:** No "TODO/implement later" — the M0-C `TODO(M1)` form markers are *replaced* with live calls in T6. The i18n stub locales are intentional placeholders (full translation is a later content task), explicitly scoped.

**Type/name consistency:** `apiFetch`/`getJson`/`postJson` (T5) used by the forms (T6) and auth (T7). The BFF posts to `/v1/leads` matching the backend route (T1). `source` lowercase→enum mapping is defined in T1 and used by the forms in T6. `recordAiUsage` signature (T2) matches the `AiUsage` schema (`docs/SCHEMA.md`). `NEXT_PUBLIC_API_BASE_URL` is the single API base used by the client.
