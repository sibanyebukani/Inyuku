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
| Customer directory (M2) | customer **name, phone, email**, notes | End customers (data subjects of the merchant) | Customer book / order linkage | **Pending consent ruling** — merchant-as-responsible-party vs Inyuku-as-operator (DEPENDENCY, §10) | Postgres (`Customer`) |
| Order / order lines (M2) | order detail, line snapshots, amounts (ZAR cents) | End customers | Order processing | Contract / merchant as operator | Postgres (`Order`, `OrderLine`) |
| Product analytics events (M2) | event name, **PII-masked properties**, pseudonymous `distinctId` | Merchants/staff (usage) | First-party product analytics | Legitimate interest; PII masked | Postgres (`AnalyticsEvent`) + **PostHog** (new sub-processor — gated, §3/§4) |
| Payment / transaction | escrow transaction IDs, amounts (ZAR cents), allocations | Merchants + customers | Payment via TradeSafe escrow | Contract | Postgres + TradeSafe (card data never touches Inyuku) |
| WhatsApp messages | session content via 360dialog | Customers | Channel commerce | Contract / consent for marketing templates | 360dialog + Postgres metadata |
| WhatsApp conversation/message content (M3) | inbound/outbound **message bodies**, customer **phone number**, provider message/event ids, session-window state | WhatsApp customers (data subjects of the merchant) | WhatsApp commerce-over-chat (channel plumbing + order capture + notifications) | **Pending consent/responsible-party ruling** (§7b) — transactional vs marketing/template basis to be ruled; do NOT decide | Postgres (`Conversation`, `Message`) + **360dialog** (new sub-processor — gated, §3/§4/§7b) |
| AI assistant prompts/outputs | merchant queries, generated reports | Merchants | AI Business Assistant | Contract; PII minimised in prompts | Claude via `lib/ai.js`; logged with PII redaction |
| Verified-transaction analytics | aggregated transaction history | Merchants | **Internal merchant analytics only — NOT a credit score** (ADR-006) | Legitimate interest | Postgres (internal) |
| Audit / error logs | actor, action, requestId (PII-masked) | Merchants/staff | Security, compliance | Legal obligation / legitimate interest | Postgres (`AuditLog`, `ErrorLog`) |
| Consent records | consent grants + revocations | Merchants/customers | Consent management | Legal obligation | Postgres (`Consent`, `ConsentRevocation`) |
| Marketing leads | name, email, message | Prospects | Sales follow-up | Consent | Postgres (`Lead`) |

PII fields are minimised in AI prompts and masked by the chassis `logger` + `pii-mask` in all logs.
The `pii-mask` sensitive-key set includes `name`, `firstname`, `lastname`, and `surname`, so names are
redacted in audit `changes` and other log payloads.

---

## 3. §72 cross-border transfer log

POPIA §72 governs transfer of personal information outside South Africa. **Basis for all transfers below =
binding operator DPAs (NOT data-subject consent).** EU-region pin is mandatory and verified, not defaulted.

| Sub-processor | Service | Data | Region | §72 basis | Status |
|---|---|---|---|---|---|
| Railway | Postgres 16 (primary datastore) + Redis 7 (cache/rate-limit/OTP) | All Inyuku PII categories | EU (pinned) | Binding operator DPA | DPA + risk assessment **pending** (pre-production gate) |
| Cloudflare R2 | Object storage (product images, uploads, reports) | Media, generated reports | EU bucket (pinned) | Binding operator DPA | DPA + risk assessment **pending** (pre-production gate) |
| TradeSafe | Escrow payments | Transaction metadata (no card data) | SA | Operator agreement | To confirm |
| **360dialog** *(M3 — NEW / re-scoped)* | WhatsApp BSP — inbound webhook ingest, outbound send, message storage | WhatsApp message **content + customer phone number** + metadata | **EU pin required (to confirm)** | **Binding operator DPA** (NOT consent) | **EA-ADR-015 extension — DPA + EU-pin confirmation + bukani-compliance risk assessment required before ANY production WhatsApp message (inbound or outbound) flows; live messaging ships DARK / sandbox-only until cleared** (§7b) |
| Anthropic (via `lib/ai.js`) | AI inference | Minimised prompts | — | Operator terms; no training on API data (assumption under review) | Governed by EA-ADR-010/012 |
| Resend | Transactional email | email, name | To confirm | Operator agreement | To confirm |
| BulkSMS | SMS/OTP | phone | SA | Operator agreement | To confirm |
| **PostHog** *(M2 — NEW)* | First-party product/event analytics | Event data (PII-masked properties, pseudonymous `distinctId`) | **EU / self-host pin required** | **Binding operator DPA** | **EA-ADR-015 extension — DPA + EU/self-host pin required before production events leave Inyuku; ships DARK until cleared** |

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
| WhatsApp conversation/message content (M3) | **TBD** (POPIA §6 — set with bukani-compliance before production messaging; may differ for transactional vs marketing) | Purge per ruled period; retention must be a **config value**, not hard-coded |

