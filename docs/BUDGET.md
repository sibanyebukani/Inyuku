# Inyuku Digital — Operating Budget Ceilings

> **Status:** ⚠️ **MOCK / PLACEHOLDER FIGURES — REVISIT BEFORE VENDOR CONTRACTS.** These ZAR
> ceilings are rough early-stage estimates to unblock the M1 gate; replace with real numbers from
> vendor quotes before signing anything. Owner of record: **Sibanye Bukani**.
> **Last updated:** 2026-06-19.

## Guiding principle

Budgets are **ceilings**, not targets. Each line includes a kill-switch trigger that engineering can act on without re-approval.

## Approved ceilings (MOCK)

| Vendor / category | Service | Billing model | Monthly ceiling (ZAR) | Annual ceiling (ZAR) | Kill-switch trigger | Owner |
|---|---|---|---|---|---|---|
| Railway | Postgres 16 EU + Redis 7 + backend compute | Usage / subscription | 2,000 *(MOCK)* | 24,000 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| Vercel | Next.js frontend hosting | Pro + bandwidth | 600 *(MOCK)* | 7,200 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| Cloudflare | R2 object storage EU + CDN + DNS | Usage | 400 *(MOCK)* | 4,800 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| TradeSafe | Escrow payment processing | Per-transaction % | pass-through *(MOCK)* | pass-through | Cost of sales; track as % of GMV | Sibanye Bukani |
| 360dialog | WhatsApp BSP messaging | Monthly + per-conversation | 1,500 *(MOCK)* | 18,000 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| Resend | Transactional email | Per-email | 400 *(MOCK)* | 4,800 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| BulkSMS | SMS / OTP | Per-SMS | 800 *(MOCK)* | 9,600 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| Anthropic (via `lib/ai.js`) | Claude inference | Per-token | **3,000 (HARD CAP — EA-ADR-011)** | 36,000 | Hard cap enforced in code | Sibanye Bukani |
| Sentry + OpenTelemetry | Error tracking / observability | Usage / subscription | 500 *(MOCK)* | 6,000 *(MOCK)* | > 80% of monthly ceiling | Sibanye Bukani |
| Domain + DNS | Cloudflare registrar + DNS | Annual | ~20 *(MOCK)* | ~240 *(MOCK)* | N/A | Sibanye Bukani |
| **Total fixed platform** | (excl. TradeSafe % + AI cap) | | **~6,220 *(MOCK)*** | **~74,640 *(MOCK)*** | | Sibanye Bukani |

## ⚠️ Revisit list (before contracts)

- [ ] Replace every `(MOCK)` figure with a real vendor quote.
- [ ] Model the **unit-economics break point** (at what GMV / merchant count does 360dialog / BulkSMS / TradeSafe exceed take-rate?).
- [ ] Confirm the Anthropic R3,000/mo line against the portfolio AI ceiling at Inyuku's projected usage.

## Notes

- The AI line (R3,000/mo) is the **real** portfolio hard cap (EA-ADR-011), enforced by the `lib/ai.js` gateway — not a mock figure.
- TradeSafe is **cost of sales** (scales with GMV), not fixed overhead; Inyuku does not hold funds.
- All figures in code are integer **ZAR cents**; the table is in rands for readability.

## Approval

| Role | Name | Signature / date |
|---|---|---|
| Founder | Sibanye Bukani | *(provisional — mock figures, pending quotes)* |
