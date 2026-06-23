# M3-B Commerce-over-Chat — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M3-B backend surface that lets a merchant capture orders from a WhatsApp conversation, share a catalog into a chat, and run deterministic (non-AI) auto-replies — extending the existing M2 commerce + M3-A WhatsApp plumbing without new sync mechanics.

**Architecture:** Additive on the frozen contracts. Order capture extends the existing online `POST /orders` and the existing `POST /sync` order-create op with optional `channel` + `conversationId` (no new endpoint, no new sync op). Catalog-share and auto-reply-rule CRUD are new routes under `/whatsapp/...`. The auto-reply evaluator is a deterministic matcher invoked from the M3-A inbound drain path; it provably never touches `lib/ai.js`. All outbound WhatsApp still funnels through the single `sendWhatsAppMessage()` choke-point, which now carries customer-aware consent context.

**Tech Stack:** Fastify 5 (TypeScript), Prisma 6, Postgres 16, Zod, vitest. Tests run serially (`fileParallelism: false`) against a shared Postgres.

**Source of truth (read before starting):**
- `docs/specs/2026-06-23-m3b-commerce-over-chat-contracts.md` (FROZEN architect contract — §§2,4,5,6,7,11,13)
- `docs/specs/2026-06-23-m3b-commerce-over-chat-product-brief.md` (7 stories S1–S7)
- `docs/THREAT-MODEL.md` §8 (STRIDE Conditions 1–9, R1, E1–E4)

## Global Constraints

Every task implicitly includes all of these. Copy them verbatim into each task's reviewer brief.

- **Money is ZAR-as-integer-cents. No floats for money, ever.** Format for display as `R{rands}.{cc}` where `cc` is zero-padded to 2 digits.
- **Multi-tenancy from day one:** `businessId` FK on every domain table; all tenant routes live under `/v1/businesses/:businessId/*`; `businessId` is server-resolved from the path; any cross-tenant reference (`customerId`, `conversationId`, `productId`) MUST be tenant-validated before use — a mismatch returns 404 (NotFoundError), never silently linked.
- **RBAC cost-split by HIDING not zeroing:** `costPriceCents` and financial dashboard fields are owner-only (`catalog:read_cost`, `dashboard:read_financial`). `MERCHANT_STAFF` gets all commerce + WhatsApp ops EXCEPT `catalog:read_cost`, `dashboard:read_financial`, `whatsapp:manage_channel`, and the NEW `whatsapp:manage_autoreply`. `AI_AGENT` is read-only on the WhatsApp surface (`whatsapp:read` only).
- **Offline is P0.** Reuse the existing M2 `clientId` idempotency + `POST /sync` mechanism. Do NOT add a new sync op or a new idempotency scheme. `entity ∈ {product, stock_movement, order, customer}`, `op ∈ {create, update}`. Batch ≤ 100 ops, partial success, per-op status, LWW on `occurredAt`.
- **No direct `@anthropic-ai/sdk` calls; all AI via `lib/ai.js`.** Auto-replies must be **provably non-AI** — the auto-reply module must NEVER import or reference `lib/ai` (CI grep-enforced, Condition 6c).
- **Live WhatsApp stays DARK** behind `WhatsAppChannel.enabled` (sandbox-first) until the EA-ADR-015 DPA gate clears. Do not change this gate.
- **PII minimised in prompts; logs PII-masked (POPIA).** Never log raw message bodies or raw phone numbers / `waContactId`. Stored customer display names derived from a phone are masked (country code + last 4).
- **Prisma models use snake-case `@@map` + cuid PKs.**
- **Standard response envelope** (`okEnvelope(...)`) on every route; Zod-validated request bodies via `schema: { body: ... }`.
- **`Customer.consentId` stays nullable** (the merchant-as-responsible-party consent ruling GA-gates the directory; do not force a consent on customer create).
- **TDD, frequent commits.** Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Direct pushes to main are BLOCKED** — this work lands via branch + PR.

