# Inyuku Digital — Personas

> **Owner:** bukani-product · **Created:** 2026-06-21 (M2 / Commerce Core).
> These personas are the canonical design targets. **Nomsa is the P0 target** — when a trade-off has
> to be made, optimise for Nomsa. See the M2 product brief
> (`docs/specs/2026-06-21-m2-commerce-core-product-brief.md`).

---

## Nomsa — spaza-shop owner (P0 design target)

The person every M2 decision is made for.

| Attribute | Detail |
|---|---|
| Role / RBAC | `MERCHANT_OWNER` |
| Device | Entry-level Android |
| Connectivity | Intermittent — frequent connectivity gaps and load-shedding |
| Digital literacy | Low |
| Languages | Prefers isiZulu / isiXhosa / Sesotho / Afrikaans |
| Mental model | Cash-first, thinks in ZAR |

**What this means for the product:**
- **Offline-first is P0** — the shop must keep working with no signal and converge cleanly later
  (drives stock-as-movements + idempotent sync, ADR-INY-013/016).
- Money is ZAR-as-integer-cents; the UI speaks cash.
- The dashboard answers "how is my shop doing today?" at a glance.
- Local-language UX and minimal text density.

---

## Sipho — shop assistant (cost-visibility boundary)

The reason the RBAC cost-split exists.

| Attribute | Detail |
|---|---|
| Role / RBAC | `MERCHANT_STAFF` |
| Job | Records sales, checks stock |
| **Must NOT see** | **Cost price, margin, or financial totals** |

**What this means for the product:**
- `MERCHANT_STAFF` gets every M2 permission **EXCEPT** `catalog:read_cost` and
  `dashboard:read_financial`.
- `Product.costPriceCents` is owner-only; the dashboard's financial fields are owner-only.
- This split is a **bukani-security pre-GA review item** (`docs/THREAT-MODEL.md` M2 entry).

---

## Thandi — artisan / caterer (validation persona — seams, not scope)

The reason M2 leaves *seams* rather than building fulfilment now.

| Attribute | Detail |
|---|---|
| Job | Made-to-order work (artisan / catering) |
| Status | **Validation persona — NOT an M2 scope target** |

**What this means for the product:**
- Thandi validates that the data model can grow into made-to-order/fulfilment **without rework**.
- M2 builds none of that lifecycle; it leaves **nullable seams** on `Order`
  (`fulfilmentStatus?`, `paymentRef?`, `escrowRef?`) so M3/M4 can grow in.
- She is the design check, not the design target — do not pull fulfilment into M2 scope for her.
