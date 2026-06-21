# Inyuku Digital — Threat Model (STRIDE)

> **Owner:** bukani-architect (Inyuku); **sign-off authority:** bukani-security.
> **References:** EA-ADR-012 (AI autonomy boundary + third STRIDE gate), EA-ADR-014 (topology),
> EA-ADR-015 (POPIA / sub-processors), `docs/DECISIONS.md` ADR-001/002/004/005.
> **Method:** STRIDE (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service,
> Elevation of privilege).

Two surfaces carry a **mandatory STRIDE gate** before production:
1. **TradeSafe payment / escrow surface.**
2. **The tool-using AI Business Agent** (the portfolio's third STRIDE gate, EA-ADR-012).

Plus two cross-cutting surfaces modelled here: **auth (JWT rotation / cookies)** and **PII storage**.

---

## Gate status summary

| Surface | bukani-security sign-off | When (gate) |
|---|---|---|
| TradeSafe payment / escrow | **REQUIRED** | Before M4 payments ship in prod |
| AI Business Agent (tool-using) | **REQUIRED** (EA-ADR-012 third gate) | Before the tool-using agent ships in prod (M5) |
| Auth (JWT rotation / cookie) | Reviewed in M1; sign-off with the M1 backend baseline | M1 |
| PII storage (Postgres/R2, EU) | Folded into the EA-ADR-015 pre-production-PII gate (bukani-compliance + security) | Before production PII |
| **M2 Commerce Core (sync/idempotency + RBAC cost-split + customer PII + PostHog)** | **REQUIRED** | **Before M2 GA** |

AI-0/gateway-only work (no tool use, no customer-facing action) does **not** need the agent gate (EA-ADR-012).

---

## 1. TradeSafe payment / escrow surface — STRIDE (gate: before M4)

Context: TradeSafe GraphQL, OAuth2 client-credentials; Tokens / transactionCreate / Allocations; split +
settlement. Inyuku **never holds funds** (not a payment facilitator). Card data never touches Inyuku (SAQ-A).

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Forged settlement/webhook callbacks from a non-TradeSafe source | Verify webhook signatures/origin; OAuth2 client-credentials kept in encrypted `Setting` (AES-256-GCM), not env |
| **T**ampering | Amount/allocation tampering between order and escrow | ZAR-as-integer-cents end-to-end; server-side amount derivation; idempotency keys; reconcile against TradeSafe as source of truth |
| **R**epudiation | "I never authorised that payout/allocation" | `AuditLog` on every payment state transition; immutable transaction records (soft-delete only) |
| **I**nfo disclosure | Leakage of transaction data across tenants | `businessId` scoping on every query; PII-masked logs; no card data stored |
| **D**enial of service | Webhook flood / replay | Rate-limit; idempotent webhook handling with replay detection |
| **E**levation | Staff triggering payouts beyond their permissions | Permission-RBAC at the route layer; write actions through the gated order/fulfilment flow |

Payments-grade QA: idempotency, reconciliation, no-double-charge, webhook replay (roadmap §5 M4).

---

## 2. AI Business Agent (tool-using) — STRIDE (gate: before M5, EA-ADR-012 third gate)

Context: multilingual assistant via `lib/ai.js`; the agent holds **read-scoped tools** by default; writes go
through the **gated order/fulfilment flow**, never direct DB mutation. The agent is its **own least-privilege
principal** (ADR-005). Headline risk: **prompt injection → privilege escalation**.

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Injected instructions impersonating an operator/system | Untrusted content (tickets, WhatsApp messages) treated as data, not instructions; system prompt isolation |
| **T**ampering | Injected content steering a write/tool call | Writes only via the gated order flow with human/rule approval; agent never re-implements business logic |
| **R**epudiation | Disputed agent-initiated action | All agent tool calls + proposed writes logged to `AuditLog` and `AiUsage` |
| **I**nfo disclosure | Injected instruction exfiltrating another tenant's data into a reply | `businessId`-scoped tools; PII minimisation in prompts; redacted AI logs (EA-ADR-012) |
| **D**enial of service | Prompt-driven cost runaway | Per-feature rate limits; token/tier caps; **R3,000/mo AI ceiling**; **kill switch** (EA-ADR-011) |
| **E**levation | Confused-deputy: write on behalf of the wrong tenant; tool authorisation bypass | Agent runs under its own least-privilege permission set; same `permissions` checks as any caller; no autonomous irreversible action; fail-closed to human handling |

**bukani-security STRIDE review is a hard release gate** for this surface, focused on: prompt injection →
privilege escalation, tool-call authorisation, data exfiltration via the model, and confused-deputy through
the order flow (EA-ADR-012).

---

## 3. Auth (JWT rotation / cookie) — STRIDE (reviewed M1)

Context: in-house JWT + refresh-token rotation, bcrypt-12, permission-RBAC, cross-subdomain HttpOnly cookies
on `.inyuku.co.za` (provisional); API at `api.inyuku.co.za`; CORS locked to `*.inyuku.co.za` (ADR-004).

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Stolen/forged token | Short-lived access + rotating refresh; signed JWTs; HttpOnly + Secure + SameSite cookies |
| **T**ampering | Token payload tampering | Signature verification; secrets in encrypted `Setting`/Railway secret (separate trust boundary) |
| **R**epudiation | Session disputes | `AuditLog` on auth events; server-side logout clears the cookie |
| **I**nfo disclosure | Token theft via XSS/CSRF | HttpOnly (no JS access); SameSite + CORS lock; CSP via Helmet |
| **D**enial of service | Credential-stuffing / OTP abuse | Rate-limit (Redis-backed); bcrypt-12 cost; OTP TTL + attempt caps |
| **E**levation | Privilege escalation across tenants/roles | Permission-RBAC at the route layer; `businessId` + `Membership` scoping |

---

## 4. PII storage (Postgres / R2, EU) — STRIDE (EA-ADR-015 gate)

Context: PII in Railway Postgres + Cloudflare R2, EU-region-pinned; §72 basis = operator DPAs.

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Unauthorised access to the datastore | Network/credential isolation; secrets in Railway secret store |
| **T**ampering | Unauthorised mutation of PII | Permission-RBAC; `AuditLog`; soft-delete for regulated records |
| **R**epudiation | Disputed data changes | `AuditLog` + `Consent`/`ConsentRevocation` ledger |
| **I**nfo disclosure | Cross-tenant leakage; over-broad signed URLs; sub-processor exposure | `businessId` scoping; R2 private-by-default + short-TTL signed URLs; **pre-production-PII gate** (bukani-compliance assessment + DPAs) before any PII flows |
| **D**enial of service | Storage exhaustion / abuse | Quotas; rate-limit on upload routes |
| **E**levation | Reading another tenant's objects | Authenticated routes issue scoped signed URLs only; no public listing of private buckets |

**Sign-off:** the PII-storage posture is gated by the EA-ADR-015 pre-production-PII assessment
(bukani-compliance + bukani-security) before any production personal information is stored.

---

## 5. M2 Commerce Core — STRIDE (gate: before M2 GA)

Context (M2): offline-first commerce — product catalog, stock-as-movements ledger (ADR-INY-013),
orders, **customer PII directory**, merchant dashboard, **batch offline sync** (clientId idempotency +
LWW on `occurredAt`, ADR-INY-016), **PostHog** first-party analytics, and an **owner/staff RBAC
cost-split** (`catalog:read_cost` + `dashboard:read_financial` owner-only).

**High-risk surfaces this milestone:** (1) the **customer PII directory**, (2) **offline-sync
convergence / idempotency**, (3) the **PostHog sub-processor**.

| STRIDE | Threat | Mitigation |
|---|---|---|
| **S**poofing | Forged sync ops from a non-member device | Auth cookie + `sync:write`; `businessId` resolved server-side; cross-tenant → 403/404 |
| **T**ampering | Replayed/duplicated sync ops double-applying sales; LWW abused to clobber server state | Per-tenant `clientId` idempotency (`DUPLICATE` no-op); last-writer-wins on `occurredAt`; append-only stock ledger is convergent (no counter to clobber) |
| **R**epudiation | "I didn't void/adjust that" | `AuditLog` on `(product/order/customer, …)` + `(stock_movement, CREATE)`; ledger is append-only |
| **I**nfo disclosure | Staff seeing cost/margin; cross-tenant customer-PII leak; PII leaking into analytics | **RBAC cost-split** (`catalog:read_cost` / `dashboard:read_financial` owner-only); `businessId` scoping; **PII masked** in `AnalyticsEvent.properties`; PostHog gated (EU/self-host + DPA, ships dark) |
| **D**enial of service | Oversized/abusive sync batches | **≤ 100 ops** per batch; rate-limit; partial-success (one bad op doesn't fail the queue) |
| **E**levation | Confused-deputy via sync writing to the wrong tenant; staff escalating to financial reads | Sync ops re-checked against the caller's permissions + resolved `businessId`; cost/financial perms owner-only; `AI_AGENT` read-only commerce, no `sync:write` |

**bukani-security review is a pre-GA gate** for M2, focused on: **sync/idempotency** correctness
(replay, double-apply, LWW edge cases) and the **RBAC cost-split** (no path leaks `costPriceCents` or
financial dashboard fields to `MERCHANT_STAFF` / `AI_AGENT`). Customer-PII processing also depends on the
bukani-compliance consent ruling (`docs/POPIA.md` §7a) and the PostHog sub-processor gate.

---

## 6. M1-B auth & tenancy — STRIDE review verdict (2026-06-20)

`bukani-security` reviewed the M1-B auth surface (branch `feature/m1b-auth-tenancy`, merged PR #4).
Initial verdict **PASS-WITH-FIXES** (2 high blockers + M1/M2/M3 + L2); after fixes (commits `a685ac6`,
`b510ed8`), the verification re-review returned **GATE: PASS**.

**Resolved:** H1 OTP brute-force (CSPRNG codes + Redis `otp-verify` throttle + single-active-OTP);
H2 spoofable X-Forwarded-For (`trustProxy` from `TRUSTED_PROXY_HOPS`, rate-limits key on Fastify
`req.ip`, global auth limiter); M1 CSRF (Origin/Referer allowlist + SameSite=Lax); M2 invite
no-enumeration; M3 name redaction in audit; L2 `User.phone @unique`.

**Verified-correct:** authz re-loads `Membership` from DB (never trusts the JWT claim), refresh
rotation + family reuse-detection (transactional), constant-time login, sha256-at-rest tokens,
cross-tenant isolation, HS256 alg-allowlist, fail-closed CORS, no prod stack traces.

**Accepted residual risks (documented):**
1. **Audit-log IP is XFF-derived/spoofable** — LOW; affects only forensic attribution, no control depends on it. *Re-eval trigger:* if audit IP is ever used for a security decision, move to `req.ip` (becomes a blocker).
2. ⚠️ **`TRUSTED_PROXY_HOPS` must be set to the real proxy hop count in prod** (Cloudflare+Nginx = 2, single LB = 1) before cutover — else all clients share one rate-limit bucket (availability foot-gun, not a spoof). **PROD-DEPLOY GATE — see below.**
3. Over-redaction of `*name*` keys in audit diffs (e.g. `businessName`) — intentional, safe direction.
4. OTP residual: 5 guesses/active code over 1e6, gated by request + verify rate limits — negligible.

**Non-blocking follow-ups (next iteration):** per-route-class global limiter buckets; a boot-time
warn if `NODE_ENV=production` and `TRUSTED_PROXY_HOPS` is unset.

### Production-deploy gates (must clear before live cutover — track alongside the EA-ADR-015 PII gate)
- [ ] **`TRUSTED_PROXY_HOPS`** set to the prod topology's hop count + verified (`req.ip` logs the real client IP post-deploy).
- [ ] EA-ADR-015 pre-production-PII assessment + signed Railway/R2 DPAs (compliance brief C-1..C-4).
- [ ] `CORS_ALLOWED_ORIGINS` + `COOKIE_DOMAIN` set to the real brand domain.
