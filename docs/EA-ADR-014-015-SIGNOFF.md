# EA-ADR-014 / 015 — Founder Sign-Off Checklist

> **For:** Sibanye Bukani (founder) · **Prepared:** 2026-06-19
> **Purpose:** A quick yes/no review to formally sign off the two EA-ADRs that **gate the M1 build**.
> Full text: `/home/sibnaye/Development/bukani-decisions.md` (EA-ADR-014 line 323, EA-ADR-015 line 357).
> Signing this flips both ADRs from "Accepted (founder-ruled)" to **Signed**, clearing gate #4 for M1.

---

## EA-ADR-014 — Backend / datastore / auth topology

**In one line:** Inyuku runs on the **portfolio's standard chassis** — not the original Clerk + Supabase idea.

Confirm you approve each load-bearing decision:

- [ ] **Backend** = Express 4 + Prisma 6 on **Railway** (modelled on the DrAppv2 chassis). Prisma is the schema source of truth.
- [ ] **Frontend** = Next.js on **Vercel**, a *pure client* of the backend (owns no data/logic).
- [ ] **Database** = **Railway Postgres 16 (EU)**. **Supabase dropped.** Cache = Railway Redis 7.
- [ ] **Object storage** = **Cloudflare R2 (EU)**.
- [ ] **Auth** = **in-house JWT** + permission-RBAC (upholds EA-ADR-013). **Clerk OUT.** Standalone identity silo — **no Bukani SSO**.
- [ ] **Payments** = **TradeSafe escrow** only; Inyuku never holds funds. **Stripe dropped.** In-person POS deferred.
- [ ] **WhatsApp** = 360dialog · **Email** = Resend · **SMS/OTP** = BulkSMS.
- [ ] **AI** = Claude via the `lib/ai.js` gateway only (no direct SDK), under the R3,000/mo AI ceiling + governance.
- [ ] **Cross-cutting standards** vendored-in from the chassis (audit, logger, settings, envelope, OpenAPI, ZAR-integer-cents) are mandatory.
- [ ] **Multi-tenant from day one** (`Business` tenant root; `businessId` on every table).

**Known caveat you're accepting:** the cookie/brand domain is **provisional** (`.inyuku.co.za` assumed) until you pick the domain — that's gate #1, separate from this sign-off.

**Consequence to note:** Inyuku becomes the **2nd `lib/ai.js` consumer**, which triggers an EA review by M5 on whether to promote the AI gateway to a shared service. (No action now.)

**EA-ADR-014 decision:**  ☐ Approved  ☐ Approved with changes (note below)  ☐ Rejected

Notes: ______________________________________________

---

## EA-ADR-015 — POPIA sub-processors (Railway + R2, EU, §72)

**In one line:** SA personal data will sit in the **EU** on Railway + R2; the lawful basis is **binding operator contracts (DPAs)**, not user consent — mirroring the approved Jimi IoT pattern (EA-ADR-001).

Confirm you approve:

- [ ] **Railway + Cloudflare R2 approved as Inyuku POPIA sub-processors.**
- [ ] **§72 cross-border basis = signed operator DPAs** (not data-subject consent).
- [ ] **EU-region pin** mandatory on Postgres, Redis, and the R2 bucket.
- [ ] **Lending-data boundary:** verified-transaction data is internal analytics only — **never a shareable credit score** (keeps NCA/NCR out).
- [ ] **PCI:** TradeSafe-hosted → card data never touches Inyuku → **SAQ-A** scope.

**Hard condition (stays in force after sign-off):** **no production personal data** flows to Railway/R2 until `bukani-compliance` completes the sub-processor risk assessment **and** the operator DPAs are signed. Info-officer registration is an M0 deliverable. *Sign-off approves the posture; it does not waive this gate.*

**EA-ADR-015 decision:**  ☐ Approved  ☐ Approved with changes (note below)  ☐ Rejected

Notes: ______________________________________________

---

## Sign-off

| | Name | Decision | Date |
|---|---|---|---|
| Founder | Sibanye Bukani | ☐ Both approved | __________ |

**On approval:** tell me and I'll flip the Status lines on EA-ADR-014/015 to "Signed (founder, <date>)", which clears **M1 gate #4**. The remaining M1 gates are independent: #1 domain, #2 budget (`docs/BUDGET.md`), #3 owners (`docs/OWNERS.md`), #5 Meta/360dialog + TradeSafe kickoff.
