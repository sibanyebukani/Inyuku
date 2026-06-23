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
| **M3-A WhatsApp/360dialog BSP plumbing (webhook signature/replay + tenant-routing)** | **APPROVED-WITH-CONDITIONS → 5 conditions IMPLEMENTED in M3-A** (merged PR #11) | Design-gate cleared at contract-freeze; **M3-A merged (sandbox)**; live PII send re-gated at cutover (EA-ADR-015) |

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

---

## 7. M3-A WhatsApp / 360dialog BSP plumbing — STRIDE (gate: design-gate before M3-A contract-freeze)

> **Commissioned by:** bukani-architect (M3-A contract-freeze dependency, brief §7.5 / §8).
> **Date:** 2026-06-22. **Risk class:** **high** (public unauthenticated network edge + new sub-processor + multi-tenant routing).
> **Data classes touched:** PII (WhatsApp customer phone number + message content), secrets (BSP API key + webhook verify token/app secret). **External integration:** 360dialog (BSP for Meta WhatsApp Cloud API).
> **M3-A scope (sandbox-first, server-side, online):** inbound webhook endpoint 360dialog calls; `Conversation`/`Message` persistence; outbound send (free-form + template); 24h session-window tracking; approved-template registry. **No commerce logic, no production PII in this slice** — but the contract must be production-safe.

**Central threat:** the inbound webhook is **public / unauthenticated at the network edge** (the BSP calls it; there is no Inyuku JWT/cookie/RBAC on this surface). Authenticity rests **entirely on payload signature verification**, and tenant resolution must **never trust attacker-controllable payload fields**.

### Asset inventory
- **Webhook HMAC secret / Meta app secret** — sensitivity: high — owner: bukani-security (storage), backend (use). Lives in encrypted `Setting`.
- **`dialog360.apiKey`** (outbound BSP key) — sensitivity: high — owner: backend. Already registered as a secret `Setting` (`docs/API.md` §Settings).
- **Subscription verify token** (handshake on webhook subscription) — sensitivity: high — owner: backend. Encrypted `Setting`.
- **`Message` content + customer phone number** — sensitivity: high (PII) — owner: tenant (`businessId`). Sandbox-only in M3-A; production gated on the 360dialog DPA.
- **Phone-number-id → `businessId` routing map** — sensitivity: high (a wrong mapping = cross-tenant disclosure) — owner: backend, server-side only.

### STRIDE
| Threat | Vector | Likelihood | Impact | Mitigation | Residual risk | Accepted? |
|---|---|---|---|---|---|---|
| **S**poofing | Forged inbound webhook from a non-360dialog source posting fake customer messages / status callbacks to the public endpoint | High (endpoint is public) | High (fake messages, fake order triggers in M3-B, log/audit pollution) | **HMAC signature verification on the raw request body BEFORE any parse/DB write** (Meta/360dialog sign with the app secret; verify `X-Hub-Signature-256` = `sha256=HMAC(appSecret, rawBody)` using a **constant-time compare**). Secret in encrypted `Setting` (`whatsapp.webhook.appSecret`), **never env-plaintext, never in code**. Subscription handshake verify token also from encrypted `Setting`. **Fail closed:** unverified or unsigned → `401`, no parse, no persist, no side effect. | Low — verification is the sole authenticity control; depends on secret hygiene + raw-body capture before any body parser mutates it | **Y** — standard BSP scheme; conditioned on raw-body capture + constant-time compare being in the contract |
| **T**ampering / **Replay** | A captured valid webhook is replayed (or 360dialog legitimately retries) → duplicate `Message` rows, duplicated downstream sends/orders (M3-B) | High (retries are normal BSP behaviour; AC M3-S1/AC3 + M3-S5/AC2) | Medium–High (double-apply; in M3-B double order/stock) | **Idempotency on the provider message/event id** (`@@unique([businessId, providerMessageId])` on `Message`; `INSERT … ON CONFLICT DO NOTHING` → no-op on redelivery). Distinct from the M2 client-`clientId` convention (provider-id, not client-id — brief §9). **Replay window:** reject events whose provider timestamp is older than a bounded skew (recommend **±5 min** signature-freshness window where 360dialog supplies a timestamp; if no trustworthy timestamp, idempotency-id dedup is the primary control and the window is advisory). Signature covers the body so field tampering is caught by Spoofing control. | Low — idempotency makes redelivery a safe no-op; window bounds long-horizon replay | **Y** — provided the unique constraint + ON CONFLICT no-op land in the schema/contract |
| **R**epudiation | "I never received / never sent that message"; disputed verification-failure forensics | Medium | Medium | Chassis **audit-logger** emits: `(whatsapp_message, RECEIVE)` on verified inbound, `(whatsapp_message, SEND)` on outbound, and `(whatsapp_webhook, VERIFY_FAILED)` on every rejected/unsigned request (with masked metadata + source IP). `Message` rows are append-only/immutable (soft-delete only). `ErrorLog` on send failures. | Low | **Y** |
| **I**nfo disclosure | Raw message bodies / customer phone numbers leaking into application logs; BSP API key or webhook secret leaking via logs, errors, or client bundle; cross-tenant content exposure | Medium–High (PII volume) | High (POPIA personal information) | **Chassis `logger` + `pii-mask` mandatory on this surface — raw `Message.body` and phone numbers NEVER written to logs** (brief §9, AC M3-S5/AC4); log only masked metadata (provider id, direction, masked msisdn, `businessId`). Secrets only in encrypted `Setting`; **never returned by any API, never in the client bundle** (server-side send only). Response envelope (`docs/API.md`) — no internal error/stack leakage to the BSP. Cross-tenant content blocked by `businessId` scoping (see Elevation). | Low — pre-production PII additionally gated by EA-ADR-015 360dialog DPA | **Y** — conditioned on pii-mask enforced + no secret ever in a response |
| **D**enial of service | Webhook flooding (the endpoint is public and unauthenticated); slow downstream blocking the ack so 360dialog retries/backs-off | Medium–High | Medium (ingest stall, retry storms, cost) | **Fast-ack-then-process:** verify signature → persist raw event durably → **return 2xx fast**, do heavy work async (brief §90 / M3-S5/AC3 requires fast ack). **Redis-backed rate-limit** on the webhook route, **scoped to the resolved `businessId` (post-routing) with a global per-edge ceiling** (cannot scope to user — no auth). Keep rate-limit keying off the spoofable XFF problem from the M1-B review — key on the resolved tenant + `req.ip` under `TRUSTED_PROXY_HOPS`. **BullMQ is scoped to orders/fulfilment only (ADR-007)** → an async webhook-ingest queue/outbox is a **NEW queue = explicit architect decision** (see Conditions). | Medium — public endpoint is inherently floodable; mitigated by fast-ack + rate-limit + Cloudflare edge | **Conditional** — accepted **iff** the architect rules on fast-ack-then-async (durable outbox vs new BullMQ queue) |
| **E**levation / **tenant-routing** | **CRITICAL.** Inbound message routed to the wrong `businessId` by trusting an attacker-controllable payload field → cross-tenant write/disclosure (confused deputy). No JWT/RBAC exists on this surface to catch it. | Medium | **High** (cross-tenant PII + in M3-B cross-tenant orders/stock) | **Tenant is resolved by a server-side lookup keyed on the WhatsApp business phone-number-id that 360dialog delivers, mapped through an Inyuku-owned `WhatsAppChannel`/number→`businessId` table — NEVER by trusting a `businessId`/tenant field in the payload.** Routing happens **only after** signature verification passes. **Unknown/unmapped phone-number-id → reject (do not auto-provision), audit `(whatsapp_webhook, UNROUTED)`.** Outbound send authorises against the caller's `Membership` permissions + the `Conversation.businessId` (inbound has no Inyuku caller, so it relies wholly on the number→tenant map). | Low — provided routing is map-driven and the map is Inyuku-controlled, not payload-derived | **Y** — conditioned on the server-side number→tenant map being mandated in the contract (no payload-trusted tenant field) |

### Re-evaluation triggers
- **Live-number cutover** (sandbox → production PII): re-open under the EA-ADR-015 360dialog DPA + EU-pin + bukani-compliance risk assessment gate, and the §7.3 responsible-party consent ruling (these GA-gate M3-B/M3-C, not M3-A design).
- If the webhook endpoint ever sits **without Cloudflare edge protection**, or if observed inbound volume sustains a flood pattern → re-evaluate the DoS posture (may force the async queue immediately).
- If a security control (not just forensics) ever depends on the audit IP, inherit the M1-B `req.ip`/`TRUSTED_PROXY_HOPS` requirement (becomes a blocker).
- If marketing/broadcast (brief §7.6) is ever scoped → re-model (heavier consent + cost + abuse profile).
- If M3-B order-capture is wired to inbound events such that a webhook can directly mutate stock/orders → re-confirm the replay/idempotency chain end-to-end (double-apply at the commerce layer).

### Verdict
**APPROVED-WITH-CONDITIONS — the 5 conditions are now implemented in M3-A** (merged PR #11 / `e530574`; sandbox slice). No unmitigated high-severity threat remains *for the sandbox slice*; the one **Conditional** item (DoS async-ack) and the **CRITICAL** tenant-routing item were accepted on the conditions below being baked into the contract — which they were (`docs/specs/2026-06-22-m3a-bsp-plumbing-contracts.md`) and shipped in code.

**Conditions the architect / KIMI must satisfy (contract-level) — all IMPLEMENTED in M3-A:**
1. ✅ **Signature verification before parse:** HMAC-SHA256 over the **raw** request body vs `X-Hub-Signature-256`, **constant-time compare**, **fail-closed (401)** before any parse/DB write. App secret + verify token in encrypted `Setting` (`whatsapp.webhook.appSecret`, `whatsapp.webhook.verifyToken`) — never env-plaintext, never in code, never in a response. *(Implemented: `whatsapp-webhook.routes.ts` scoped raw-body parser + `whatsapp-signature.ts`.)*
2. ✅ **Idempotent ingest:** `Message` carries the **provider message/event id**, `@@unique([businessId, providerMessageId])`, redelivery = `ON CONFLICT DO NOTHING` no-op; event-level `WhatsAppInboundEvent.providerEventId` unique. Advisory **±5-min** signature-freshness/replay window where a trustworthy provider timestamp exists. *(ADR-INY-018.)*
3. ✅ **Server-side tenant routing:** an Inyuku-owned **phone-number-id → `businessId`** map (`WhatsAppChannel`, `phoneNumberId` globally unique) is the **only** tenant source; **no `businessId`/tenant field is ever read from the payload**; routing runs **after** verification (in the drainer); **unmapped number → `UNROUTED` + audit**. *(ADR-INY-019.)*
4. ✅ **Logging/PII:** chassis `logger` + `pii-mask` mandatory — **raw message bodies + phone numbers never logged**; audit `(whatsapp_message, RECEIVE|SEND)`, `(whatsapp_webhook, VERIFY_FAILED|UNROUTED)` with masked metadata.
5. ✅ **DoS / async-ack:** webhook **fast-acks** (verify → persist durably to the `WhatsAppInboundEvent` outbox → 2xx) and processes heavy work **async** (interval drainer, `FOR UPDATE SKIP LOCKED`). Architect ruled **durable Postgres outbox, NOT a new BullMQ queue** (ADR-INY-017; ADR-007 scope preserved). Redis rate-limit on the route, keyed on `req.ip` (honour `TRUSTED_PROXY_HOPS`) with a global per-edge ceiling.

**Production (live-number) sign-off is a separate gate** — folded into the EA-ADR-015 360dialog sub-processor assessment + DPA + EU-pin and the §7.3 consent ruling; **no production WhatsApp PII flows until those clear** (mirrors PostHog: ships against the sandbox, live messaging stays dark).
