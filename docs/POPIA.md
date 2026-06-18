# Inyuku Digital — POPIA Compliance Register

> **Owner:** Information Officer (Inyuku/founder), with bukani-compliance.
> **Status:** M0 deliverable in progress. **No production personal information may flow to any
> sub-processor before the bukani-compliance sub-processor risk assessment and signed operator DPAs
> are on file** (release gate, EA-ADR-015).
> **References:** EA-ADR-014 (topology), EA-ADR-015 (sub-processors / §72 basis), `docs/DECISIONS.md` ADR-003/005/006.
> **Applicable law:** POPIA (Protection of Personal Information Act, 2013). Inyuku is **SA-only**; GDPR is
> not the operative regime. CPA applies to the commerce surface. NCA/NCR are **deferred with lending**.

---

## 1. Responsible party & Information Officer

| Item | Value |
|---|---|
| Responsible party | Inyuku Digital |
| Information Officer | Founder (Sibanye) — **role owner TBD/confirm** |
| Deputy Information Officer(s) | TBD (founder to appoint) |
| Information Regulator registration | **M0 deliverable — in progress** (info-officer registration) |
| PAIA manual | Required — to be published before public launch |
| Breach / security-compromise process | Required (POPIA §22 notification) — to be documented in the runbook |

---

## 2. Processing register (purpose-bound)

Every processing activity below is tenant-scoped by `businessId` (ADR-005). Lawful basis is noted per item.

| Data category | Examples | Subjects | Purpose | Lawful basis | Store |
|---|---|---|---|---|---|
| Merchant account / identity | name, email, phone, password hash | Merchant owners/staff | Auth, account mgmt | Contract / legitimate interest | Postgres (`User`) |
| Merchant business profile | business name, type, location, WhatsApp number, language | Merchants | Onboarding, service delivery | Contract | Postgres (`Business`) |
| OTP / verification | phone OTP codes | Merchants/customers | Phone verification | Contract | Redis (`PhoneOtp`, short TTL) |
| Catalog media | product images, story uploads | Merchants | Commerce display | Contract | Cloudflare R2 (EU) |
| Order / customer directory | customer name, phone, order detail | End customers (data subjects of merchants) | Order processing | Contract / merchant as operator | Postgres |
| Payment / transaction | escrow transaction IDs, amounts (ZAR cents), allocations | Merchants + customers | Payment via TradeSafe escrow | Contract | Postgres + TradeSafe (card data never touches Inyuku) |
| WhatsApp messages | session content via 360dialog | Customers | Channel commerce | Contract / consent for marketing templates | 360dialog + Postgres metadata |
| AI assistant prompts/outputs | merchant queries, generated reports | Merchants | AI Business Assistant | Contract; PII minimised in prompts | Claude via `lib/ai.js`; logged with PII redaction |
| Verified-transaction analytics | aggregated transaction history | Merchants | **Internal merchant analytics only — NOT a credit score** (ADR-006) | Legitimate interest | Postgres (internal) |
| Audit / error logs | actor, action, requestId (PII-masked) | Merchants/staff | Security, compliance | Legal obligation / legitimate interest | Postgres (`AuditLog`, `ErrorLog`) |
| Consent records | consent grants + revocations | Merchants/customers | Consent management | Legal obligation | Postgres (`Consent`, `ConsentRevocation`) |
| Marketing leads | name, email, message | Prospects | Sales follow-up | Consent | Postgres (`Lead`) |

PII fields are minimised in AI prompts and masked by the chassis `logger` + `pii-mask` in all logs.

---

## 3. §72 cross-border transfer log

POPIA §72 governs transfer of personal information outside South Africa. **Basis for all transfers below =
binding operator DPAs (NOT data-subject consent).** EU-region pin is mandatory and verified, not defaulted.

