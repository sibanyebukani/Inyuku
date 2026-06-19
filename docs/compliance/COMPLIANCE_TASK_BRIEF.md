# Compliance Task Brief — Inyuku Digital (POPIA readiness for M1)

> **For:** `bukani-compliance` · **Commissioned by:** EA-ADR-015 + founder (Sibanye) · **Date:** 2026-06-19
> **Objective:** Stand up Inyuku's POPIA compliance posture so the **pre-production-PII gate** can clear
> before the M1 backend goes live with real merchant data, and complete the POPIA half of M1 gate #5.
> **Grounding docs:** `docs/POPIA.md`, `docs/DECISIONS.md`, `/home/sibnaye/Development/bukani-decisions.md`
> (EA-ADR-001 precedent, EA-ADR-014/015). Responsible party: Inyuku Digital. Information Officer: Sibanye Bukani
> (see `docs/OWNERS.md` — note other owners are currently MOCK and must be confirmed).

## The hard gate this brief serves

> **No production personal information may flow to Railway / Cloudflare R2 until (a) the sub-processor
> risk assessment is complete AND (b) the operator DPAs are signed and logged.** (EA-ADR-015.) This is a
> release gate on M1's first real-data deployment — not a checkbox.

## Context (resolved stack — what processes PII)

| Sub-processor | Role | Data | Region |
|---|---|---|---|
| Railway | Postgres 16 + Redis 7 + backend compute | All merchant/customer PII, OTPs, sessions | EU (pinned) |
| Cloudflare R2 | Object storage | Product images, story uploads, generated reports | EU (pinned) |
| 360dialog | WhatsApp BSP | Phone numbers, message content | check region |
| TradeSafe | Escrow payments | Names, emails, bank/settlement data | SA (escrow holder) |
| Resend | Email | Names, emails | check region |
| BulkSMS | SMS/OTP | Phone numbers | SA |
| Sentry | Error monitoring | Potentially PII in error context (must be pii-masked) | check region |
| Vercel | Frontend hosting | Minimal (no system-of-record PII) | edge |

## Tasks

| # | Task | Owner | Depends on | Deliverable / acceptance | Timing |
|---|---|---|---|---|---|
| C-1 | **Information Officer registration** with the Information Regulator of South Africa (responsible party = Inyuku; IO = Sibanye). | Sibanye (human) | — | Registration submitted + confirmation reference logged in `docs/POPIA.md`. | M0 (now) — longest lead |
| C-2 | **Sub-processor risk assessment** for each PII-processing vendor above (Railway + R2 are the hard EA-ADR-015 ones; assess the rest too). | bukani-compliance | C-1 IO named | One assessment per sub-processor (data categories, region, safeguards, residual risk) in `docs/POPIA.md`. | M0 → before M1 prod data |
| C-3 | **Operator DPAs** — obtain/sign POPIA-equivalent data-processing agreements (their GDPR DPAs satisfy §72) with Railway, Cloudflare, 360dialog, Resend, BulkSMS, Sentry, TradeSafe. | Sibanye (sign) + bukani-compliance (review) | C-2 | Signed DPAs filed; each entered in the **§72 transfer log** in `docs/POPIA.md`. | before M1 prod data |
| C-4 | **POPIA processing register** — complete the register: data categories, purposes, lawful basis, recipients, cross-border, retention. | bukani-compliance | — | Register section of `docs/POPIA.md` complete (no TBDs). | M1 |
| C-5 | **Retention matrix** — define retention periods per data category (currently a stub/TODO in POPIA.md). | bukani-compliance | C-4 | Retention matrix with concrete periods + deletion/de-identification rule. | M1 |
| C-6 | **Consent ledger model** — confirm `Consent` / `ConsentRevocation` table shape + capture/withdraw flows with `bukani-architect` (feeds the M1 Prisma schema). | bukani-compliance + bukani-architect | — | Agreed consent data model + flow note in DECISIONS/POPIA. | before M1 schema (Task) |
| C-7 | **Data-subject-request (DSR) playbook** — access / correction / deletion / objection process + SLAs. | bukani-compliance | C-4 | DSR playbook in `docs/POPIA.md`. | M1 |
| C-8 | **Breach-notification process** — detect → assess → notify Regulator + data subjects, with timelines. | bukani-compliance | — | Breach process doc + owner (IO/Deputy). | M1 |
| C-9 | **Lending-data boundary policy** — document and police that verified-transaction data is INTERNAL analytics only, never a shareable/exportable credit score (keeps NCA/NCR out). | bukani-compliance | — | Boundary statement in `docs/POPIA.md` + a review rule for any future "score/share" feature. | M1, then ongoing |
| C-10 | **PCI scope confirmation** — confirm TradeSafe-hosted gateway ⇒ card data never touches Inyuku ⇒ **SAQ-A**; note that pulling in-person POS forward re-opens this. | bukani-compliance | — | PCI scope note in `docs/POPIA.md`. | before M4 (payments) |
| C-11 | **Finalize DRAFT legal copy** — route the DRAFT `/privacy` + `/terms` (M0-C) to external legal counsel; lift the DRAFT banners once approved. | Sibanye + counsel | C-4, C-5 | Lawyer-approved privacy + terms; DRAFT banners removed. | before launch |
| C-12 | **CPA review** — consumer-protection review of the commerce surface (returns, refunds, platform-vs-supplier liability). | bukani-compliance | — | CPA review note. | M2 / M4 |

## Out of scope (deferred, do not start)

- **NCA / NCR (lending)** — deferred with lending. Only the *data foundation* exists (C-9 boundary). Do not register as a credit provider or build credit-bureau sharing.

## Human-in-the-loop (only Sibanye / counsel can do these)

- C-1 (regulator registration), C-3 (signing DPAs), C-11 (legal sign-off). bukani-compliance prepares everything around them; the founder/counsel execute.

## Definition of done (for the M1 prod-data gate)

- [ ] C-1 IO registration filed.
- [ ] C-2 Railway + R2 risk assessments complete.
- [ ] C-3 Railway + R2 (minimum) operator DPAs signed + logged in the §72 transfer log.
- [ ] C-4 processing register has no TBDs for the data M1 will collect.

Once these four are done, the EA-ADR-015 pre-production-PII gate is cleared and M1 may deploy with real data.