> **TODO (not a finished section):** retention periods marked TBD must be set with bukani-compliance before
> production PII (Track E, M1). Tracked here deliberately as an open compliance item.

---

## 7. Lending-data boundary (ADR-006)

The verified-transaction data foundation is **internal merchant analytics only**. It is **explicitly NOT a
shareable, exportable, or third-party-facing credit score**, and no API/export/partner surface emits a
credit-decision output. This boundary keeps **NCA/NCR out of scope**. Un-deferring lending re-opens NCA/NCR
and requires a new regulated-program assessment (EA-ADR-015 re-evaluation trigger).

---

## 7a. M2 Commerce Core — PII dependencies & gates

Two M2 items are routed to **bukani-compliance** and **gate GA**:

1. **Customer-directory consent model (GA-gate).** The `Customer` table holds PII (name / phone / email)
   for walk-in customer contacts. The **responsible-party question** — is the **merchant** the
   responsible party (Inyuku = operator) for these contacts, or does Inyuku take responsible-party
   duties? — is **a dependency routed to bukani-compliance** and **GA-gates the customer directory**.
   `Customer.consentId` is **nullable until ruled** (links to a `Consent` once the basis is set).
2. **PostHog as a new sub-processor (EA-ADR-015 extension).** PostHog receives event data → it is a
   **new sub-processor** requiring an **EU/self-host pin + signed operator DPA before production events
   leave Inyuku**. Analytics **ships dark** until cleared (added to §3/§4). PII is masked in event
   properties; `distinctId` is pseudonymous.

The `AnalyticsEvent` stream is **first-party and internal only — NO outward API/export** (the ADR-006
boundary holds; no credit-score / third-party surface emits from it).

## 7b. M3 WhatsApp Commerce — PII dependencies & gates

M3 introduces a new end-data-subject — the **WhatsApp customer** (the person messaging the merchant) —
whose **phone number and message content are personal information**. M3 is **sandbox-first**: M3-A is built
against the 360dialog sandbox with mocked webhooks and **no production PII**. The following are routed to
**bukani-compliance** and follow the M2 PostHog + Customer-directory precedents exactly.

### Build vs production posture