**Carried gates (tracked, NOT build blockers — do not attempt to build):** E1 (per-tenant WhatsApp cost ceiling + kill switch — founder/EA), R1/E2 (per-customer consent revocation store is designed-not-built; GA blocker pending the responsible-party ruling — the consent *seam* lands now, the per-customer store does not), E4 (Message→Order/Customer retention period — compliance).

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `server/prisma/schema.prisma` | `Order.conversationId` + inverse; `WhatsAppAutoReplyRule` model; `AutoReplyTrigger` + `AutoReplyAction` enums | Modify |
| `server/prisma/migrations/<ts>_m3b_commerce_over_chat/` | Generated migration | New |
| `server/src/auth/permissions.ts` | Add `whatsapp:manage_autoreply` to MERCHANT_OWNER role map | Modify |
| `server/src/schemas/order.schema.ts` | Shared order Zod schemas reused by the online route AND the sync order-create payload (Condition 8) | New |
| `server/src/utils/phone.ts` | `normalizeMsisdn` + `maskMsisdn` (E.164 normalise + PII mask) | New |
| `server/src/services/order.service.ts` | `createOrder` extended: `conversationId` input, tenant-validation (Condition 1, finding #3), customer link/create-from-conversation (§5.2) | Modify |
| `server/src/routes/v1/commerce.routes.ts` | Online `POST /orders` exposes `channel` + `conversationId` via shared schema | Modify |
| `server/src/services/sync.service.ts` | Order-create op validates `payload` with the shared schema (Condition 8), passes `channel` + `conversationId` through | Modify |
| `server/src/services/whatsapp-send.service.ts` | `assertConsentGranted(...,ctx)` customer-aware seam (Conditions 4,5); `sendWhatsAppMessage` threads ctx | Modify |
| `server/src/services/whatsapp-catalog-share.service.ts` | `composeCatalogText` — server-composed plain ZAR text, ACTIVE only, never reads cost (Conditions 2,4) | New |
| `server/src/services/whatsapp-autoreply.service.ts` | Deterministic evaluator + matcher (Conditions 4,6,7); zero `lib/ai` | New |
| `server/src/routes/v1/whatsapp.routes.ts` | New routes: `POST .../share-catalog`; auto-reply-rule CRUD (GET/POST/PATCH/DELETE) | Modify |
| `server/src/services/whatsapp-ingest.service.ts` | Hook the evaluator on genuinely-new INBOUND TEXT/INTERACTIVE messages (Conditions 7,9) | Modify |
| `server/src/services/__tests__/whatsapp-autoreply-no-ai.test.ts` | CI grep assertion (Condition 6c) | New |
| `server/src/__tests__/m3b-capture-replay.test.ts` | End-to-end inbound→capture replay/idempotency chain (Condition 9) | New |

---

## Task 1: Schema — `Order.conversationId`, `WhatsAppAutoReplyRule`, enums

**Files:**
- Modify: `server/prisma/schema.prisma`
- Migration: `server/prisma/migrations/<ts>_m3b_commerce_over_chat/` (generated)

**Interfaces:**
- Produces: Prisma model `WhatsAppAutoReplyRule`; enums `AutoReplyTrigger { GREETING KEYWORD OUT_OF_HOURS }`, `AutoReplyAction { SEND_TEXT SHARE_CATALOG }`; `Order.conversationId String?` + `Conversation.orders Order[]` inverse.

- [ ] **Step 1: Add `conversationId` to the `Order` model.** In `server/prisma/schema.prisma`, inside `model Order` (after `customerId`), add the field; and add the relation alongside the existing `customer` relation:

```prisma
  conversationId   String?           @map("conversation_id")
```
and in the relations block of `Order`:
```prisma
  conversation     Conversation?     @relation(fields: [conversationId], references: [id], onDelete: SetNull)
```
and add the index near the existing `@@unique`/`@@map` lines of `Order`:
```prisma
  @@index([conversationId])
```

- [ ] **Step 2: Add the inverse relation on `Conversation`.** In `model Conversation`, in its relations block (next to `messages Message[]`), add:

```prisma
  orders   Order[]
```

- [ ] **Step 3: Add the `WhatsAppAutoReplyRule` model.** Place it near the other WhatsApp models (after `Message`):

```prisma
model WhatsAppAutoReplyRule {
  id             String          @id @default(cuid()) @map("id")
  businessId     String          @map("business_id")
  channelId      String?         @map("channel_id")
  trigger        AutoReplyTrigger @map("trigger")
  enabled        Boolean         @default(false) @map("enabled")
  keyword        String?         @map("keyword")
  action         AutoReplyAction @map("action")
  replyText      String?         @map("reply_text")
  hoursStart     String?         @map("hours_start")
  hoursEnd       String?         @map("hours_end")
  daysActive     Int[]           @map("days_active")
  cooldownMinutes Int            @default(720) @map("cooldown_minutes")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  business Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId])
  @@index([businessId, trigger, enabled])
  @@map("whatsapp_auto_reply_rules")
}
```

- [ ] **Step 4: Add the inverse relation on `Business`.** In `model Business`, in its relations block, add:

```prisma
  autoReplyRules WhatsAppAutoReplyRule[]
```

- [ ] **Step 5: Add the two enums.** Place near the other enums:

```prisma
enum AutoReplyTrigger {
  GREETING
  KEYWORD
  OUT_OF_HOURS

  @@map("auto_reply_trigger")
}

enum AutoReplyAction {
  SEND_TEXT
  SHARE_CATALOG

  @@map("auto_reply_action")
}
```

- [ ] **Step 6: Generate the migration + client.**

Run: `cd server && npx prisma migrate dev --name m3b_commerce_over_chat`
Expected: a new migration directory under `server/prisma/migrations/`, client regenerated, exit 0.

- [ ] **Step 7: Typecheck.**

Run: `cd server && npm run typecheck`
Expected: PASS (no errors; the new model/enums are now in the generated client).

- [ ] **Step 8: Commit.**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(m3b): add Order.conversationId, WhatsAppAutoReplyRule, auto-reply enums

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Permission — `whatsapp:manage_autoreply` (owner-only)

**Files:**
- Modify: `server/src/auth/permissions.ts`
- Test: `server/src/auth/__tests__/permissions.test.ts`

**Interfaces:**
- Consumes: `ROLE_PERMISSIONS`, `hasPermission(role, explicit, required)` (existing).
- Produces: `whatsapp:manage_autoreply` present for `MERCHANT_OWNER`, absent for `MERCHANT_STAFF` and `AI_AGENT`.

- [ ] **Step 1: Write the failing test.** Add to `server/src/auth/__tests__/permissions.test.ts` (create the file if absent, following the existing test patterns in that directory):

```ts
import { describe, it, expect } from 'vitest';
import { hasPermission } from '../permissions';

describe('whatsapp:manage_autoreply', () => {
  it('is granted to MERCHANT_OWNER', () => {
    expect(hasPermission('MERCHANT_OWNER', [], 'whatsapp:manage_autoreply')).toBe(true);
  });
  it('is denied to MERCHANT_STAFF', () => {
    expect(hasPermission('MERCHANT_STAFF', [], 'whatsapp:manage_autoreply')).toBe(false);
  });
  it('is denied to AI_AGENT', () => {
    expect(hasPermission('AI_AGENT', [], 'whatsapp:manage_autoreply')).toBe(false);
  });
  it('keeps MERCHANT_STAFF on whatsapp:read and whatsapp:send', () => {
    expect(hasPermission('MERCHANT_STAFF', [], 'whatsapp:read')).toBe(true);
    expect(hasPermission('MERCHANT_STAFF', [], 'whatsapp:send')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd server && npx vitest run src/auth/__tests__/permissions.test.ts`
Expected: FAIL — `MERCHANT_OWNER` does not yet have `whatsapp:manage_autoreply`.

- [ ] **Step 3: Add the permission.** In `server/src/auth/permissions.ts`, in the `MERCHANT_OWNER` array, after `'whatsapp:manage_channel'`, add:

```ts
    'whatsapp:manage_autoreply',
```
Do NOT add it to `MERCHANT_STAFF` or `AI_AGENT`.

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `cd server && npx vitest run src/auth/__tests__/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/auth/permissions.ts server/src/auth/__tests__/permissions.test.ts
git commit -m "feat(m3b): add owner-only whatsapp:manage_autoreply permission

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Shared order Zod schema (capture-over-sync foundation, Condition 8)

**Files:**
- Create: `server/src/schemas/order.schema.ts`
- Test: `server/src/schemas/__tests__/order.schema.test.ts`

**Interfaces:**
- Produces:
  - `orderLineSchema` — `{ productId: string; qty: int>=1 }`
  - `orderFieldsSchema` — the shared order fields: `{ channel?: 'IN_PERSON'|'WHATSAPP'|'ONLINE'; conversationId?: string; customerId?: string; status?: 'DRAFT'|'COMPLETED'; paymentState?: 'PAID'|'UNPAID'; lines: orderLineSchema[] (>=1) }`
  - `createOrderBodySchema` = `orderFieldsSchema.extend({ clientId: string; occurredAt?: ISO-datetime string })`
  - type exports `OrderFields`, `CreateOrderBody`.

This single module is the one place the online HTTP body and the offline sync payload share their typed order shape (Condition 8). The online body adds `clientId` + `occurredAt`; the sync op carries those at the op level, so the sync payload validates against `orderFieldsSchema`.

- [ ] **Step 1: Write the failing test.** `server/src/schemas/__tests__/order.schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { orderFieldsSchema, createOrderBodySchema } from '../order.schema';

describe('orderFieldsSchema', () => {
  it('accepts a minimal valid order', () => {
    const r = orderFieldsSchema.safeParse({ lines: [{ productId: 'p1', qty: 2 }] });
    expect(r.success).toBe(true);
  });
  it('accepts channel + conversationId', () => {
    const r = orderFieldsSchema.safeParse({
      channel: 'WHATSAPP',
      conversationId: 'conv1',
      lines: [{ productId: 'p1', qty: 1 }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown channel', () => {
    const r = orderFieldsSchema.safeParse({ channel: 'CARRIER_PIGEON', lines: [{ productId: 'p1', qty: 1 }] });
    expect(r.success).toBe(false);
  });
  it('rejects empty lines', () => {
    expect(orderFieldsSchema.safeParse({ lines: [] }).success).toBe(false);
  });
  it('rejects qty < 1', () => {
    expect(orderFieldsSchema.safeParse({ lines: [{ productId: 'p1', qty: 0 }] }).success).toBe(false);
  });
});

describe('createOrderBodySchema', () => {
  it('requires clientId', () => {
    expect(createOrderBodySchema.safeParse({ lines: [{ productId: 'p1', qty: 1 }] }).success).toBe(false);
  });
  it('accepts clientId + optional occurredAt + channel', () => {
    const r = createOrderBodySchema.safeParse({
      clientId: 'c1',
      channel: 'WHATSAPP',
      conversationId: 'conv1',
      occurredAt: '2026-06-23T10:00:00.000Z',
      lines: [{ productId: 'p1', qty: 1 }],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd server && npx vitest run src/schemas/__tests__/order.schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema.** `server/src/schemas/order.schema.ts`:

```ts
import { z } from 'zod';

export const orderLineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1),
});

/** Shared order fields used by BOTH the online POST /orders body and the offline sync order-create payload (Condition 8). */
export const orderFieldsSchema = z.object({
  channel: z.enum(['IN_PERSON', 'WHATSAPP', 'ONLINE']).optional(),
  conversationId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'COMPLETED']).optional(),
  paymentState: z.enum(['PAID', 'UNPAID']).optional(),
  lines: z.array(orderLineSchema).min(1),
});

export const createOrderBodySchema = orderFieldsSchema.extend({
  clientId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
});

export type OrderFields = z.infer<typeof orderFieldsSchema>;
export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `cd server && npx vitest run src/schemas/__tests__/order.schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/schemas/order.schema.ts server/src/schemas/__tests__/order.schema.test.ts
git commit -m "feat(m3b): shared order Zod schema for capture-over-sync (Condition 8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Phone utils — `normalizeMsisdn` + `maskMsisdn`

**Files:**
- Create: `server/src/utils/phone.ts`
- Test: `server/src/utils/__tests__/phone.test.ts`

**Interfaces:**
- Produces:
  - `normalizeMsisdn(raw: string): string` — strips non-digits, returns E.164 `+<digits>`; treats a leading `0` followed by 9 digits as a ZA local number → `+27<9 digits>`.
  - `maskMsisdn(raw: string): string` — returns a PII-masked form keeping the leading country digits and the last 4, e.g. `+27•••••1234`.

- [ ] **Step 1: Write the failing test.** `server/src/utils/__tests__/phone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeMsisdn, maskMsisdn } from '../phone';

describe('normalizeMsisdn', () => {
  it('keeps an already-E.164 number', () => {
    expect(normalizeMsisdn('+27821234567')).toBe('+27821234567');
  });
  it('strips spaces and punctuation', () => {
    expect(normalizeMsisdn('+27 (82) 123-4567')).toBe('+27821234567');
  });
  it('adds a + to a bare international number (360dialog waContactId form)', () => {
    expect(normalizeMsisdn('27821234567')).toBe('+27821234567');
  });
  it('expands a ZA local 0-prefixed number to +27', () => {
    expect(normalizeMsisdn('0821234567')).toBe('+27821234567');
  });
});

describe('maskMsisdn', () => {
  it('keeps country code + last 4, masks the middle', () => {
    expect(maskMsisdn('+27821234567')).toBe('+27•••••4567');
  });
  it('masks a short number safely', () => {
    expect(maskMsisdn('1234')).toBe('••••');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd server && npx vitest run src/utils/__tests__/phone.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** `server/src/utils/phone.ts`:

```ts
/** Normalise a raw phone / WhatsApp contact id to E.164 (+<digits>). */
export function normalizeMsisdn(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  // ZA local form: 0XXXXXXXXX (10 digits, leading 0) -> +27XXXXXXXXX
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+27${digits.slice(1)}`;
  }
  return `+${digits}`;
}

/** PII-masked display form: country digits kept, middle masked, last 4 kept. */
export function maskMsisdn(raw: string): string {
  const e164 = normalizeMsisdn(raw);
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 4) return '•'.repeat(digits.length);
  // keep leading country code (assume 2) + last 4; mask the rest
  const cc = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  const maskedLen = digits.length - cc.length - last4.length;
  return `+${cc}${'•'.repeat(maskedLen)}${last4}`;
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `cd server && npx vitest run src/utils/__tests__/phone.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/utils/phone.ts server/src/utils/__tests__/phone.test.ts
git commit -m "feat(m3b): msisdn normalise + PII mask utils

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `createOrder` — tenant-validate `conversationId` + `customerId` (Condition 1; closes finding #3)

**Files:**
- Modify: `server/src/services/order.service.ts`
- Test: `server/src/services/__tests__/order.service.test.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: existing `createOrder(input: CreateOrderInput)`; `CreateOrderInput` already has `channel?`.
- Produces: `CreateOrderInput` extended with `conversationId?: string`. `createOrder` now: (a) if `conversationId` given, loads the Conversation and throws `NotFoundError` unless `conversation.businessId === input.businessId`; (b) if `customerId` given, loads the Customer and throws `NotFoundError` unless `customer.businessId === input.businessId`; (c) persists `conversationId` on the Order.

This closes security finding #3 (createOrder previously wrote `customerId` with no tenant check) and is the write side of Condition 1.

- [ ] **Step 1: Write the failing tests.** Add to `server/src/services/__tests__/order.service.test.ts` (use the existing `createTestBusiness` / product-create helpers; follow the patterns in `commerce.routes.test.ts` for fixtures):

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { prisma } from '../../db'; // adjust to the project's prisma import
import { createOrder } from '../order.service';
import { createTestBusiness } from '../../test-helpers';

describe('createOrder tenant validation', () => {
  let bizA: { id: string };
  let bizB: { id: string };
  let productA: { id: string };

  beforeAll(async () => {
    bizA = await createTestBusiness({ name: 'Order Svc Biz A' });
    bizB = await createTestBusiness({ name: 'Order Svc Biz B' });
    productA = await prisma.product.create({
      data: { businessId: bizA.id, clientId: `p-${Date.now()}`, name: 'Widget', sellPriceCents: 5000, status: 'ACTIVE' },
    });
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId: bizA.id } });
    await prisma.orderLine.deleteMany({ where: { businessId: bizA.id } });
    await prisma.order.deleteMany({ where: { businessId: bizA.id } });
  });

  it('rejects a customerId from another tenant (finding #3)', async () => {
    const foreignCustomer = await prisma.customer.create({
      data: { businessId: bizB.id, clientId: `c-${Date.now()}`, name: 'Foreign' },
    });
    await expect(
      createOrder({
        businessId: bizA.id,
        clientId: `o-${Date.now()}`,
        customerId: foreignCustomer.id,
        lines: [{ productId: productA.id, qty: 1 }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects a conversationId from another tenant (Condition 1)', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizB.id, /* fill required fields per schema */ } as any,
    });
    const foreignConv = await prisma.conversation.create({
      data: { businessId: bizB.id, channelId: channel.id, waContactId: '27820000000' },
    });
    await expect(
      createOrder({
        businessId: bizA.id,
        clientId: `o2-${Date.now()}`,
        conversationId: foreignConv.id,
        lines: [{ productId: productA.id, qty: 1 }],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('persists conversationId on a same-tenant capture', async () => {
    const channel = await prisma.whatsAppChannel.create({
      data: { businessId: bizA.id, /* fill required fields per schema */ } as any,
    });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '27820001111' },
    });
    const { order } = await createOrder({
      businessId: bizA.id,
      clientId: `o3-${Date.now()}`,
      channel: 'WHATSAPP',
      conversationId: conv.id,
      lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.conversationId).toBe(conv.id);
    expect(order.channel).toBe('WHATSAPP');
  });
});
```

> Implementer note: fill the `whatsAppChannel.create` required fields from `schema.prisma` (the M3-A channel model). Keep `as any` only if the channel requires fields irrelevant to this test.

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/order.service.test.ts`
Expected: FAIL — `conversationId` not on the input/order; no tenant guard.

- [ ] **Step 3: Extend the input type.** In `server/src/services/order.service.ts`, add to `CreateOrderInput`:

```ts
  conversationId?: string;
```

- [ ] **Step 4: Add `NotFoundError` to the error import.** Extend the existing error import line (the module already imports `ValidationError`) to also import `NotFoundError` from the same errors module.

- [ ] **Step 5: Add tenant guards at the top of `createOrder`** (after the idempotency `findUnique`, before the `$transaction`):

```ts
  if (input.conversationId) {
    const conv = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv || conv.businessId !== input.businessId) {
      throw new NotFoundError('Conversation not found');
    }
  }
  if (input.customerId) {
    const cust = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!cust || cust.businessId !== input.businessId) {
      throw new NotFoundError('Customer not found');
    }
  }
```

- [ ] **Step 6: Persist `conversationId` on the order.** In the `tx.order.create({ data: { ... } })` block, add:

```ts
        conversationId: input.conversationId ?? null,
```

- [ ] **Step 7: Run the tests to confirm they pass.**

Run: `cd server && npx vitest run src/services/__tests__/order.service.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add server/src/services/order.service.ts server/src/services/__tests__/order.service.test.ts
git commit -m "fix(m3b): tenant-validate customerId + conversationId in createOrder (Condition 1, finding #3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `createOrder` — link/create customer from conversation (§5.2)

**Files:**
- Modify: `server/src/services/order.service.ts`
- Test: `server/src/services/__tests__/order.service.test.ts` (add cases)

**Interfaces:**
- Consumes: `createOrder` (Task 5); `normalizeMsisdn`, `maskMsisdn` (Task 4).
- Produces: when `customerId` is omitted AND `conversationId` is given, `createOrder` resolves a customer in this order: (1) `conversation.customerId` if set; else (2) an existing tenant Customer whose normalised `phone` equals the normalised `conversation.waContactId`; else (3) a newly created tenant Customer (`name = "WhatsApp " + maskMsisdn(waContactId)`, `phone = conversation.waContactId`, `consentId = null`, deterministic `clientId = "wa:" + conversationId`). The resolved customer is linked on the Order, and `Conversation.customerId` is back-linked when it was null.

- [ ] **Step 1: Write the failing tests.** Add to `order.service.test.ts`:

```ts
describe('createOrder customer link/create from conversation (§5.2)', () => {
  // bizA, productA from the suite above

  it('reuses an already-linked conversation customer', async () => {
    const channel = await prisma.whatsAppChannel.create({ data: { businessId: bizA.id } as any });
    const existing = await prisma.customer.create({
      data: { businessId: bizA.id, clientId: `cl-${Date.now()}`, name: 'Linked', phone: '+27820002222' },
    });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '27820002222', customerId: existing.id },
    });
    const { order } = await createOrder({
      businessId: bizA.id, clientId: `o-${Date.now()}`, channel: 'WHATSAPP', conversationId: conv.id,
      lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.customerId).toBe(existing.id);
  });

  it('creates a masked-name customer and back-links the conversation', async () => {
    const channel = await prisma.whatsAppChannel.create({ data: { businessId: bizA.id } as any });
    const conv = await prisma.conversation.create({
      data: { businessId: bizA.id, channelId: channel.id, waContactId: '27821239999' },
    });
    const { order } = await createOrder({
      businessId: bizA.id, clientId: `o-${Date.now()}`, channel: 'WHATSAPP', conversationId: conv.id,
      lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.customerId).toBeTruthy();
    const cust = await prisma.customer.findUnique({ where: { id: order.customerId! } });
    expect(cust!.name).toBe('WhatsApp +27•••••9999');
    expect(cust!.consentId).toBeNull();
    expect(cust!.clientId).toBe(`wa:${conv.id}`);
    const reloaded = await prisma.conversation.findUnique({ where: { id: conv.id } });
    expect(reloaded!.customerId).toBe(order.customerId);
  });

  it('does not link a customer when no conversationId is supplied', async () => {
    const { order } = await createOrder({
      businessId: bizA.id, clientId: `o-${Date.now()}`, lines: [{ productId: productA.id, qty: 1 }],
    });
    expect(order.customerId).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/order.service.test.ts`
Expected: FAIL — no customer auto-resolution.

- [ ] **Step 3: Import the phone utils** at the top of `order.service.ts`:

```ts
import { normalizeMsisdn, maskMsisdn } from '../utils/phone';
```

- [ ] **Step 4: Add a resolver helper** in `order.service.ts` (above `createOrder`):

```ts
async function resolveCustomerFromConversation(
  tx: Prisma.TransactionClient,
  businessId: string,
  conversationId: string,
): Promise<string | null> {
  const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.businessId !== businessId) return null; // already tenant-checked upstream; defensive
  if (conv.customerId) return conv.customerId;

  const normalized = normalizeMsisdn(conv.waContactId);
  // try match by normalised phone within the tenant
  const candidates = await tx.customer.findMany({ where: { businessId, phone: { not: null } } });
  const match = candidates.find((c) => c.phone && normalizeMsisdn(c.phone) === normalized);
  let customerId: string;
  if (match) {
    customerId = match.id;
  } else {
    const created = await tx.customer.create({
      data: {
        businessId,
        clientId: `wa:${conversationId}`,
        name: `WhatsApp ${maskMsisdn(conv.waContactId)}`,
        phone: conv.waContactId,
        consentId: null,
      },
    });
    customerId = created.id;
  }
  if (!conv.customerId) {
    await tx.conversation.update({ where: { id: conversationId }, data: { customerId } });
  }
  return customerId;
}
```

> Implementer note: import `Prisma` from `@prisma/client` if not already imported. The `clientId = "wa:" + conversationId` deterministic key plus `@@unique([businessId, clientId])` makes the create idempotent across retries (a replayed capture finds the same customer).

- [ ] **Step 5: Wire the resolver into `createOrder`.** Inside the `$transaction`, before `tx.order.create`, compute the effective customer id:

```ts
    let resolvedCustomerId = input.customerId ?? null;
    if (!resolvedCustomerId && input.conversationId) {
      resolvedCustomerId = await resolveCustomerFromConversation(tx, input.businessId, input.conversationId);
    }
```
and in `tx.order.create({ data: { ... } })` replace `customerId: input.customerId ?? null` with:

```ts
        customerId: resolvedCustomerId,
```

- [ ] **Step 6: Run the tests to confirm they pass.**

Run: `cd server && npx vitest run src/services/__tests__/order.service.test.ts`
Expected: PASS (all Task 5 + Task 6 cases).

- [ ] **Step 7: Commit.**

```bash
git add server/src/services/order.service.ts server/src/services/__tests__/order.service.test.ts
git commit -m "feat(m3b): link/create customer from WhatsApp conversation on capture (§5.2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Online `POST /orders` — expose `channel` + `conversationId`

**Files:**
- Modify: `server/src/routes/v1/commerce.routes.ts`
- Test: `server/src/routes/v1/__tests__/commerce.routes.test.ts` (add cases)

**Interfaces:**
- Consumes: `createOrderBodySchema` (Task 3); `createOrder` (Tasks 5–6).
- Produces: `POST /v1/businesses/:businessId/orders` accepts `channel` + `conversationId`; passes both to `createOrder`. Still `order:write`; envelope + audit unchanged.

- [ ] **Step 1: Write the failing test.** In `commerce.routes.test.ts` add (reuse the suite's `app`, `ownerToken`, `authHeader`, `createProduct` helpers):

```ts
it('captures a WHATSAPP order linked to a conversation', async () => {
  const prod = await createProduct(bizA.id, ownerToken);
  const productId = prod.json().data.product.id;
  const channel = await prisma.whatsAppChannel.create({ data: { businessId: bizA.id } as any });
  const conv = await prisma.conversation.create({
    data: { businessId: bizA.id, channelId: channel.id, waContactId: '27825550000' },
  });
  const r = await app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/orders`,
    headers: { ...authHeader(ownerToken), 'content-type': 'application/json' },
    payload: {
      clientId: `wa-order-${Date.now()}`,
      channel: 'WHATSAPP',
      conversationId: conv.id,
      status: 'COMPLETED',
      lines: [{ productId, qty: 1 }],
    },
  });
  expect(r.statusCode).toBe(201);
  const order = r.json().data.order;
  expect(order.channel).toBe('WHATSAPP');
  expect(order.conversationId).toBe(conv.id);
  expect(order.customerId).toBeTruthy(); // auto-linked
});

it('404s a conversationId from another tenant', async () => {
  const prod = await createProduct(bizA.id, ownerToken);
  const productId = prod.json().data.product.id;
  const otherChannel = await prisma.whatsAppChannel.create({ data: { businessId: bizB.id } as any });
  const otherConv = await prisma.conversation.create({
    data: { businessId: bizB.id, channelId: otherChannel.id, waContactId: '27825551111' },
  });
  const r = await app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/orders`,
    headers: { ...authHeader(ownerToken), 'content-type': 'application/json' },
    payload: { clientId: `x-${Date.now()}`, channel: 'WHATSAPP', conversationId: otherConv.id, lines: [{ productId, qty: 1 }] },
  });
  expect(r.statusCode).toBe(404);
});
```

> Implementer note: if `bizB` is not already in this suite, create it in `beforeAll` alongside `bizA`.

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/routes/v1/__tests__/commerce.routes.test.ts`
Expected: FAIL — body schema strips `channel`/`conversationId`; not passed to `createOrder`.

- [ ] **Step 3: Swap the body schema.** In `commerce.routes.ts`, replace the local `CreateOrderBody` definition with an import:

```ts
import { createOrderBodySchema } from '../../schemas/order.schema';
```
and use `createOrderBodySchema` in the route's `schema: { body: createOrderBodySchema }`, and `z.infer<typeof createOrderBodySchema>` for the body type. Remove the now-unused local `CreateOrderBody`.

- [ ] **Step 4: Pass the new fields to `createOrder`.** In the handler's `createOrder({ ... })` call, add:

```ts
      channel: body.channel,
      conversationId: body.conversationId,
```

- [ ] **Step 5: Run the test to confirm it passes.**

Run: `cd server && npx vitest run src/routes/v1/__tests__/commerce.routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the OpenAPI drift check.**

Run: `cd server && npm run openapi:check`
Expected: PASS (the additive optional fields are reflected; if the check writes a spec snapshot, commit it).

- [ ] **Step 7: Commit.**

```bash
git add server/src/routes/v1/commerce.routes.ts server/src/routes/v1/__tests__/commerce.routes.test.ts server/openapi* 2>/dev/null
git commit -m "feat(m3b): online POST /orders accepts channel + conversationId

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Sync order-create — validate payload with the shared schema (Condition 8; closes finding #4)

**Files:**
- Modify: `server/src/services/sync.service.ts`
- Test: `server/src/services/__tests__/sync.service.test.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: `orderFieldsSchema` (Task 3); `createOrder` (Tasks 5–6).
- Produces: the order-create branch of `applySyncOp` validates `op.payload` with `orderFieldsSchema`; on validation failure it returns `{ clientId, status: 'REJECTED', error: 'VALIDATION' }` (the batch continues — partial success); on success it passes `channel` + `conversationId` to `createOrder`. This closes finding #4 (the `z.record(z.unknown())` payload was previously dispatched unvalidated).

- [ ] **Step 1: Write the failing tests.** In `sync.service.test.ts` (build a `MERCHANT_OWNER` membership object as the existing sync tests do):

```ts
import { applySyncOp } from '../sync.service';
// ... fixtures: bizA, an owner membership object, a product in bizA

it('rejects a malformed order payload without failing the batch (Condition 8 / finding #4)', async () => {
  const res = await applySyncOp(
    { clientId: `bad-${Date.now()}`, entity: 'order', op: 'create', occurredAt: new Date().toISOString(), payload: { lines: 'not-an-array' } as any },
    bizA.id,
    ownerMembership,
  );
  expect(res.status).toBe('REJECTED');
  expect(res.error).toBe('VALIDATION');
});

it('applies a valid WHATSAPP order via sync with conversationId', async () => {
  const channel = await prisma.whatsAppChannel.create({ data: { businessId: bizA.id } as any });
  const conv = await prisma.conversation.create({ data: { businessId: bizA.id, channelId: channel.id, waContactId: '27826660000' } });
  const res = await applySyncOp(
    { clientId: `ok-${Date.now()}`, entity: 'order', op: 'create', occurredAt: new Date().toISOString(),
      payload: { channel: 'WHATSAPP', conversationId: conv.id, status: 'COMPLETED', lines: [{ productId: productA.id, qty: 1 }] } },
    bizA.id,
    ownerMembership,
  );
  expect(res.status).toBe('APPLIED');
  const order = await prisma.order.findUnique({ where: { businessId_clientId: { businessId: bizA.id, clientId: res.clientId } } });
  expect(order!.conversationId).toBe(conv.id);
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/sync.service.test.ts`
Expected: FAIL — malformed payload currently throws or mis-dispatches; `conversationId` not passed.

- [ ] **Step 3: Import the shared schema** in `sync.service.ts`:

```ts
import { orderFieldsSchema } from '../schemas/order.schema';
```

- [ ] **Step 4: Validate + pass through in the order-create branch.** Replace the order-create block's untyped cast with a parse:

```ts
if (op.entity === 'order' && op.op === 'create') {
  if (!hasPermission(role, perms, 'order:write')) {
    return { clientId: op.clientId, status: 'REJECTED', error: 'FORBIDDEN' };
  }
  const parsed = orderFieldsSchema.safeParse(op.payload);
  if (!parsed.success) {
    return { clientId: op.clientId, status: 'REJECTED', error: 'VALIDATION' };
  }
  const payload = parsed.data;
  const { order, duplicate } = await createOrder({
    businessId,
    clientId: op.clientId,
    channel: payload.channel,
    conversationId: payload.conversationId,
    customerId: payload.customerId,
    status: payload.status,
    paymentState: payload.paymentState,
    lines: payload.lines,
    occurredAt,
  });
  return {
    clientId: op.clientId,
    status: duplicate ? 'DUPLICATE' : 'APPLIED',
    serverId: order.id,
    resource: 'order',
  };
}
```

> Implementer note: a `createOrder` tenant-validation failure (foreign `conversationId`/`customerId`) throws `NotFoundError`. The sync loop must convert a thrown op into a per-op `REJECTED` result, not abort the batch. If the existing loop does not already wrap `applySyncOp` in a try/catch that yields a `REJECTED` result, add that wrapping in the loop in `commerce.routes.ts` (the `/sync` handler) — catch the error per op and push `{ clientId: op.clientId, status: 'REJECTED', error: 'VALIDATION' }`. Add a test asserting a foreign-tenant `conversationId` in a sync op yields `REJECTED` without aborting sibling ops.

- [ ] **Step 5: Run the tests to confirm they pass.**

Run: `cd server && npx vitest run src/services/__tests__/sync.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/src/services/sync.service.ts server/src/routes/v1/commerce.routes.ts server/src/services/__tests__/sync.service.test.ts
git commit -m "fix(m3b): validate sync order payload + pass channel/conversationId (Condition 8, finding #4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Consent — customer-aware `assertConsentGranted` seam (Conditions 4, 5; R1 seam-only)

**Files:**
- Modify: `server/src/services/whatsapp-send.service.ts`
- Test: `server/src/services/__tests__/whatsapp-send.service.test.ts` (add cases)

**Interfaces:**
- Consumes: existing `assertConsentGranted(businessId, sendClass, isTemplate)`; existing `sendWhatsAppMessage(businessId, conversationId, input, opts)`.
- Produces: `assertConsentGranted(businessId, sendClass, isTemplate, ctx?: ConsentContext)` where `ConsentContext = { conversationId?: string; customerId?: string | null; waContactId?: string }`. Behaviour preserved: transactional-free-form-in-window always allowed; marketing/template default-deny unless a GRANTED, un-revoked consent exists. NEW: when `ctx.customerId` resolves to a Customer with a non-null `consent`, that per-customer consent governs (the R1 seam). In M3-B `Customer.consentId` stays nullable, so the per-customer branch is inert by default — but the code path exists and all four send paths now pass `ctx`. `sendWhatsAppMessage` passes `ctx` built from the resolved conversation.

- [ ] **Step 1: Write the failing tests.** In `whatsapp-send.service.test.ts`:

```ts
import { assertConsentGranted } from '../whatsapp-send.service';

describe('assertConsentGranted with customer context (Conditions 4/5, R1 seam)', () => {
  it('still allows transactional free-form regardless of ctx', async () => {
    await expect(assertConsentGranted(bizA.id, 'TRANSACTIONAL', false, { customerId: null })).resolves.toBeUndefined();
  });
  it('default-denies marketing with no grant', async () => {
    await expect(assertConsentGranted(bizA.id, 'MARKETING', false, {})).rejects.toMatchObject({ statusCode: 403 });
  });
  it('honours a per-customer GRANTED consent for marketing', async () => {
    const consent = await prisma.consent.create({ data: { businessId: bizA.id, purpose: 'whatsapp:marketing', status: 'GRANTED' } });
    const cust = await prisma.customer.create({ data: { businessId: bizA.id, clientId: `cc-${Date.now()}`, name: 'C', consentId: consent.id } });
    await expect(assertConsentGranted(bizA.id, 'MARKETING', false, { customerId: cust.id })).resolves.toBeUndefined();
  });
  it('denies when the per-customer consent is revoked', async () => {
    const consent = await prisma.consent.create({ data: { businessId: bizA.id, purpose: 'whatsapp:marketing', status: 'GRANTED' } });
    await prisma.consentRevocation.create({ data: { consentId: consent.id, reason: 'opt-out' } });
    const cust = await prisma.customer.create({ data: { businessId: bizA.id, clientId: `cc2-${Date.now()}`, name: 'C', consentId: consent.id } });
    await expect(assertConsentGranted(bizA.id, 'MARKETING', false, { customerId: cust.id })).rejects.toMatchObject({ statusCode: 403 });
  });
});
```

> Implementer note: confirm the `AppError` shape exposes `statusCode` (M3-A pattern). If it uses a different property, assert on that instead.

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-send.service.test.ts`
Expected: FAIL — `assertConsentGranted` does not accept ctx / no per-customer branch.

- [ ] **Step 3: Extend `assertConsentGranted`.** Replace the function body:

```ts
export interface ConsentContext {
  conversationId?: string;
  customerId?: string | null;
  waContactId?: string;
}

export async function assertConsentGranted(
  businessId: string,
  sendClass: SendClass,
  isTemplate: boolean,
  ctx?: ConsentContext,
): Promise<void> {
  // Transactional free-form inside an open window is always allowed (M3-A behaviour preserved).
  if (sendClass === 'TRANSACTIONAL' && !isTemplate) return;

  // R1 seam: a per-customer consent, when present, governs. In M3-B Customer.consentId
  // stays nullable so this branch is inert by default (per-customer store deferred).
  if (ctx?.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: ctx.customerId },
      include: { consent: { include: { revocations: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    if (customer?.consent) {
      const ok = customer.consent.status === 'GRANTED' && customer.consent.revocations.length === 0;
      if (!ok) throw new AppError('whatsapp_consent_denied', 'WhatsApp consent not granted', 403);
      return;
    }
    // no per-customer grant -> fall through to business-scoped default-deny
  }

  const purpose = isTemplate ? 'whatsapp:template' : 'whatsapp:marketing';
  const grant = await prisma.consent.findFirst({
    where: { businessId, purpose, status: 'GRANTED' },
    include: { revocations: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!grant || grant.revocations.length > 0) {
    throw new AppError('whatsapp_consent_denied', 'WhatsApp consent not granted', 403);
  }
}
```

- [ ] **Step 4: Thread `ctx` from `sendWhatsAppMessage`.** At the `assertConsentGranted` call site inside `sendWhatsAppMessage` (after the conversation is resolved), change it to:

```ts
  await assertConsentGranted(businessId, input.sendClass, input.type === 'TEMPLATE', {
    conversationId: conversation.id,
    customerId: conversation.customerId,
    waContactId: conversation.waContactId,
  });
```

- [ ] **Step 5: Run the tests to confirm they pass.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-send.service.test.ts`
Expected: PASS. (Re-run any existing send tests to confirm no regression: same command runs the whole file.)

- [ ] **Step 6: Commit.**

```bash
git add server/src/services/whatsapp-send.service.ts server/src/services/__tests__/whatsapp-send.service.test.ts
git commit -m "feat(m3b): customer-aware consent seam through the send choke-point (Conditions 4/5, R1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Catalog-share composer + route (ADR-INY-023; Conditions 2, 4)

**Files:**
- Create: `server/src/services/whatsapp-catalog-share.service.ts`
- Modify: `server/src/routes/v1/whatsapp.routes.ts`
- Test: `server/src/services/__tests__/whatsapp-catalog-share.service.test.ts`, plus a route case in `whatsapp.routes.test.ts`

**Interfaces:**
- Consumes: `listProducts`-style access (but cost-free); `sendWhatsAppMessage` (Task 9).
- Produces:
  - `composeCatalogText(businessId: string, productIds?: string[]): Promise<string>` — builds plain ZAR text from ACTIVE products only (ARCHIVED excluded). Out-of-stock products are INCLUDED and flagged `" (out of stock)"`. NEVER selects/reads `costPriceCents`. Each line: `• {name} — R{rands}.{cc}` (+ flag). Stock per product = `SUM(qtyDelta)` over `StockMovement`; `<= 0` is out-of-stock.
  - Route `POST /v1/businesses/:businessId/whatsapp/conversations/:id/share-catalog` (`whatsapp:send`), body `{ productIds?: string[], sendClass: 'TRANSACTIONAL' | 'MARKETING' }`; composes the text and dispatches it via `sendWhatsAppMessage` (type `TEXT`).

- [ ] **Step 1: Write the failing service test.** `server/src/services/__tests__/whatsapp-catalog-share.service.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../db';
import { composeCatalogText } from '../whatsapp-catalog-share.service';
import { createTestBusiness } from '../../test-helpers';

describe('composeCatalogText', () => {
  let biz: { id: string };
  beforeAll(async () => {
    biz = await createTestBusiness({ name: 'Catalog Share Biz' });
    // in-stock product
    const p1 = await prisma.product.create({ data: { businessId: biz.id, clientId: `p1-${Date.now()}`, name: 'Maize Meal', sellPriceCents: 4999, costPriceCents: 3000, status: 'ACTIVE' } });
    await prisma.stockMovement.create({ data: { businessId: biz.id, clientId: `m1-${Date.now()}`, productId: p1.id, type: 'OPENING', qtyDelta: 10, occurredAt: new Date() } });
    // out-of-stock product (no movements -> sum 0)
    await prisma.product.create({ data: { businessId: biz.id, clientId: `p2-${Date.now()}`, name: 'Sugar 2kg', sellPriceCents: 2550, costPriceCents: 1500, status: 'ACTIVE' } });
    // archived product (excluded)
    await prisma.product.create({ data: { businessId: biz.id, clientId: `p3-${Date.now()}`, name: 'Old SKU', sellPriceCents: 100, status: 'ARCHIVED' } });
  });

  it('formats ZAR, includes out-of-stock flagged, excludes archived, never shows cost', async () => {
    const text = await composeCatalogText(biz.id);
    expect(text).toContain('Maize Meal — R49.99');
    expect(text).toContain('Sugar 2kg — R25.50 (out of stock)');
    expect(text).not.toContain('Old SKU');
    // cost values must never appear
    expect(text).not.toContain('30.00');
    expect(text).not.toContain('15.00');
    expect(text).not.toContain('3000');
    expect(text).not.toContain('1500');
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-catalog-share.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composer.** `server/src/services/whatsapp-catalog-share.service.ts`:

```ts
import { prisma } from '../db'; // adjust to the project's prisma import

function formatZar(cents: number): string {
  const rands = Math.floor(cents / 100);
  const cc = String(cents % 100).padStart(2, '0');
  return `R${rands}.${cc}`;
}

/** Plain-text catalog for WhatsApp. ACTIVE only; out-of-stock included+flagged; cost NEVER read. */
export async function composeCatalogText(businessId: string, productIds?: string[]): Promise<string> {
  const products = await prisma.product.findMany({
    where: {
      businessId,
      status: 'ACTIVE',
      ...(productIds && productIds.length ? { id: { in: productIds } } : {}),
    },
    // explicit select: cost is intentionally NOT selected (Condition 2)
    select: { id: true, name: true, sellPriceCents: true },
    orderBy: { createdAt: 'asc' },
  });
  if (products.length === 0) return 'No products available.';

  const stock = await prisma.stockMovement.groupBy({
    by: ['productId'],
    where: { businessId, productId: { in: products.map((p) => p.id) } },
    _sum: { qtyDelta: true },
  });
  const stockByProduct = new Map(stock.map((s) => [s.productId, s._sum.qtyDelta ?? 0]));

  const lines = products.map((p) => {
    const qty = stockByProduct.get(p.id) ?? 0;
    const flag = qty <= 0 ? ' (out of stock)' : '';
    return `• ${p.name} — ${formatZar(p.sellPriceCents)}${flag}`;
  });
  return lines.join('\n');
}
```

> Implementer note: `stockMovement.productId` is nullable in the schema groupBy types; `as any` is acceptable on the `by` array if TS complains, OR filter `s.productId` non-null when building the map.

- [ ] **Step 4: Run the service test to confirm it passes.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-catalog-share.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test.** In `whatsapp.routes.test.ts`:

```ts
it('shares a catalog into a conversation (whatsapp:send)', async () => {
  // biz + ACTIVE product + a sandbox channel + conversation set up in the suite
  const r = await app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${convA.id}/share-catalog`,
    headers: { ...authHeader(ownerToken), 'content-type': 'application/json' },
    payload: { sendClass: 'TRANSACTIONAL' },
  });
  expect(r.statusCode).toBe(200);
  // an OUTBOUND TEXT message was created
  const msg = await prisma.message.findFirst({ where: { conversationId: convA.id, direction: 'OUTBOUND' }, orderBy: { createdAt: 'desc' } });
  expect(msg!.type).toBe('TEXT');
  expect(msg!.body).toContain('—');
});
```

- [ ] **Step 6: Add the route.** In `whatsapp.routes.ts`, alongside the existing conversation routes, add:

```ts
import { composeCatalogText } from '../../services/whatsapp-catalog-share.service';
import { sendWhatsAppMessage } from '../../services/whatsapp-send.service';

const ShareCatalogBody = z.object({
  productIds: z.array(z.string().min(1)).optional(),
  sendClass: z.enum(['TRANSACTIONAL', 'MARKETING']),
});

app.post(
  '/v1/businesses/:businessId/whatsapp/conversations/:id/share-catalog',
  {
    preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:send' })],
    schema: { body: ShareCatalogBody },
  },
  async (req) => {
    const { businessId, id } = req.params as { businessId: string; id: string };
    const body = req.body as z.infer<typeof ShareCatalogBody>;
    // tenant-validate the conversation (fail-closed, M3-A pattern)
    const conv = await prisma.conversation.findUnique({ where: { id } });
    if (!conv || conv.businessId !== businessId) throw new NotFoundError('Conversation not found');

    const text = await composeCatalogText(businessId, body.productIds);
    const result = await sendWhatsAppMessage(businessId, id, {
      type: 'TEXT',
      sendClass: body.sendClass,
      body: text,
    });
    if (result.error) return okEnvelope({ message: result.message, error: result.error });
    return okEnvelope({ message: result.message });
  },
);
```

> Implementer note: `prisma`, `NotFoundError`, `okEnvelope`, and `z` are already imported in `whatsapp.routes.ts` (the existing conversation routes use them).

- [ ] **Step 7: Run the route test + OpenAPI drift.**

Run: `cd server && npx vitest run src/routes/v1/__tests__/whatsapp.routes.test.ts && npm run openapi:check`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add server/src/services/whatsapp-catalog-share.service.ts server/src/routes/v1/whatsapp.routes.ts server/src/services/__tests__/whatsapp-catalog-share.service.test.ts server/src/routes/v1/__tests__/whatsapp.routes.test.ts server/openapi* 2>/dev/null
git commit -m "feat(m3b): catalog-share composer + route, sell-price only (ADR-INY-023, Conditions 2/4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Auto-reply rule CRUD routes (RBAC + validation + audit)

**Files:**
- Modify: `server/src/routes/v1/whatsapp.routes.ts`
- Test: `whatsapp.routes.test.ts` (add cases)

**Interfaces:**
- Consumes: `whatsapp:read` (list), `whatsapp:manage_autoreply` (create/update/delete); `auditLog` + `buildAuditContext`.
- Produces:
  - `GET /v1/businesses/:businessId/whatsapp/auto-reply-rules` (`whatsapp:read`)
  - `POST /v1/businesses/:businessId/whatsapp/auto-reply-rules` (`whatsapp:manage_autoreply`)
  - `PATCH /v1/businesses/:businessId/whatsapp/auto-reply-rules/:id` (`whatsapp:manage_autoreply`)
  - `DELETE /v1/businesses/:businessId/whatsapp/auto-reply-rules/:id` (`whatsapp:manage_autoreply`)
  - Body validation: `KEYWORD` trigger requires `keyword`; `OUT_OF_HOURS` requires `hoursStart` + `hoursEnd`; `SEND_TEXT` action requires `replyText`. `daysActive` is ISO 1=Mon..7=Sun (each 1–7); `[]` = every day.

- [ ] **Step 1: Write the failing tests.** In `whatsapp.routes.test.ts`:

```ts
describe('auto-reply rule CRUD', () => {
  it('owner creates a KEYWORD rule', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/whatsapp/auto-reply-rules`,
      headers: { ...authHeader(ownerToken), 'content-type': 'application/json' },
      payload: { trigger: 'KEYWORD', keyword: 'hours', action: 'SEND_TEXT', replyText: 'We are open 9-5', enabled: true },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().data.rule.keyword).toBe('hours');
  });

  it('rejects a KEYWORD rule with no keyword', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/whatsapp/auto-reply-rules`,
      headers: { ...authHeader(ownerToken), 'content-type': 'application/json' },
      payload: { trigger: 'KEYWORD', action: 'SEND_TEXT', replyText: 'x' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('staff cannot create a rule (403)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${bizA.id}/whatsapp/auto-reply-rules`,
      headers: { ...authHeader(staffToken), 'content-type': 'application/json' },
      payload: { trigger: 'GREETING', action: 'SEND_TEXT', replyText: 'Hi' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('staff can list rules (whatsapp:read)', async () => {
    const r = await app.inject({ method: 'GET', url: `/v1/businesses/${bizA.id}/whatsapp/auto-reply-rules`, headers: authHeader(staffToken) });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.json().data.rules)).toBe(true);
  });
});
```

> Implementer note: ensure the suite mints a `staffToken` for a `MERCHANT_STAFF` membership in `bizA`.

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/routes/v1/__tests__/whatsapp.routes.test.ts`
Expected: FAIL — routes do not exist.

- [ ] **Step 3: Add the Zod body + cross-field refinement** in `whatsapp.routes.ts`:

```ts
const AutoReplyRuleBody = z
  .object({
    channelId: z.string().min(1).nullable().optional(),
    trigger: z.enum(['GREETING', 'KEYWORD', 'OUT_OF_HOURS']),
    enabled: z.boolean().optional(),
    keyword: z.string().min(1).nullable().optional(),
    action: z.enum(['SEND_TEXT', 'SHARE_CATALOG']),
    replyText: z.string().min(1).nullable().optional(),
    hoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    hoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    daysActive: z.array(z.number().int().min(1).max(7)).optional(),
    cooldownMinutes: z.number().int().min(0).optional(),
  })
  .refine((v) => v.trigger !== 'KEYWORD' || !!v.keyword, { message: 'keyword required for KEYWORD trigger', path: ['keyword'] })
  .refine((v) => v.trigger !== 'OUT_OF_HOURS' || (!!v.hoursStart && !!v.hoursEnd), { message: 'hoursStart+hoursEnd required for OUT_OF_HOURS', path: ['hoursStart'] })
  .refine((v) => v.action !== 'SEND_TEXT' || !!v.replyText, { message: 'replyText required for SEND_TEXT', path: ['replyText'] });

const AutoReplyRulePatchBody = AutoReplyRuleBody.partial ? z.object({}) : z.object({}); // placeholder — see Step 4
```

> Note: `.refine()` returns a `ZodEffects` which has no `.partial()`. For PATCH, define a separate plain partial object schema (Step 4) — do not call `.partial()` on the refined schema.

- [ ] **Step 4: Define the PATCH body** (plain partial, no cross-field refinement so partial updates are allowed):

```ts
const AutoReplyRulePatchBody = z.object({
  channelId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  keyword: z.string().min(1).nullable().optional(),
  replyText: z.string().min(1).nullable().optional(),
  hoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  hoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  daysActive: z.array(z.number().int().min(1).max(7)).optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
});
```

- [ ] **Step 5: Add the four routes:**

```ts
app.get(
  '/v1/businesses/:businessId/whatsapp/auto-reply-rules',
  { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:read' })] },
  async (req) => {
    const { businessId } = req.params as { businessId: string };
    const rules = await prisma.whatsAppAutoReplyRule.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
    return okEnvelope({ rules });
  },
);

app.post(
  '/v1/businesses/:businessId/whatsapp/auto-reply-rules',
  { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_autoreply' })], schema: { body: AutoReplyRuleBody } },
  async (req, reply) => {
    const { businessId } = req.params as { businessId: string };
    const body = req.body as z.infer<typeof AutoReplyRuleBody>;
    const rule = await prisma.whatsAppAutoReplyRule.create({
      data: {
        businessId,
        channelId: body.channelId ?? null,
        trigger: body.trigger,
        enabled: body.enabled ?? false,
        keyword: body.keyword ?? null,
        action: body.action,
        replyText: body.replyText ?? null,
        hoursStart: body.hoursStart ?? null,
        hoursEnd: body.hoursEnd ?? null,
        daysActive: body.daysActive ?? [],
        ...(body.cooldownMinutes !== undefined ? { cooldownMinutes: body.cooldownMinutes } : {}),
      },
    });
    await auditLog({ ...buildAuditContext(req), userId: req.user!.sub, businessId, entity: 'whatsapp_auto_reply_rule', action: 'CREATE', entityId: rule.id, changes: { trigger: { old: null, new: rule.trigger }, action: { old: null, new: rule.action } } });
    void reply.code(201);
    return okEnvelope({ rule });
  },
);

app.patch(
  '/v1/businesses/:businessId/whatsapp/auto-reply-rules/:id',
  { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_autoreply' })], schema: { body: AutoReplyRulePatchBody } },
  async (req) => {
    const { businessId, id } = req.params as { businessId: string; id: string };
    const existing = await prisma.whatsAppAutoReplyRule.findUnique({ where: { id } });
    if (!existing || existing.businessId !== businessId) throw new NotFoundError('Rule not found');
    const body = req.body as z.infer<typeof AutoReplyRulePatchBody>;
    const rule = await prisma.whatsAppAutoReplyRule.update({ where: { id }, data: body });
    await auditLog({ ...buildAuditContext(req), userId: req.user!.sub, businessId, entity: 'whatsapp_auto_reply_rule', action: 'UPDATE', entityId: rule.id, changes: { enabled: { old: existing.enabled, new: rule.enabled } } });
    return okEnvelope({ rule });
  },
);

app.delete(
  '/v1/businesses/:businessId/whatsapp/auto-reply-rules/:id',
  { preHandler: [app.authenticate, app.requirePermission({ permission: 'whatsapp:manage_autoreply' })] },
  async (req) => {
    const { businessId, id } = req.params as { businessId: string; id: string };
    const existing = await prisma.whatsAppAutoReplyRule.findUnique({ where: { id } });
    if (!existing || existing.businessId !== businessId) throw new NotFoundError('Rule not found');
    await prisma.whatsAppAutoReplyRule.delete({ where: { id } });
    await auditLog({ ...buildAuditContext(req), userId: req.user!.sub, businessId, entity: 'whatsapp_auto_reply_rule', action: 'DELETE', entityId: id, changes: {} });
    return okEnvelope({ deleted: true });
  },
);
```

> Implementer note: `auditLog` + `buildAuditContext` are imported in `commerce.routes.ts`; add the same imports to `whatsapp.routes.ts` if not present.

- [ ] **Step 6: Run the tests + OpenAPI drift.**

Run: `cd server && npx vitest run src/routes/v1/__tests__/whatsapp.routes.test.ts && npm run openapi:check`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add server/src/routes/v1/whatsapp.routes.ts server/src/routes/v1/__tests__/whatsapp.routes.test.ts server/openapi* 2>/dev/null
git commit -m "feat(m3b): auto-reply rule CRUD (owner-only writes, validation, audit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Auto-reply evaluator service (deterministic; Conditions 4, 6, 7) — provably non-AI

**Files:**
- Create: `server/src/services/whatsapp-autoreply.service.ts`
- Test: `server/src/services/__tests__/whatsapp-autoreply.service.test.ts`

**Interfaces:**
- Consumes: `sendWhatsAppMessage` (Task 9); `composeCatalogText` (Task 10); `auditLog`; `prisma`.
- Produces: `evaluateAutoReplies(businessId: string, conversation: Conversation, message: Message): Promise<void>` — pure deterministic logic, ZERO `lib/ai`. It:
  1. returns immediately unless `message.direction === 'INBOUND'` and `message.type ∈ {'TEXT','INTERACTIVE'}` (Condition 7);
  2. loads enabled rules for the business scoped to the conversation's channel (`channelId === null` OR `channelId === conversation.channelId`);
  3. for each matching rule, checks the cooldown via prior `(whatsapp_autoreply, FIRE)` audit entries for this conversation + trigger within `cooldownMinutes`;
  4. on fire, dispatches the reply via `sendWhatsAppMessage` (TRANSACTIONAL TEXT) and emits `(whatsapp_autoreply, FIRE)`; on cooldown-suppress or a send error, emits `(whatsapp_autoreply, SUPPRESSED)`.

**Cooldown source (implementation decision — flag to bukani-docs):** the contract §6.3 phrases the cooldown as "a prior OUTBOUND auto-reply of the same trigger in the Message ledger." Since the contract also forbids any schema change beyond the two in Task 1 (no marker column on `Message`), we derive the cooldown from the **append-only audit ledger** — the `(whatsapp_autoreply, FIRE)` entries Condition 6 already requires — keyed by `entityId = conversation.id` and `changes.trigger`. This is functionally equivalent (append-only, auditable, no counter table) and needs no extra schema. Record this as a one-line contract refinement for bukani-docs.

- [ ] **Step 1: Write the failing tests.** `server/src/services/__tests__/whatsapp-autoreply.service.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { prisma } from '../../db';
import { createTestBusiness } from '../../test-helpers';
import { evaluateAutoReplies } from '../whatsapp-autoreply.service';
import * as sendSvc from '../whatsapp-send.service';

describe('evaluateAutoReplies', () => {
  let biz: { id: string };
  let channel: { id: string };
  let conv: any;

  beforeAll(async () => {
    biz = await createTestBusiness({ name: 'AutoReply Biz' });
    channel = await prisma.whatsAppChannel.create({ data: { businessId: biz.id } as any });
    conv = await prisma.conversation.create({ data: { businessId: biz.id, channelId: channel.id, waContactId: '27827770000' } });
    await prisma.whatsAppAutoReplyRule.create({
      data: { businessId: biz.id, trigger: 'KEYWORD', keyword: 'price', action: 'SEND_TEXT', replyText: 'Prices on request', enabled: true, cooldownMinutes: 60 },
    });
  });

  function inbound(body: string, type: 'TEXT' | 'INTERACTIVE' = 'TEXT', direction: 'INBOUND' | 'OUTBOUND' = 'INBOUND') {
    return { id: 'm', businessId: biz.id, conversationId: conv.id, direction, type, body, occurredAt: new Date() } as any;
  }

  it('ignores OUTBOUND messages (Condition 7)', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, inbound('price', 'TEXT', 'OUTBOUND'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ignores non-TEXT/INTERACTIVE types (Condition 7)', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, { ...inbound('x'), type: 'IMAGE' } as any);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('fires on an exact keyword match and emits a FIRE audit', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, inbound('PRICE'));
    expect(spy).toHaveBeenCalledTimes(1);
    const fire = await prisma.auditLog.findFirst({ where: { businessId: biz.id, entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conv.id } });
    expect(fire).toBeTruthy();
    spy.mockRestore();
  });

  it('suppresses a re-fire inside the cooldown window', async () => {
    const spy = vi.spyOn(sendSvc, 'sendWhatsAppMessage').mockResolvedValue({ message: {} } as any);
    await evaluateAutoReplies(biz.id, conv, inbound('price')); // FIRE already present from prior test
    expect(spy).not.toHaveBeenCalled();
    const supp = await prisma.auditLog.findFirst({ where: { businessId: biz.id, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conv.id } });
    expect(supp).toBeTruthy();
    spy.mockRestore();
  });
});
```

> Implementer note: `vi.spyOn` requires the route/service to call `sendWhatsAppMessage` via the module namespace import for the spy to intercept. If the evaluator imports it as a named binding, the spy won't catch it — import the send service as `import * as sendSvc` in the evaluator OR structure the test to assert on the created OUTBOUND `Message` row instead of the spy. Prefer asserting on the audit log (deterministic, import-style-agnostic).

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-autoreply.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the evaluator.** `server/src/services/whatsapp-autoreply.service.ts`:

```ts
import type { Conversation, Message, WhatsAppAutoReplyRule } from '@prisma/client';
import { prisma } from '../db';
import { auditLog } from '../lib/audit-logger'; // adjust to project path
import { sendWhatsAppMessage } from './whatsapp-send.service';
import { composeCatalogText } from './whatsapp-catalog-share.service';

// NOTE: This module is provably non-AI. It MUST NOT import or reference lib/ai (Condition 6c, CI-grepped).

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** SAST (UTC+2, no DST) calendar parts of an instant. */
function sastParts(d: Date): { minutes: number; isoWeekday: number } {
  const fmt = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  const minute = Number(parts.find((p) => p.type === 'minute')!.value);
  const wdShort = parts.find((p) => p.type === 'weekday')!.value;
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { minutes: hour * 60 + minute, isoWeekday: map[wdShort] ?? 1 };
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function matchesTrigger(rule: WhatsAppAutoReplyRule, message: Message, now: Date): boolean {
  if (rule.trigger === 'GREETING') return true; // any inbound text; cooldown gates re-fire
  if (rule.trigger === 'KEYWORD') return !!rule.keyword && normalizeText(message.body) === normalizeText(rule.keyword);
  if (rule.trigger === 'OUT_OF_HOURS') {
    if (!rule.hoursStart || !rule.hoursEnd) return false;
    const { minutes, isoWeekday } = sastParts(now);
    const dayActive = rule.daysActive.length === 0 || rule.daysActive.includes(isoWeekday);
    if (!dayActive) return false;
    const start = hhmmToMinutes(rule.hoursStart);
    const end = hhmmToMinutes(rule.hoursEnd);
    const open = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    return !open; // out-of-hours = OUTSIDE the open window
  }
  return false;
}

async function inCooldown(conversationId: string, trigger: string, cooldownMinutes: number, now: Date): Promise<boolean> {
  if (cooldownMinutes <= 0) return false;
  const since = new Date(now.getTime() - cooldownMinutes * 60_000);
  const prior = await prisma.auditLog.findFirst({
    where: {
      entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conversationId, createdAt: { gte: since },
      changes: { path: ['trigger'], equals: trigger },
    },
  });
  return !!prior;
}

export async function evaluateAutoReplies(businessId: string, conversation: Conversation, message: Message): Promise<void> {
  // Condition 7: only inbound TEXT/INTERACTIVE drives auto-replies.
  if (message.direction !== 'INBOUND') return;
  if (message.type !== 'TEXT' && message.type !== 'INTERACTIVE') return;

  const rules = await prisma.whatsAppAutoReplyRule.findMany({
    where: { businessId, enabled: true, OR: [{ channelId: null }, { channelId: conversation.channelId }] },
  });
  if (rules.length === 0) return;

  const now = message.occurredAt;
  for (const rule of rules) {
    if (!matchesTrigger(rule, message, now)) continue;

    if (await inCooldown(conversation.id, rule.trigger, rule.cooldownMinutes, now)) {
      await auditLog({ businessId, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conversation.id, changes: { trigger: { old: null, new: rule.trigger }, reason: { old: null, new: 'cooldown' } } });
      continue;
    }

    const text = rule.action === 'SHARE_CATALOG' ? await composeCatalogText(businessId) : (rule.replyText ?? '');
    try {
      await sendWhatsAppMessage(businessId, conversation.id, { type: 'TEXT', sendClass: 'TRANSACTIONAL', body: text });
      await auditLog({ businessId, entity: 'whatsapp_autoreply', action: 'FIRE', entityId: conversation.id, changes: { trigger: { old: null, new: rule.trigger }, action: { old: null, new: rule.action } } });
    } catch (err) {
      await auditLog({ businessId, entity: 'whatsapp_autoreply', action: 'SUPPRESSED', entityId: conversation.id, changes: { trigger: { old: null, new: rule.trigger }, reason: { old: null, new: 'send_error' } } });
    }
  }
}
```

> Implementer note: confirm the `auditLog` signature and import path against `commerce.routes.ts`'s usage. The `changes` JSON-path cooldown query (`changes: { path: ['trigger'], equals: trigger }`) is Postgres JSON filtering — if the audit `changes` shape stores the trigger differently, adjust the query to match what the FIRE entry writes. Keep the FIRE `changes` and the cooldown query in sync.

- [ ] **Step 4: Run the tests to confirm they pass.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-autoreply.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/services/whatsapp-autoreply.service.ts server/src/services/__tests__/whatsapp-autoreply.service.test.ts
git commit -m "feat(m3b): deterministic non-AI auto-reply evaluator (Conditions 4/6/7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Wire the evaluator into the inbound drain path (Conditions 7, 9)

**Files:**
- Modify: `server/src/services/whatsapp-ingest.service.ts`
- Test: `server/src/services/__tests__/whatsapp-ingest.service.test.ts` (add cases)

**Interfaces:**
- Consumes: `evaluateAutoReplies` (Task 12).
- Produces: in `processInboundEvent`, after persisting inbound messages, the evaluator runs ONLY for messages that were genuinely newly inserted (not redeliveries) and only for `TEXT`/`INTERACTIVE`. A redelivered inbound (same `providerMessageId`) triggers nothing (Condition 9).

- [ ] **Step 1: Write the failing test.** In `whatsapp-ingest.service.test.ts`:

```ts
it('runs the auto-reply evaluator once for a new inbound TEXT, never on redelivery (Conditions 7/9)', async () => {
  // set up biz + sandbox channel + an enabled GREETING rule
  // first delivery -> exactly one FIRE
  await processInboundEvent(/* event with a new inbound TEXT, providerMessageId 'pm-1' */);
  const after1 = await prisma.auditLog.count({ where: { businessId: biz.id, entity: 'whatsapp_autoreply', action: 'FIRE' } });
  expect(after1).toBe(1);
  // redeliver the SAME providerMessageId -> no new FIRE
  await processInboundEvent(/* same event, providerMessageId 'pm-1' */);
  const after2 = await prisma.auditLog.count({ where: { businessId: biz.id, entity: 'whatsapp_autoreply', action: 'FIRE' } });
  expect(after2).toBe(1);
});
```

> Implementer note: shape the event payload to match what `processInboundEvent` already consumes in the existing M3-A ingest tests; mock or sandbox `sendWhatsAppMessage` as in Task 12.

- [ ] **Step 2: Run to confirm failure.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-ingest.service.test.ts`
Expected: FAIL — evaluator not wired.

- [ ] **Step 3: Detect genuinely-new inbound messages.** In `processInboundEvent`, before the existing `createMany({ ..., skipDuplicates: true })`, compute which provider message ids already exist:

```ts
const incomingProviderIds = inboundRows.map((r) => r.providerMessageId).filter((x): x is string => !!x);
const existing = incomingProviderIds.length
  ? await prisma.message.findMany({ where: { businessId, providerMessageId: { in: incomingProviderIds } }, select: { providerMessageId: true } })
  : [];
const existingSet = new Set(existing.map((e) => e.providerMessageId));
```
(`inboundRows` is the array you build for `createMany` — rename to match the existing variable.)

- [ ] **Step 4: After `createMany`, run the evaluator for the new TEXT/INTERACTIVE rows.** Add after the existing `createMany`:

```ts
const newInbound = inboundRows.filter((r) => r.direction === 'INBOUND' && r.providerMessageId && !existingSet.has(r.providerMessageId) && (r.type === 'TEXT' || r.type === 'INTERACTIVE'));
for (const row of newInbound) {
  const persisted = await prisma.message.findUnique({ where: { businessId_providerMessageId: { businessId, providerMessageId: row.providerMessageId! } } });
  if (persisted) {
    try {
      await evaluateAutoReplies(businessId, conversation, persisted);
    } catch (err) {
      // auto-reply failures must never break inbound ingestion
    }
  }
}
```
and import at the top:
```ts
import { evaluateAutoReplies } from './whatsapp-autoreply.service';
```

> Implementer note: `conversation` is the row produced by `upsertConversation()` earlier in `processInboundEvent`. Reuse that variable. The `businessId_providerMessageId` compound unique matches the schema's `@@unique([businessId, providerMessageId])`.

- [ ] **Step 5: Run the test to confirm it passes.**

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-ingest.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/src/services/whatsapp-ingest.service.ts server/src/services/__tests__/whatsapp-ingest.service.test.ts
git commit -m "feat(m3b): trigger auto-reply evaluator on new inbound only (Conditions 7/9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: CI grep assertion — auto-reply module is provably non-AI (Condition 6c)

**Files:**
- Create: `server/src/services/__tests__/whatsapp-autoreply-no-ai.test.ts`

**Interfaces:**
- Consumes: the source file `server/src/services/whatsapp-autoreply.service.ts`.
- Produces: a test that fails if the auto-reply module ever imports/references `lib/ai` (or `@anthropic-ai/sdk`).

- [ ] **Step 1: Write the test.** `server/src/services/__tests__/whatsapp-autoreply-no-ai.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Condition 6c: auto-reply module is provably non-AI', () => {
  it('does not reference lib/ai or the Anthropic SDK', () => {
    const src = readFileSync(resolve(__dirname, '../whatsapp-autoreply.service.ts'), 'utf8');
    expect(src).not.toMatch(/lib\/ai/);
    expect(src).not.toMatch(/@anthropic-ai\/sdk/);
    expect(src).not.toMatch(/\bai\.(complete|chat|generate|run|invoke)\b/);
  });
});
```

- [ ] **Step 2: Run it to confirm it passes** (the module from Task 12 is clean).

Run: `cd server && npx vitest run src/services/__tests__/whatsapp-autoreply-no-ai.test.ts`
Expected: PASS.

- [ ] **Step 3: Sanity-check the assertion fails when violated** (temporary): add a comment `// lib/ai` to the top of `whatsapp-autoreply.service.ts`, re-run the test, confirm FAIL, then remove the comment and confirm PASS again. (Do not commit the temporary line.)

- [ ] **Step 4: Commit.**

```bash
git add server/src/services/__tests__/whatsapp-autoreply-no-ai.test.ts
git commit -m "test(m3b): CI assertion that auto-reply module never imports lib/ai (Condition 6c)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: End-to-end replay/idempotency chain QA test (Condition 9)

**Files:**
- Create: `server/src/__tests__/m3b-capture-replay.test.ts`

**Interfaces:**
- Consumes: the full inbound→capture chain (Tasks 5–8, 13).
- Produces: a test proving that capturing the same WhatsApp order twice (same `clientId`, e.g. a sync redelivery) yields exactly ONE Order and exactly ONE set of SALE `StockMovement` rows.

- [ ] **Step 1: Write the test.** `server/src/__tests__/m3b-capture-replay.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../db';
import { createTestBusiness } from '../test-helpers';
import { createOrder } from '../services/order.service';

describe('Condition 9: WhatsApp capture is idempotent on replay', () => {
  let biz: { id: string };
  let product: { id: string };
  let conv: any;

  beforeAll(async () => {
    biz = await createTestBusiness({ name: 'Replay Biz' });
    product = await prisma.product.create({ data: { businessId: biz.id, clientId: `p-${Date.now()}`, name: 'Bread', sellPriceCents: 1800, status: 'ACTIVE' } });
    const channel = await prisma.whatsAppChannel.create({ data: { businessId: biz.id } as any });
    conv = await prisma.conversation.create({ data: { businessId: biz.id, channelId: channel.id, waContactId: '27828880000' } });
  });

  it('redelivered capture -> exactly one Order, one set of SALE movements', async () => {
    const clientId = `replay-${Date.now()}`;
    const args = { businessId: biz.id, clientId, channel: 'WHATSAPP' as const, conversationId: conv.id, status: 'COMPLETED' as const, lines: [{ productId: product.id, qty: 2 }] };

    const first = await createOrder(args);
    const second = await createOrder(args); // replay

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.order.id).toBe(first.order.id);

    const orders = await prisma.order.findMany({ where: { businessId: biz.id, clientId } });
    expect(orders).toHaveLength(1);

    const sales = await prisma.stockMovement.findMany({ where: { businessId: biz.id, orderId: first.order.id, type: 'SALE' } });
    expect(sales).toHaveLength(1); // one line -> one SALE movement
    expect(sales[0].qtyDelta).toBe(-2);

    // exactly one customer auto-created (deterministic clientId wa:<conversationId>)
    const customers = await prisma.customer.findMany({ where: { businessId: biz.id, clientId: `wa:${conv.id}` } });
    expect(customers).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it passes.**

Run: `cd server && npx vitest run src/__tests__/m3b-capture-replay.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the full server suite to confirm no regressions.**

Run: `cd server && npm test`
Expected: PASS (all suites).

- [ ] **Step 4: Commit.**

```bash
git add server/src/__tests__/m3b-capture-replay.test.ts
git commit -m "test(m3b): end-to-end capture replay/idempotency chain (Condition 9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Condition → Task traceability

| Condition (THREAT-MODEL §8) | Where closed |
|---|---|
| 1 — capture tenant-validates conversation + customer | Task 5 (write), Task 7 (online), Task 8 (sync) |
| 2 — RBAC cost-split holds on every M3-B surface (hide not zero) | Task 2 (perm), Task 10 (sell-price-only composer), Task 11 (owner-only writes); verified in Task 16 below |
| 3 — PII masked in logs / stored display names | Task 4 (mask util), Task 6 (masked customer name) |
| 4 — all outbound funnels through `sendWhatsAppMessage` (consent + window + enabled gate) | Task 9 (ctx), Task 10 (share), Task 12 (auto-reply) |
| 5 — customer-aware consent seam | Task 9 |
| 6 — auto-reply emits FIRE/SUPPRESSED audit | Task 12 |
| 6c — auto-reply provably non-AI (CI grep) | Task 14 |
| 7 — auto-reply fires only on INBOUND TEXT/INTERACTIVE | Task 12 (guard), Task 13 (trigger gating) |
| 8 — sync payload typed/validated (closes finding #4) | Task 8 |
| 9 — inbound→capture replay idempotent | Task 13 (new-only trigger), Task 15 (E2E proof) |
| finding #3 — createOrder customerId tenant check | Task 5 |

---

## Task 16: Cost-split verification across M3-B surfaces (Condition 2 — verification)

**Files:**
- Test: `server/src/routes/v1/__tests__/whatsapp.routes.test.ts` (add cases)

**Interfaces:**
- Consumes: the share-catalog route (Task 10) and the products list masking (existing M2 behaviour).
- Produces: tests proving a `MERCHANT_STAFF` never sees `costPriceCents` on any M3-B surface, and that the shared catalog text contains no cost figure.

- [ ] **Step 1: Write the verification tests.** In `whatsapp.routes.test.ts`:

```ts
it('shared catalog text never contains a cost value (Condition 2)', async () => {
  // product with a distinctive cost
  const p = await prisma.product.create({ data: { businessId: bizA.id, clientId: `cs-${Date.now()}`, name: 'CostCheck', sellPriceCents: 9999, costPriceCents: 4242, status: 'ACTIVE' } });
  await prisma.stockMovement.create({ data: { businessId: bizA.id, clientId: `csm-${Date.now()}`, productId: p.id, type: 'OPENING', qtyDelta: 5, occurredAt: new Date() } });
  const r = await app.inject({
    method: 'POST',
    url: `/v1/businesses/${bizA.id}/whatsapp/conversations/${convA.id}/share-catalog`,
    headers: { ...authHeader(staffToken), 'content-type': 'application/json' },
    payload: { sendClass: 'TRANSACTIONAL', productIds: [p.id] },
  });
  expect(r.statusCode).toBe(200);
  const msg = await prisma.message.findFirst({ where: { conversationId: convA.id, direction: 'OUTBOUND' }, orderBy: { createdAt: 'desc' } });
  expect(msg!.body).toContain('R99.99');
  expect(msg!.body).not.toContain('42.42');
  expect(msg!.body).not.toContain('4242');
});
```

> Note: staff has `whatsapp:send`, so staff CAN share a catalog — the point is the catalog text itself carries no cost, regardless of who sends it.

- [ ] **Step 2: Run + full suite.**

Run: `cd server && npx vitest run src/routes/v1/__tests__/whatsapp.routes.test.ts && npm test`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add server/src/routes/v1/__tests__/whatsapp.routes.test.ts
git commit -m "test(m3b): verify cost never leaks via shared catalog (Condition 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final checks (after all tasks)

- [ ] `cd server && npm run typecheck` — PASS
- [ ] `cd server && npm run lint` — PASS
- [ ] `cd server && npm test` — PASS (all suites)
- [ ] `cd server && npm run openapi:check` — PASS (new routes reflected, spec snapshot committed if the check writes one)
- [ ] Docs are owned by **bukani-docs** (post-merge): `docs/API.md` (new routes + changed bodies), `docs/SCHEMA.md` (`Order.conversationId`, `WhatsAppAutoReplyRule`, enums), `docs/DECISIONS.md` (note the cooldown-via-audit-ledger refinement to ADR-INY-022/§6.3). Do NOT hand-edit these in this branch — flag the cooldown-source refinement to bukani-docs for the doc sync.

## Story coverage

| Story | Backend work |
|---|---|
| S1 — inbox read | M3-A (shipped); inbox/thread reads already exist — frontend is a pure client. No new backend. |
| S2 — reply-in-window | M3-A send route exists; consent ctx added in Task 9. |
| S3 — order capture from chat | Tasks 5, 6, 7, 8. |
| S4 — catalog share | Task 10. |
| S5 — deterministic non-AI auto-replies | Tasks 11, 12, 13, 14. |
| S6 — consent enforcement | Task 9. |
| S7 — order-status notifications | **No new backend surface.** Reuses the existing `POST .../conversations/:id/messages` send route (TRANSACTIONAL TEXT) through the same `sendWhatsAppMessage` choke-point; the frontend triggers it on order-status change. (Payment-status notifications are M4-deferred.) |

## Notes for the reviewer / KIMI

- **S7 has no backend task by design** — it is the existing M3-A send route used transactionally. If a future decision wants server-driven status pushes (e.g. on `Order.status` transition), that is a separate, additive task, not part of this plan.
- **Cooldown source refinement (flag to bukani-docs):** the evaluator derives the auto-reply cooldown from the append-only **audit ledger** (`whatsapp_autoreply` FIRE entries), not a `Message` marker column — because the contract forbids schema changes beyond Task 1's two additions. Functionally equivalent to the contract's "Message ledger" wording; record as a one-line contract refinement.
- **Carried gates (do NOT build):** E1 (per-tenant cost ceiling + kill switch), R1/E2 (per-customer revocation store — the *seam* lands in Task 9; the store does not), E4 (Message/Order retention period). These are tracked in `docs/THREAT-MODEL.md` §8 and the status memory.
- **`prisma` import path / `auditLog` path / error classes:** the plan uses `../db` and `../lib/audit-logger` as placeholders — match the actual project imports (see `commerce.routes.ts` and `whatsapp.routes.ts` for the canonical import lines) when implementing.
