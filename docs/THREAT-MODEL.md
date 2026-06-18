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