- **M3-A (BSP plumbing) build is NOT gated — and is now MERGED** (PR #11 / `e530574`). It runs against the
  **360dialog sandbox + mocked webhooks** with **zero production PII**, so no DPA, consent ruling, or Meta
  verification was required to *build* it. Live messaging ships **DARK** behind the per-business
  `WhatsAppChannel.enabled` flag (default `false`). Its bukani-security webhook STRIDE entry is
  **APPROVED-WITH-CONDITIONS** with the 5 conditions implemented in M3-A (see `docs/THREAT-MODEL.md` §7).
- **Live WhatsApp messaging (any production inbound/outbound message) is gated** — see items 1–3 below.
- **M3-B / M3-C** build on M3-A against the sandbox; their **production** behaviour is gated by the same DPA
  plus the consent/responsible-party ruling.

### Gates

1. **360dialog as a NEW sub-processor (EA-ADR-015 extension).** 360dialog receives WhatsApp message content
   + customer phone numbers → it is a **new (re-scoped) sub-processor** requiring an **EU-region pin (to
   confirm) + signed binding operator DPA + bukani-compliance risk assessment before ANY production WhatsApp
   message (inbound or outbound) flows.** This is the **direct analogue of the M2 PostHog handling**: the
   integration **ships against the sandbox; live messaging stays DARK until cleared** (added to §3/§4).

2. **WhatsApp opt-in / consent — responsible-party ruling (GA-gate).** The **responsible-party question** —
   is the **merchant** the responsible party (Inyuku = operator) for the WhatsApp customer's PII, or does
   Inyuku take responsible-party duties? — is a **dependency routed to bukani-compliance**, a direct
   analogue of the M2 Customer-directory consent question (§7a). This **GA-gates non-transactional /
   template (marketing) WhatsApp messaging.** **Transactional order/payment-status updates may rest on a
   different lawful basis** (e.g. contract/operator) than marketing templates — **this is flagged for the
   ruling and is NOT decided here.** Until the ruling lands, the consent enforcement point is a
   **default-deny stub** — **shipped in M3-A** (PR #11; `assertConsentGranted` in the send path: no
   non-transactional/template send without a recorded grant; transactional free-form inside an open window
   passes) — wired to the M1 `Consent` / `ConsentRevocation` ledger (§5); a denied send returns
   `403 whatsapp_consent_denied`. The §7 ruling can replace the stub without touching the send path.
   `Customer.consentId` remains **nullable until ruled** (§7a), and WhatsApp opt-in grants attach to the
   same ledger.

3. **Message-content PII retention (§6 TBD).** Inbound/outbound WhatsApp `Message` bodies and customer phone
   numbers are PII recorded in the §2 processing register; the **retention period is TBD** (POPIA §6,
   consistent with the existing TBDs) and must be set with bukani-compliance before production messaging.
   Retention must be a **config value**, not hard-coded. Message content and phone numbers are
   **PII-masked in all logs** (chassis `logger` + `pii-mask`); raw bodies are never written to application
   logs (they live only in the datastore and 360dialog).

4. **§72 cross-border.** WhatsApp / Meta + 360dialog data flows under the **binding-operator-DPA basis (NOT
   consent)**, consistent with EA-ADR-015 and the rest of §3. EU-region pin on the 360dialog footprint is
   **to confirm** as part of the risk assessment.

5. **Customer-facing data-subject notice / PAIA wording.** POPIA/PAIA notice wording for WhatsApp data
   subjects (customers messaging the business) is **dependent on the responsible-party ruling (item 2)** and
   is flagged, not drafted, here.

> M3 must **not** introduce AI / `lib/ai.js` into the WhatsApp surface (rule-based replies only) — this keeps
> the M3 conversational surface outside the EA-ADR-012 AI-autonomy/consent boundary until M5.

## 8. PCI scope

Card data **never touches Inyuku** — payments run through the **TradeSafe-hosted gateway**, putting Inyuku in
**SAQ-A** scope. Card-present / in-person POS is **deferred**; pulling it forward re-opens PCI scope.

---

## 9. Open items

- Information Officer / deputy appointment confirmation (founder TBD).
- Sub-processor DPAs + bukani-compliance risk assessment (pre-production-PII gate).
- Retention periods (§6 TBDs).
- Brand/data domain confirmation (affects cookie/host config, not the POPIA basis) — see ADR-004.
- **CPA review of the commerce surface — due M2/M4** (M2 lands the commerce surface).
- **(M2) Customer-directory consent model ruling** (merchant-as-responsible-party vs Inyuku-as-operator)
  — **GA-gates the customer directory**; `Customer.consentId` nullable until ruled (§7a).
- **(M2) PostHog sub-processor DPA + EU/self-host pin** (EA-ADR-015 extension) — analytics ships dark
  until cleared (§3/§4/§7a).
- **(M3) 360dialog sub-processor DPA + EU-pin confirmation + risk assessment** (EA-ADR-015 extension) —
  live WhatsApp messaging ships dark / sandbox-only until cleared (§3/§4/§7b). **M3-A build is NOT gated**
  (sandbox, no production PII).
- **(M3) WhatsApp opt-in / responsible-party ruling** (merchant-as-responsible-party vs Inyuku-as-operator)
  — **GA-gates non-transactional/template messaging**; transactional-vs-marketing basis flagged for ruling;
  M3-C consent enforcement default-deny stubbed against the M1 `Consent` ledger until ruled (§7b).
- **(M3) WhatsApp message-content retention period** (§6 TBD) — set with bukani-compliance before
  production messaging; must be a config value (§7b).
- **(M3) Customer-facing data-subject / PAIA notice wording for WhatsApp** — dependent on the M3
  responsible-party ruling (§7b).
