# Inyuku Digital — Operating Budget Ceilings

> **Status:** Template — pending founder approval and vendor quotes.
> **Purpose:** Set monthly/annual spending ceilings per vendor so M1 procurement and runbooks have guardrails.
> **Owner:** Founder (to fill); reviewed by operations + engineering.

## Guiding principle

Budgets are **ceilings**, not targets. Each line includes a 20% contingency buffer and a kill-switch trigger that engineering can act on without re-approval.

## Approved ceilings

| Vendor / category | Service | Billing model | Monthly ceiling (ZAR) | Annual ceiling (ZAR) | Kill-switch trigger | Owner |
|---|---|---|---|---|---|---|
| Railway | Postgres 16 EU + Redis 7 + backend compute | Usage / subscription | TBD | TBD | > 80% of monthly ceiling | TBD |
| Vercel | Next.js frontend hosting | Pro plan + bandwidth | TBD | TBD | > 80% of monthly ceiling | TBD |
| Cloudflare | R2 object storage EU + CDN + DNS | Usage | TBD | TBD | > 80% of monthly ceiling | TBD |
| TradeSafe | Escrow payment processing | Per-transaction % | TBD | TBD | Pass-through to merchant; no direct Inyuku cost | TBD |
| 360dialog | WhatsApp BSP messaging | Per-conversation | TBD | TBD | > 80% of monthly ceiling | TBD |
| Resend | Transactional email | Per-email | TBD | TBD | > 80% of monthly ceiling | TBD |
| BulkSMS | SMS / OTP | Per-SMS | TBD | TBD | > 80% of monthly ceiling | TBD |
| Anthropic (via `lib/ai.js`) | Claude inference | Per-token | TBD (hard cap R3,000/mo per EA-ADR-011) | TBD | Hard cap enforced in code | TBD |
| Sentry + OpenTelemetry | Error tracking / observability | Usage / subscription | TBD | TBD | > 80% of monthly ceiling | TBD |
| Domain + DNS | Cloudflare registrar + DNS | Annual | TBD | TBD | N/A | TBD |

## Notes

- AI spend is governed by **EA-ADR-011** (R3,000/month portfolio ceiling, kill switch, tiering).
- Payment processing costs (TradeSafe) are normally passed through to merchants or netted from payouts; Inyuku does not hold funds.
- All figures must be converted to integer ZAR cents in code; the table above is in rands for readability.

## Approval

| Role | Name | Signature / date |
|---|---|---|
| Founder | TBD | |
| Operations lead | TBD | |
| Engineering lead | TBD | |