| Sub-processor | Service | Data | Region | §72 basis | Status |
|---|---|---|---|---|---|
| Railway | Postgres 16 (primary datastore) + Redis 7 (cache/rate-limit/OTP) | All Inyuku PII categories | EU (pinned) | Binding operator DPA | DPA + risk assessment **pending** (pre-production gate) |
| Cloudflare R2 | Object storage (product images, uploads, reports) | Media, generated reports | EU bucket (pinned) | Binding operator DPA | DPA + risk assessment **pending** (pre-production gate) |
| TradeSafe | Escrow payments | Transaction metadata (no card data) | SA | Operator agreement | To confirm |
| 360dialog | WhatsApp BSP | Message content/metadata | To confirm | Operator agreement | To confirm |
| Anthropic (via `lib/ai.js`) | AI inference | Minimised prompts | — | Operator terms; no training on API data (assumption under review) | Governed by EA-ADR-010/012 |
| Resend | Transactional email | email, name | To confirm | Operator agreement | To confirm |
| BulkSMS | SMS/OTP | phone | SA | Operator agreement | To confirm |

---

## 4. Sub-processor list & the pre-production-PII gate

**Hard gate (EA-ADR-015):** No production personal information flows to Railway or Cloudflare R2 until:
1. **bukani-compliance** completes a sub-processor risk assessment, AND
2. signed **binding operator DPAs** are on file for each, AND
3. **EU-region pins** are configured and verified on Postgres, Redis, and the R2 bucket.

Adding or changing a sub-processor (or a sub-processor changing its own data-centre footprint / sub-processor
list) is a re-evaluation trigger and requires a fresh assessment.

---

## 5. Consent ledger model

Consent is recorded as durable, append-only records (never silently overwritten):

- **`Consent`** — `id`, `businessId`, subject ref, `purpose` (e.g. marketing, AI-handled comms, WhatsApp
  template), `grantedAt`, `source`, version of the notice consented to.
- **`ConsentRevocation`** — `id`, `consentId`, `revokedAt`, `reason`. A revocation never deletes the original
  grant; it supersedes it (audit trail).

AI-handled customer comms require explicit consent + PII minimisation (EA-ADR-012). Marketing leads (`Lead`)
are consent-based.

---

## 6. Retention matrix (stub — to be finalised in M1/Track E)

| Data | Retention | Disposal |
|---|---|---|
| OTP codes | Minutes (TTL) | Auto-expire in Redis |
| Marketing leads | TBD (e.g. 24 months from last contact) | Soft-delete then purge |
| Order/transaction records | TBD (tax/CPA minimum — likely 5 years) | Archive then purge |
| Audit/error logs | TBD (security retention window) | Rotate/purge |
| Account data | Life of account + TBD grace | Erasure on verified request (POPIA data-subject right) |
| AI prompt/output logs | TBD (minimised; short window) | Purge |

> **TODO (not a finished section):** retention periods marked TBD must be set with bukani-compliance before
> production PII (Track E, M1). Tracked here deliberately as an open compliance item.

---

## 7. Lending-data boundary (ADR-006)

The verified-transaction data foundation is **internal merchant analytics only**. It is **explicitly NOT a
shareable, exportable, or third-party-facing credit score**, and no API/export/partner surface emits a
credit-decision output. This boundary keeps **NCA/NCR out of scope**. Un-deferring lending re-opens NCA/NCR
and requires a new regulated-program assessment (EA-ADR-015 re-evaluation trigger).

---

## 8. PCI scope

Card data **never touches Inyuku** — payments run through the **TradeSafe-hosted gateway**, putting Inyuku in
**SAQ-A** scope. Card-present / in-person POS is **deferred**; pulling it forward re-opens PCI scope.

---

## 9. Open items

- Information Officer / deputy appointment confirmation (founder TBD).
- Sub-processor DPAs + bukani-compliance risk assessment (pre-production-PII gate).
- Retention periods (§6 TBDs).
- Brand/data domain confirmation (affects cookie/host config, not the POPIA basis) — see ADR-004.
- CPA review of the commerce surface in M2/M4.
